import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { httpError } from '../middleware/error.js';
import { notify } from './notificationService.js';
import { buildReceipt } from './receiptService.js';
import { STATUS_TRANSITIONS } from '../constants.js';

const newReference = () => `APP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const FULL_INCLUDE = {
  serviceType: true,
  citizen: true,
  history: { orderBy: { createdAt: 'asc' } },
  documents: { include: { document: { select: { id: true, type: true, originalName: true, createdAt: true } } } },
  receipts: { select: { id: true, receiptNumber: true, type: true, issuedAt: true } },
};

export const loadApplication = (id) => prisma.application.findUnique({ where: { id }, include: FULL_INCLUDE });

export function canViewApplication(user, app) {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'CITIZEN') return app.citizen.userId === user.id;
  if (user.role === 'DEPARTMENT_STAFF') return app.serviceType.departmentId === user.departmentId;
  return false;
}

const missingFrom = (required, haveTypes) => required.filter((t) => !haveTypes.includes(t));

// Shape for the API: no citizen record, flattened documents, and what is still missing
function present(app) {
  const { citizen, documents, ...rest } = app;
  const docs = documents.map((d) => d.document);
  return {
    ...rest,
    documents: docs,
    missingDocuments: missingFrom(app.serviceType.requiredDocuments, docs.map((d) => d.type)),
  };
}

export async function submitApplication(ctx, { serviceCode, formData, documentIds }) {
  const service = await prisma.serviceType.findUnique({ where: { code: serviceCode } });
  if (!service) throw httpError(404, 'Unknown service');
  const profile = await prisma.citizenProfile.findUnique({ where: { userId: ctx.user.id } });

  // Reuse already-uploaded documents instead of asking for them again
  const ids = [...new Set(documentIds)];
  const docs = ids.length ? await prisma.document.findMany({ where: { id: { in: ids }, citizenId: profile.id } }) : [];
  if (docs.length !== ids.length) throw httpError(400, 'One or more documents were not found');

  const reference = newReference();
  const receipt = buildReceipt({ type: 'SUBMISSION', reference, serviceCode: service.code, citizenId: profile.id });

  const application = await prisma.application.create({
    data: {
      reference,
      citizenId: profile.id,
      serviceTypeId: service.id,
      formData,
      history: { create: { toStatus: 'SUBMITTED', actorId: ctx.user.id, note: 'Application submitted' } },
      documents: { create: docs.map((d) => ({ documentId: d.id })) },
      receipts: { create: [receipt] },
    },
  });

  await audit(ctx, { action: 'APPLICATION_SUBMIT', resourceType: 'Application', resourceId: application.id });
  await notify(profile.id, {
    type: 'APPLICATION_SUBMITTED',
    message: `Your ${service.name} application ${reference} was received.`,
  });

  return {
    id: application.id,
    reference,
    status: application.status,
    receiptNumber: receipt.receiptNumber,
    missingDocuments: missingFrom(service.requiredDocuments, docs.map((d) => d.type)),
  };
}

// Citizens see their own, department staff see their department's queue, admins see everything
export async function listApplications(ctx, { status }) {
  const { user } = ctx;
  const where = status ? { status } : {};
  if (user.role === 'CITIZEN') where.citizen = { userId: user.id };
  else if (user.role === 'DEPARTMENT_STAFF') where.serviceType = { departmentId: user.departmentId };
  else if (user.role !== 'ADMIN') return [];

  return prisma.application.findMany({
    where,
    include: { serviceType: { select: { code: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

// Detail with status history and missing requirements (powers the citizen's progress tracker)
export async function getApplication(ctx, id) {
  const app = await loadApplication(id);
  if (!app || !canViewApplication(ctx.user, app)) throw httpError(404, 'Application not found');
  return present(app);
}

export async function changeStatus(ctx, id, { status, note }) {
  const app = await loadApplication(id);
  if (!app || !canViewApplication(ctx.user, app)) throw httpError(404, 'Application not found');
  if (!STATUS_TRANSITIONS[app.status].includes(status)) {
    throw httpError(409, `Cannot move from ${app.status} to ${status}`);
  }
  if ((status === 'REJECTED' || status === 'MORE_INFO_NEEDED') && !note) {
    throw httpError(400, 'A note is required so the citizen knows why');
  }

  const ops = [
    prisma.application.update({ where: { id: app.id }, data: { status } }),
    prisma.applicationStatusHistory.create({
      data: { applicationId: app.id, fromStatus: app.status, toStatus: status, note, actorId: ctx.user.id },
    }),
  ];
  let receiptNumber = null;
  if (status === 'APPROVED') {
    const receipt = buildReceipt({
      type: 'COMPLETION',
      reference: app.reference,
      serviceCode: app.serviceType.code,
      citizenId: app.citizenId,
    });
    receiptNumber = receipt.receiptNumber;
    ops.push(prisma.receipt.create({ data: { ...receipt, applicationId: app.id } }));
  }
  await prisma.$transaction(ops);

  await audit(ctx, {
    action: 'APPLICATION_STATUS_CHANGE',
    resourceType: 'Application',
    resourceId: app.id,
    details: { from: app.status, to: status },
  });
  await notify(app.citizenId, {
    type: 'APPLICATION_STATUS',
    message: `Your application ${app.reference} is now: ${status}.${note ? ' ' + note : ''}`,
  });
  return { id: app.id, status, receiptNumber };
}

// Citizen answers a "more info needed" request; the application goes back to review
export async function respondToRequest(ctx, id, { formData, note }) {
  const app = await loadApplication(id);
  if (!app || !canViewApplication(ctx.user, app)) throw httpError(404, 'Application not found');
  if (app.status !== 'MORE_INFO_NEEDED') throw httpError(409, 'This application is not waiting for more information');

  await prisma.$transaction([
    prisma.application.update({
      where: { id: app.id },
      data: { status: 'UNDER_REVIEW', formData: { ...app.formData, ...formData } },
    }),
    prisma.applicationStatusHistory.create({
      data: {
        applicationId: app.id,
        fromStatus: app.status,
        toStatus: 'UNDER_REVIEW',
        note: note ?? 'Citizen provided requested information',
        actorId: ctx.user.id,
      },
    }),
  ]);
  await audit(ctx, { action: 'APPLICATION_RESPOND', resourceType: 'Application', resourceId: app.id });
  return { id: app.id, status: 'UNDER_REVIEW' };
}
