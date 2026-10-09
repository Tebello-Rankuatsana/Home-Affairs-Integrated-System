import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { httpError } from '../middleware/error.js';

const sign = ({ receiptNumber, reference, type, serviceCode, issuedAt }) =>
  crypto
    .createHmac('sha256', config.receiptSecret)
    .update([receiptNumber, reference, type, serviceCode, new Date(issuedAt).toISOString()].join('|'))
    .digest('hex');

export function buildReceipt({ type, reference, serviceCode, citizenId }) {
  const issuedAt = new Date();
  const receiptNumber = `RCT-${issuedAt.toISOString().slice(0, 10).replaceAll('-', '')}-${crypto
    .randomBytes(3)
    .toString('hex')
    .toUpperCase()}`;
  const verificationCode = crypto.randomBytes(16).toString('hex');
  const signature = sign({ receiptNumber, reference, type, serviceCode, issuedAt });

  return {
    receiptNumber,
    type,
    citizenId,
    issuedAt,
    verificationCode,
    signature,
    summary: { applicationReference: reference, serviceCode },
  };
}

export async function listReceipts(ctx) {
  const citizenId = BigInt(ctx.user.id);
  return prisma.receipt.findMany({
    where: { citizenId },
    orderBy: { issuedAt: 'desc' },
    select: {
      receiptId: true,
      receiptNumber: true,
      type: true,
      issuedAt: true,
      summary: true,
    },
  });
}

export async function getReceipt(ctx, id) {
  const citizenId = BigInt(ctx.user.id);
  const receipt = await prisma.receipt.findUnique({ where: { receiptId: BigInt(id) } });
  if (!receipt || receipt.citizenId !== citizenId) throw httpError(404, 'Receipt not found');
  return receipt;
}

export async function verifyReceipt(receiptNumber) {
  const receipt = await prisma.receipt.findUnique({ where: { receiptNumber } });
  if (!receipt) return { valid: false };

  const reference = receipt.summary?.applicationReference ?? '';
  const serviceCode = receipt.summary?.serviceCode ?? '';
  const expected = sign({
    receiptNumber: receipt.receiptNumber,
    reference,
    type: receipt.type,
    serviceCode,
    issuedAt: receipt.issuedAt,
  });
  const a = Buffer.from(expected);
  const b = Buffer.from(receipt.signature ?? '');
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!valid) return { valid: false };

  const service = serviceCode
    ? await prisma.serviceType.findUnique({ where: { code: serviceCode } })
    : null;

  return {
    valid: true,
    receiptNumber: receipt.receiptNumber,
    type: receipt.type,
    serviceName: service?.name ?? serviceCode,
    issuedAt: receipt.issuedAt,
  };
}