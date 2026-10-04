import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { httpError } from '../middleware/error.js';

const sign = ({ receiptNumber, reference, type, serviceCode, issuedAt }) =>
  crypto
    .createHmac('sha256', config.receiptSecret)
    .update([receiptNumber, reference, type, serviceCode, new Date(issuedAt).toISOString()].join('|'))
    .digest('hex');

// Builds the receipt row (not saved here) so it can be created in the same transaction as the event it proves
export function buildReceipt({ type, reference, serviceCode, citizenId }) {
  const issuedAt = new Date();
  const receiptNumber = `RCT-${issuedAt.toISOString().slice(0, 10).replaceAll('-', '')}-${crypto
    .randomBytes(3)
    .toString('hex')
    .toUpperCase()}`;
  return {
    receiptNumber,
    type,
    citizenId,
    issuedAt,
    summary: { applicationReference: reference, serviceCode },
    signature: sign({ receiptNumber, reference, type, serviceCode, issuedAt }),
  };
}

export async function listReceipts(ctx) {
  const profile = await prisma.citizenProfile.findUnique({ where: { userId: ctx.user.id } });
  return prisma.receipt.findMany({
    where: { citizenId: profile.id },
    orderBy: { issuedAt: 'desc' },
    select: { id: true, receiptNumber: true, type: true, issuedAt: true, summary: true },
  });
}

export async function getReceipt(ctx, id) {
  const profile = await prisma.citizenProfile.findUnique({ where: { userId: ctx.user.id } });
  const receipt = await prisma.receipt.findUnique({ where: { id } });
  if (!receipt || receipt.citizenId !== profile.id) throw httpError(404, 'Receipt not found');
  return receipt;
}

// Public: lets a third party confirm a receipt is genuine without learning anything personal
export async function verifyReceipt(receiptNumber) {
  const receipt = await prisma.receipt.findUnique({ where: { receiptNumber } });
  if (!receipt) return { valid: false };

  const expected = sign({
    receiptNumber: receipt.receiptNumber,
    reference: receipt.summary.applicationReference,
    type: receipt.type,
    serviceCode: receipt.summary.serviceCode,
    issuedAt: receipt.issuedAt,
  });
  const a = Buffer.from(expected);
  const b = Buffer.from(receipt.signature);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!valid) return { valid: false };

  const service = await prisma.serviceType.findUnique({ where: { code: receipt.summary.serviceCode } });
  return {
    valid: true,
    receiptNumber: receipt.receiptNumber,
    type: receipt.type,
    serviceName: service?.name ?? receipt.summary.serviceCode,
    issuedAt: receipt.issuedAt,
  };
}
