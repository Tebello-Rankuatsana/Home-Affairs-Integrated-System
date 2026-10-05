import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { getJSON, setJSON, store, otpKey, otpCooldownKey, revokedKey } from '../cache.js';
import { audit } from '../audit.js';
import { httpError } from '../middleware/error.js';
import { sendSms } from './messaging.js';

const GENERIC_OTP_MESSAGE = 'If this ID is registered, a one-time code has been sent.';

export function signToken(actor) {
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { 
      role: actor.role,
      departmentCode: actor.departmentCode ?? null,
      jti,
    }, 
    config.jwtSecret, 
    {
      subject: actor.id.toString(),
      expiresIn: config.jwtExpiresIn,
    }
  );
  return token;
}

const actorOf = (id, role, departmentCode = null) => ({ 
  id: id.toString(), 
  role, 
  departmentCode 
});

// Always answers the same way to prevent ID enumeration
export async function requestOtp(ctx, nationalId) {
  const body = { message: GENERIC_OTP_MESSAGE };

  if (await store.get(otpCooldownKey(nationalId))) return body;
  await store.set(otpCooldownKey(nationalId), '1', config.otpCooldownSeconds);

  const citizen = await prisma.citizen.findUnique({
    where: { national_id_number: nationalId },
    include: { citizen_profile: true },
  });

  if (citizen) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await setJSON(otpKey(nationalId), { code, attempts: 0 }, config.otpTtlSeconds);

    if (citizen.phone) {
      await sendSms(citizen.phone, `Your one-time code is ${code}. It expires in 5 minutes.`);
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

  const matches = crypto.timingSafeEqual(Buffer.from(entry.code), Buffer.from(code));
  if (!matches) {
    entry.attempts += 1;
    await setJSON(key, entry, config.otpTtlSeconds);
    throw httpError(401, 'Invalid or expired code');
  }

  await store.del(key);

  const citizen = await prisma.citizen.findUnique({
    where: { national_id_number: nationalId },
  });

  if (!citizen) throw httpError(401, 'Invalid or expired code');

  const actor = actorOf(citizen.citizen_id, 'CITIZEN');

  await audit(ctx, { action: 'LOGIN', resourceType: 'Citizen', resourceId: citizen.citizen_id.toString() }, actor);

  return { token: signToken(actor), role: 'CITIZEN' };
}

export async function staffLogin(ctx, { email, password }) {
  const staffMember = await prisma.staff.findUnique({
    where: { email },
    include: {
      department: true,
      staff_role_staff_role_staff_idTostaff: {
        include: { role: true },
      },
    },
  });

  if (!staffMember) throw httpError(401, 'Invalid email or password');

  const credential = await prisma.authentication_credentials.findFirst({
    where: {
      citizen_id: staffMember.staff_id,
      active_status: true,
    },
  });

  const ok = credential?.credential_hash 
    ? await bcrypt.compare(password, credential.credential_hash) 
    : false;

  if (!ok) throw httpError(401, 'Invalid email or password');

  const roleName = staffMember.staff_role_staff_role_staff_idTostaff[0]?.role?.role_name || 'DEPARTMENT_STAFF';
  const departmentCode = staffMember.department?.department_code ?? null;
  const actor = actorOf(staffMember.staff_id, roleName, departmentCode);

  await audit(ctx, { action: 'LOGIN', resourceType: 'Staff', resourceId: staffMember.staff_id.toString() }, actor);

  return { token: signToken(actor), role: roleName, department: departmentCode };
}

export async function logout(ctx, token) {
  const decoded = jwt.decode(token);
  if (decoded?.jti) {
    const ttl = decoded.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 3600;
    if (ttl > 0) {
      await store.set(revokedKey(decoded.jti), '1', ttl);
    }
  }
  return { message: 'Successfully logged out' };
};