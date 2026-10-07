import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { getJSON, setJSON, store, otpKey, otpCooldownKey, revokedKey } from '../cache.js';
import { audit } from '../audit.js';
import { httpError } from '../middleware/error.js';
import { sendSms, sendEmail } from './messaging.js';
import { t, languageFor } from '../i18n.js';

const GENERIC_OTP_MESSAGE = 'If this ID is registered, a one-time code has been sent.';

export function signToken({ type, id, role, departmentCode = null }) {
  const jti = crypto.randomUUID();
  return jwt.sign(
    { type, role, departmentCode, jti },
    config.jwtSecret,
    { subject: String(id), expiresIn: config.jwtExpiresIn }
  );
}

function actorOf({ type, id, role, departmentCode = null }) {
  return { type, id: String(id), role, departmentCode };
}

export async function requestOtp(ctx, nationalId) {
  const body = { message: GENERIC_OTP_MESSAGE };

  if (await store.get(otpCooldownKey(nationalId))) return body;
  await store.set(otpCooldownKey(nationalId), '1', config.otpCooldownSeconds);

  const citizen = await prisma.citizen.findUnique({
    where: { nationalIdNumber: nationalId },
    include: { profile: true },
  });

  if (citizen) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await setJSON(otpKey(nationalId), { code, attempts: 0 }, config.otpTtlSeconds);

    if (citizen.phone) {
      const lang = languageFor(citizen.profile);
      const text = t(lang, 'otp.sms', { code, minutes: Math.round(config.otpTtlSeconds / 60) });
      await sendSms(citizen.phone, text);
    }
    if (citizen.contactEmail) {
      const lang = languageFor(citizen.profile);
      await sendEmail(
        citizen.contactEmail,
        t(lang, 'otp.email.subject'),
        t(lang, 'otp.email.body', { code, minutes: Math.round(config.otpTtlSeconds / 60) })
      );
    }
    if (!config.isProd || config.demoMode) body.devOtp = code;
  }

  return body;
}

export async function verifyOtp(ctx, { nationalId, code }) {
  const key = otpKey(nationalId);
  const entry = await getJSON(key);
  if (!entry) throw httpError(401, 'Invalid or expired code');

  if (entry.attempts >= config.otpMaxAttempts) {
    await store.del(key);
    throw httpError(429, 'Too many attempts. Request a new code.');
  }

  const a = Buffer.from(entry.code);
  const b = Buffer.from(code);
  const matches = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!matches) {
    entry.attempts += 1;
    await setJSON(key, entry, config.otpTtlSeconds);
    throw httpError(401, 'Invalid or expired code');
  }

  await store.del(key);

  const citizen = await prisma.citizen.findUnique({
    where: { nationalIdNumber: nationalId },
  });
  if (!citizen) throw httpError(401, 'Invalid or expired code');

  await prisma.citizenProfile.upsert({
    where: { citizenId: citizen.citizenId },
    update: { lastLogin: new Date() },
    create: { citizenId: citizen.citizenId, lastLogin: new Date() },
  });

  const actor = actorOf({ type: 'CITIZEN', id: citizen.citizenId, role: 'CITIZEN' });
  await audit(ctx, { action: 'LOGIN', resourceType: 'citizen', resourceId: citizen.citizenId }, actor);

  return {
    token: signToken(actor),
    role: 'CITIZEN',
    user: {
      id: String(citizen.citizenId),
      nationalId: citizen.nationalIdNumber,
      firstName: citizen.firstName,
      lastName: citizen.lastName,
    },
  };
}

export async function staffLogin(ctx, { email, password }) {
  const staff = await prisma.staff.findUnique({
    where: { email },
    include: {
      department: true,
      staffRoles: { include: { role: true } },
    },
  });
  if (!staff) throw httpError(401, 'Invalid email or password');

  const credential = await prisma.authenticationCredential.findFirst({
    where: { staffId: staff.staffId, activeStatus: true },
  });
  const ok = credential?.credentialHash
    ? await bcrypt.compare(password, credential.credentialHash)
    : false;
  if (!ok) throw httpError(401, 'Invalid email or password');

  const roleName = staff.staffRoles[0]?.role?.roleName || 'DEPARTMENT_STAFF';
  const departmentCode = staff.department?.departmentCode ?? null;

  const actor = actorOf({
    type: 'STAFF',
    id: staff.staffId,
    role: roleName,
    departmentCode,
  });
  await audit(ctx, { action: 'LOGIN', resourceType: 'staff', resourceId: staff.staffId }, actor);

  if (credential) {
    await prisma.authenticationCredential.update({
      where: { credentialId: credential.credentialId },
      data: { lastUsed: new Date() },
    });
  }

  return {
    token: signToken(actor),
    role: roleName,
    department: departmentCode,
    user: { id: String(staff.staffId), email: staff.email, departmentCode },
  };
}

export async function logout(ctx, token) {
  const decoded = jwt.decode(token);
  if (decoded?.jti) {
    const ttl = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 3600;
    if (ttl > 0) await store.set(revokedKey(decoded.jti), '1', ttl);
  }
  return { message: 'Successfully logged out' };
}