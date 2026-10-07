import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { httpError } from '../middleware/error.js';
import { notify } from './notificationService.js';
import { buildReceipt } from './receiptService.js';

async function chargeGateway({ amount, currency, method, reference }) {
  console.log(
    `[payment] charging ${amount} ${currency} via ${method} for application ${reference}`
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
}

export async function payApplicationFee(ctx, applicationId, { method }) {
  const profile = await prisma.citizenProfile.findUnique({ where: { userId: ctx.user.id } });
  if (!profile) throw httpError(400, 'Profile not found');

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { serviceType: true, receipts: true },
  });
  if (!app || app.citizenId !== profile.id) throw httpError(404, 'Application not found');
  if (!app.serviceType.feeAmount || Number(app.serviceType.feeAmount) <= 0) {
    throw httpError(409, 'This service has no fee to pay');
  }
  if (app.paymentStatus === 'PAID' || app.receipts.some((r) => r.type === 'PAYMENT')) {
    throw httpError(409, 'This application has already been paid');
  }
  if (app.status === 'APPROVED' || app.status === 'REJECTED' || app.status === 'WITHDRAWN') {
    throw httpError(409, 'This application is closed');
  }

  const amount = Number(app.serviceType.feeAmount);
  const currency = app.serviceType.currency ?? 'LSL';

  try {
    await chargeGateway({ amount, currency, method, reference: app.reference });
  } catch (err) {
    await audit(ctx, {
      action: 'PAYMENT_FAILED',
      resourceType: 'Application',
      resourceId: app.id,
      details: { method, amount, currency },
    });
    throw httpError(402, 'Payment could not be completed');
  }

  const receipt = buildReceipt({
    type: 'PAYMENT',
    reference: app.reference,
    serviceCode: app.serviceType.code,
    citizenId: profile.id,
  });

  await prisma.$transaction([
    prisma.receipt.create({
      data: {
        ...receipt,
        applicationId: app.id,
        summary: { ...receipt.summary, amount, currency, method },
      },
    }),
    prisma.application.update({
      where: { id: app.id },
      data: { paymentStatus: 'PAID' },
    }),
  ]);

  await audit(ctx, {
    action: 'PAYMENT_COMPLETE',
    resourceType: 'Application',
    resourceId: app.id,
    details: { method, amount, currency },
  });

  await notify(profile.id, {
    type: 'APPLICATION_PAID',
    messageKey: 'application.paid',
    vars: {
      amount: amount.toFixed(2),
      currency,
      reference: app.reference,
      receipt: receipt.receiptNumber,
    },
  });

  return {
    receiptNumber: receipt.receiptNumber,
    amount,
    currency,
    method,
    issuedAt: receipt.issuedAt,
  };
}

export async function listPayments(ctx) {
  const profile = await prisma.citizenProfile.findUnique({ where: { userId: ctx.user.id } });
  if (!profile) return [];
  return prisma.receipt.findMany({
    where: { citizenId: profile.id, type: 'PAYMENT' },
    orderBy: { issuedAt: 'desc' },
    select: { id: true, receiptNumber: true, issuedAt: true, summary: true },
  });
}