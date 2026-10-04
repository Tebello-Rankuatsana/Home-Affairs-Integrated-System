import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { getJSON, setJSON, store, otpKey, otpCooldownKey } from '../cache.js';
import { audit } from '../audit.js';
import { httpError } from '../middleware/error.js';
import { sendSms } from './messaging.js';

const GENERIC_OTP_MESSAGE = 'If this ID is registered, a one-time code has been sent.';

export function signToken(user) {
  return jwt.sign({ role: user.role }, config.jwtSecret, {
    subject: user.id,
    expiresIn: config.jwtExpiresIn,
  });
}

const actorOf = (user, departmentCode = null) => ({ id: user.id, role: user.role, departmentCode });

// Always answers the same way, so nobody can probe which IDs are registered
export async function requestOtp(ctx, nationalId) {
  const body = { message: GENERIC_OTP_MESSAGE };

  if (await store.get(otpCooldownKey(nationalId))) return body;
  await store.set(otpCooldownKey(nationalId), '1', config.otpCooldownSeconds);

  const profile = await prisma.citizenProfile.findUnique({ where: { nationalId }, include: { user: true } });
  if (profile && profile.user.active) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await setJSON(otpKey(nationalId), { code, attempts: 0 }, config.otpTtlSeconds);
    await sendSms(profile.phone, `Your one-time code is ${code}. It expires in 5 minutes.`);
    if (!config.isProd) body.devOtp = code;
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
  const profile = await prisma.citizenProfile.findUnique({ where: { nationalId }, include: { user: true } });
  if (!profile || !profile.user.active) throw httpError(401, 'Invalid or expired code');

  await audit(ctx, { action: 'LOGIN', resourceType: 'User', resourceId: profile.user.id }, actorOf(profile.user));
  return { token: signToken(profile.user), role: profile.user.role };
}

export async function staffLogin(ctx, { email, password }) {
  const user = await prisma.user.findUnique({ where: { email }, include: { department: true } });
  const ok = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok || !user.active) throw httpError(401, 'Invalid email or password');

  await audit(ctx, { action: 'LOGIN', resourceType: 'User', resourceId: user.id }, actorOf(user, user.department?.code));
  return { token: signToken(user), role: user.role, department: user.department?.code ?? null };
}
