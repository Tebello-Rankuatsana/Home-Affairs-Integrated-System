import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { httpError } from '../middleware/error.js';
import { notify } from './notificationService.js';
import { buildReceipt } from './receiptService.js';
import { STATUS_TRANSITIONS, TERMINAL_APPLICATION_STATUSES } from '../constants.js';

const newReference = () => `APP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const FULL_INCLUDE = {
  serviceType: true,
  citizen: true,
  history: { orderBy: { createdAt: 'asc' } },
  documents: {
    include: {
      document: {
        select: { id: true, type: true, originalName: true, createdAt: true, verifiedAt: true },
      },
    },
  },
  receipts: { select: { id: true, receiptNumber: true, type: true, issuedAt: true } },
};

export const loadApplication = (id) =>
  prisma.application.findUnique({ where: { id }, include: FULL_INCLUDE });

export function canViewApplication(user, app) {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'CITIZEN') return app.citizen.userId === user.id;
  if (user.role === 'DEPARTMENT_STAFF') return app.serviceType.departmentId === user.departmentId;
  return false;
}

const missingFrom = (required, haveTypes) => required.filter((t) => !haveTypes.includes(t));

function present(app) {
  const { citizen, documents, ...rest } = app;
  const docs = documents.map((d) => ({ ...d.document, verifiedAt: d.document.verifiedAt ?? null }));
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
  if (!profile) throw httpError(400, 'Complete your citizen profile before applying');

  const ids = [...new Set(documentIds)];
  const docs = ids.length
    ? await prisma.document.findMany({ where: { id: { in: ids }, citizenId: profile.id } })
    : [];
  if (docs.length !== ids.length) throw httpError(400, 'One or more documents were not found');

  const reference = newReference();
  const receipt = buildReceipt({
    type: 'SUBMISSION',
    reference,
    serviceCode: service.code,
    citizenId: profile.id,
  });

  const application = await prisma.application.create({
    data: {
      reference,
      citizenId: profile.id,
      serviceTypeId: service.id,
      formData,
      history: {
        create: { toStatus: 'SUBMITTED', actorId: ctx.user.id, note: 'Application submitted' },
      },
      documents: { create: docs.map((d) => ({ documentId: d.id })) },
      receipts: { create: [receipt] },
    },
  });

  await audit(ctx, { action: 'APPLICATION_SUBMIT', resourceType: 'Application', resourceId: application.id });
  await notify(profile.id, {
    type: 'APPLICATION_SUBMITTED',
    messageKey: 'application.submitted',
    vars: { service: service.name, reference },
  });

  return {
    id: application.id,
    reference,
    status: application.status,
    receiptNumber: receipt.receiptNumber,
    missingDocuments: missingFrom(service.requiredDocuments, docs.map((d) => d.type)),
  };
}

export async function listApplications(ctx, { status, assigned, reference, limit, offset }) {
  const { user } = ctx;
  const where = {};
  if (status) where.status = status;
  if (reference) where.reference = { contains: reference, mode: 'insensitive' };

  if (user.role === 'CITIZEN') {
    const profile = await prisma.citizenProfile.findUnique({ where: { userId: user.id } });
    where.citizenId = profile?.id ?? '__none__';
  } else if (user.role === 'DEPARTMENT_STAFF') {
    where.serviceType = { departmentId: user.departmentId };
    if (assigned === 'me') where.assignedToId = user.id;
    if (assigned === 'unassigned') where.assignedToId = null;
  } else if (user.role !== 'ADMIN') {
    return [];
  }

  return prisma.application.findMany({
    where,
    include: { serviceType: { select: { code: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });
}

export async function getApplication(ctx, id) {
  const app = await loadApplication(id);
  if (!app || !canViewApplication(ctx.user, app)) throw httpError(404, 'Application not found');
  return present(app);
}

export async function changeStatus(ctx, id, { status, note }) {
  const app = await loadApplication(id);
  if (!app || !canViewApplication(ctx.user, app)) throw httpError(404, 'Application not found');

  if (app.assignedToId && app.assignedToId !== ctx.user.id && app.serviceType.departmentId === ctx.user.departmentId) {
    throw httpError(409, 'This application is assigned to another officer');
  }
  if (!STATUS_TRANSITIONS[app.status].includes(status)) {
    throw httpError(409, `Cannot move from ${app.status} to ${status}`);
  }
  if ((status === 'REJECTED' || status === 'MORE_INFO_NEEDED') && !note) {
    throw httpError(400, 'A note is required so the citizen knows why');
  }

  if (status === 'APPROVED') {
    const have = new Set(app.documents.map((d) => d.document.type));
    const missing = missingFrom(app.serviceType.requiredDocuments, [...have]);
    if (missing.length) {
      throw httpError(409, `Cannot approve: missing required documents (${missing.join(', ')})`);
    }
    const unverified = app.documents.filter((d) => !d.document.verifiedAt).map((d) => d.document.type);
    if (unverified.length) {
      throw httpError(409, `Cannot approve: documents not verified (${unverified.join(', ')})`);
    }
  }

  const ops = [
    prisma.application.update({
      where: { id: app.id },
      data: { status, assignedToId: ctx.user.id },
    }),
    prisma.applicationStatusHistory.create({
      data: {
        applicationId: app.id,
        fromStatus: app.status,
        toStatus: status,
        note,
        actorId: ctx.user.id,
      },
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
    messageKey: 'application.status',
    vars: { reference: app.reference, status, note: note ? ` ${note}` : '' },
  });

  return { id: app.id, status, receiptNumber };
}

export async function assignApplication(ctx, id, { assign }) {
  const app = await loadApplication(id);
  if (!app || !canViewApplication(ctx.user, app)) throw httpError(404, 'Application not found');
  if (TERMINAL_APPLICATION_STATUSES.includes(app.status)) throw httpError(409, 'This application is closed');

  if (assign) {
    if (app.assignedToId && app.assignedToId !== ctx.user.id) {
      throw httpError(409, 'This application is already assigned to another officer');
    }
    await prisma.application.update({ where: { id }, data: { assignedToId: ctx.user.id } });
  } else {
    if (app.assignedToId !== ctx.user.id) {
      throw httpError(409, 'Only the current assignee can release this application');
    }
    await prisma.application.update({ where: { id }, data: { assignedToId: null } });
  }

  await audit(ctx, {
    action: 'APPLICATION_ASSIGN',
    resourceType: 'Application',
    resourceId: id,
    details: { assign, assignee: assign ? ctx.user.id : null },
  });
  return { id, assignedTo: assign ? ctx.user.id : null };
}

export async function respondToRequest(ctx, id, { formData, note }) {
  const app = await loadApplication(id);
  if (!app || !canViewApplication(ctx.user, app)) throw httpError(404, 'Application not found');
  if (app.status !== 'MORE_INFO_NEEDED') {
    throw httpError(409, 'This application is not waiting for more information');
  }

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

export async function withdrawApplication(ctx, id, { note }) {
  const app = await loadApplication(id);
  if (!app || !canViewApplication(ctx.user, app)) throw httpError(404, 'Application not found');
  if (TERMINAL_APPLICATION_STATUSES.includes(app.status)) {
    throw httpError(409, `A ${app.status} application cannot be withdrawn`);
  }

  await prisma.$transaction([
    prisma.application.update({ where: { id: app.id }, data: { status: 'WITHDRAWN' } }),
    prisma.applicationStatusHistory.create({
      data: {
        applicationId: app.id,
        fromStatus: app.status,
        toStatus: 'WITHDRAWN',
        note: note ?? 'Withdrawn by citizen',
        actorId: ctx.user.id,
      },
    }),
  ]);

  await audit(ctx, { action: 'APPLICATION_WITHDRAW', resourceType: 'Application', resourceId: app.id });
  await notify(app.citizenId, {
    type: 'APPLICATION_WITHDRAWN',
    messageKey: 'application.withdrawn',
    vars: { reference: app.reference },
  });
  return { id: app.id, status: 'WITHDRAWN' };
}