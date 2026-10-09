import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { httpError } from '../middleware/error.js';
import { notify } from './notificationService.js';
import { buildReceipt } from './receiptService.js';

async function chargeGateway({ amount, currency, method, reference }) {
  console.log(`[payment] charging ${amount} ${currency} via ${method} for ${reference}`);
  await new Promise((resolve) => setTimeout(resolve, 200));
}

export async function payApplicationFee(ctx, applicationId, { method }) {
  const citizenId = BigInt(ctx.user.id);

  const app = await prisma.application.findUnique({
    where: { applicationId: BigInt(applicationId) },
    include: { service: true, payments: true },
  });
  if (!app || app.citizenId !== citizenId) throw httpError(404, 'Application not found');
  if (!app.service.feeAmount || Number(app.service.feeAmount) <= 0) {
    throw httpError(409, 'This service has no fee to pay');
  }
  if (app.paymentStatus === 'PAID' || app.payments.length > 0) {
    throw httpError(409, 'This application has already been paid');
  }
  if (['APPROVED', 'REJECTED', 'WITHDRAWN'].includes(app.status)) {
    throw httpError(409, 'This application is closed');
  }

  const amount = Number(app.service.feeAmount);
  const currency = app.service.currency ?? 'LSL';

  try {
    await chargeGateway({ amount, currency, method, reference: app.reference });
  } catch (err) {
    await audit(ctx, {
      action: 'PAYMENT_FAILED',
      resourceType: 'application',
      resourceId: app.applicationId,
      details: { method, amount, currency },
    });
    throw httpError(402, 'Payment could not be completed');
  }

  const receipt = buildReceipt({
    type: 'PAYMENT',
    reference: app.reference,
    serviceCode: app.service.code,
    citizenId,
  });

  const [payment] = await prisma.$transaction([
    prisma.payment.create({
      data: {
        applicationId: app.applicationId,
        citizenId,
        amount,
        currency,
        paymentMethod: method,
        transactionReference: receipt.receiptNumber,
        receiptNumber: receipt.receiptNumber,
      },
    }),
    prisma.application.update({
      where: { applicationId: app.applicationId },
      data: { paymentStatus: 'PAID', updatedAt: new Date() },
    }),
  ]);

  await prisma.receipt.create({
    data: {
      paymentId: payment.paymentId,
      applicationId: app.applicationId,
      citizenId,
      type: receipt.type,
      receiptNumber: receipt.receiptNumber,
      issuedAt: receipt.issuedAt,
      verificationCode: receipt.verificationCode,
      signature: receipt.signature,
      summary: { ...receipt.summary, amount, currency, method },
    },
  });

  await audit(ctx, {
    action: 'PAYMENT_COMPLETE',
    resourceType: 'application',
    resourceId: app.applicationId,
    details: { method, amount, currency },
  });

  await notify(citizenId, {
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
  const citizenId = BigInt(ctx.user.id);
  const receipts = await prisma.receipt.findMany({
    where: { citizenId, type: 'PAYMENT' },
    orderBy: { issuedAt: 'desc' },
    select: { receiptId: true, receiptNumber: true, issuedAt: true, summary: true },
  });
  return receipts.map((r) => ({
    id: String(r.receiptId),
    receiptNumber: r.receiptNumber,
    issuedAt: r.issuedAt,
    summary: r.summary,
  }));
}