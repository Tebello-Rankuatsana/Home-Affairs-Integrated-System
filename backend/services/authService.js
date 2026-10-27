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
const TEMPORARY_ID_TTL_DAYS = 20;

export function signToken({ type, id, role, departmentCode = null }) {
  if (!config.jwtSecret) throw new Error('JWT_SECRET is missing from .env');
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

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** Build the shape the frontend's toUser() reads. */
function citizenPayload(citizen) {
  return {
    id: String(citizen.citizenId),
    nationalId: citizen.nationalIdNumber,
    firstName: citizen.firstName,
    lastName: citizen.lastName,
    temporaryId: !!citizen.temporaryId,
    temporaryIdExpiresAt: citizen.temporaryIdExpiresAt ?? null,
    registrationStatus: citizen.registrationStatus ?? 'ACTIVE',
  };
}

/** Reject expired temp IDs on every login path. */
async function enforceTempIdFreshness(citizen) {
  if (citizen.registrationStatus === 'DISABLED') {
    throw httpError(403, 'Account disabled. Visit Home Affairs to reactivate.');
  }
  if (
    citizen.temporaryId &&
    citizen.temporaryIdExpiresAt &&
    new Date(citizen.temporaryIdExpiresAt) < new Date()
  ) {
    await prisma.citizen.update({
      where: { citizenId: citizen.citizenId },
      data: { registrationStatus: 'DISABLED' },
    });
    throw httpError(403, 'Temporary ID expired. Complete your ID application to restore access.');
  }
}

// --- Citizen Registration ---
export async function registerCitizen(ctx, data) {
  if (!data.email && !data.phone) {
    throw httpError(400, 'Provide an email address or phone number.');
  }

  let nationalIdNumber;
  let temporaryId = false;
  let temporaryIdExpiresAt = null;
  let registrationStatus = 'ACTIVE';
  let birthCertificateNumber = null;
  let placeOfBirth = null;
  let parentGuardianNames = null;

  const hasId = data.hasId !== false; // default true

  if (hasId) {
    if (!data.nationalId && !data.birthCertificateNumber) {
      throw httpError(400, 'Provide a National ID number or a Birth Certificate number.');
    }
    nationalIdNumber =
      (data.nationalId && data.nationalId.trim()) ||
      `BC-${(data.birthCertificateNumber || '').trim()}`;
    birthCertificateNumber = data.birthCertificateNumber?.trim() || null;
    placeOfBirth = data.placeOfBirth?.trim() || null;
  } else {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = String(Math.floor(Math.random() * 9000) + 1000);
    nationalIdNumber = `TMP-${stamp}-${rand}`;
    temporaryId = true;
    temporaryIdExpiresAt = new Date(
      Date.now() + TEMPORARY_ID_TTL_DAYS * 24 * 60 * 60 * 1000
    );
    registrationStatus = 'PENDING_VERIFICATION';
    placeOfBirth = data.placeOfBirth?.trim() || null;
    parentGuardianNames = data.parentGuardianNames?.trim() || null;
  }

  const clash = await prisma.citizen.findUnique({ where: { nationalIdNumber } });
  if (clash) throw httpError(409, 'An account with that ID already exists.');

  const passwordHash = await bcrypt.hash(data.password, 10);
  const answerHash = data.securityAnswer
    ? await bcrypt.hash(String(data.securityAnswer).trim().toLowerCase(), 10)
    : null;
  const { firstName, lastName } = splitName(data.fullName);

  const citizen = await prisma.citizen.create({
    data: {
      nationalIdNumber,
      firstName: firstName || 'Unknown',
      lastName: lastName || 'Unknown',
      dateOfBirth: new Date(`${data.dateOfBirth}T00:00:00.000Z`),
      gender: 'UNSPECIFIED',
      citizenshipStatus: 'Lesotho',
      contactEmail: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      temporaryId,
      temporaryIdExpiresAt,
      registrationStatus,
      birthCertificateNumber,
      placeOfBirth,
      parentGuardianNames,
      securityQuestion: data.securityQuestion || null,
      securityAnswerHash: answerHash,
      passwordSet: true,
      profile: {
        create: { preferredLanguage: 'en', accountStatus: 'ACTIVE' },
      },
      credentials: {
        create: {
          credentialType: 'PASSWORD',
          credentialHash: passwordHash,
          activeStatus: true,
        },
      },
    },
  });

  const actor = actorOf({ type: 'CITIZEN', id: citizen.citizenId, role: 'CITIZEN' });
  await audit(
    ctx,
    {
      action: 'CITIZEN_REGISTERED_SELF',
      resourceType: 'citizen',
      resourceId: citizen.citizenId,
      details: { temporaryId, nationalIdNumber },
    },
    actor
  );

  return {
    token: signToken(actor),
    role: 'CITIZEN',
    department: null,
    user: citizenPayload(citizen),
  };
}

// --- Citizen Password Login ---
export async function citizenLogin(ctx, { nationalId, password }) {
  const citizen = await prisma.citizen.findUnique({
    where: { nationalIdNumber: nationalId },
  });
  if (!citizen || !citizen.passwordSet) {
    throw httpError(401, 'Invalid National ID or password');
  }

  const credential = await prisma.authenticationCredential.findFirst({
    where: {
      citizenId: citizen.citizenId,
      credentialType: 'PASSWORD',
      activeStatus: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  const ok = credential?.credentialHash
    ? await bcrypt.compare(password, credential.credentialHash)
    : false;
  if (!ok) throw httpError(401, 'Invalid National ID or password');

  await enforceTempIdFreshness(citizen);

  await prisma.authenticationCredential.update({
    where: { credentialId: credential.credentialId },
    data: { lastUsed: new Date() },
  });
  await prisma.citizenProfile.upsert({
    where: { citizenId: citizen.citizenId },
    update: { lastLogin: new Date() },
    create: { citizenId: citizen.citizenId, lastLogin: new Date() },
  });

  const actor = actorOf({ type: 'CITIZEN', id: citizen.citizenId, role: 'CITIZEN' });
  await audit(
    ctx,
    { action: 'AUTH_LOGIN_PASSWORD', resourceType: 'citizen', resourceId: citizen.citizenId },
    actor
  );

  return {
    token: signToken(actor),
    role: 'CITIZEN',
    department: null,
    user: citizenPayload(citizen),
  };
}

// alias used by the controller
export const login = citizenLogin;

// --- Password recovery request ---
export async function recover(ctx, { channel, contact }) {
  const generic = {
    message: 'If an account exists with that contact, reset instructions have been sent.',
  };

  const where =
    channel === 'email'
      ? { contactEmail: String(contact).trim().toLowerCase() }
      : { phone: String(contact).trim() };

  const citizen = await prisma.citizen.findFirst({ where });
  if (!citizen) return generic;

  const raw = crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');

  await prisma.authenticationCredential.create({
    data: {
      citizenId: citizen.citizenId,
      credentialType: 'RECOVERY_TOKEN',
      credentialHash: hash,
      activeStatus: true,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  try {
    if (channel === 'email' && citizen.contactEmail) {
      await sendEmail(
        citizen.contactEmail,
        'Reset your GovServe password',
        `Use this recovery code within 1 hour to reset your password: ${raw}`
      );
    } else if (channel === 'sms' && citizen.phone) {
      await sendSms(
        citizen.phone,
        `GovServe password reset code: ${raw} (valid 1 hour)`
      );
    }
  } catch { /* delivery failures are non-fatal */ }

  await audit(
    ctx,
    {
      action: 'PASSWORD_RESET_REQUESTED',
      resourceType: 'citizen',
      resourceId: citizen.citizenId,
      details: { channel },
    },
    { type: 'CITIZEN', id: String(citizen.citizenId), role: 'CITIZEN' }
  );

  return generic;
}

// --- Existing OTP Flow (unchanged shape) ---
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

  await enforceTempIdFreshness(citizen);

  await prisma.citizenProfile.upsert({
    where: { citizenId: citizen.citizenId },
    update: { lastLogin: new Date() },
    create: { citizenId: citizen.citizenId, lastLogin: new Date() },
  });

  const actor = actorOf({ type: 'CITIZEN', id: citizen.citizenId, role: 'CITIZEN' });
  await audit(
    ctx,
    { action: 'AUTH_LOGIN_OTP', resourceType: 'citizen', resourceId: citizen.citizenId },
    actor
  );

  return {
    token: signToken(actor),
    role: 'CITIZEN',
    department: null,
    user: citizenPayload(citizen),
  };
}

export async function staffLogin(ctx, { email, password }) {
  const staff = await prisma.staff.findUnique({
    where: { email },
    include: { department: true, staffRoles: { include: { role: true } } },
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

  const actor = actorOf({ type: 'STAFF', id: staff.staffId, role: roleName, departmentCode });
  await audit(
    ctx,
    { action: 'AUTH_LOGIN_STAFF', resourceType: 'staff', resourceId: staff.staffId },
    actor
  );

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
