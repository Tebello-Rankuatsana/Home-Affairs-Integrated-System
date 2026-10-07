import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { httpError } from '../middleware/error.js';
import { notify } from './notificationService.js';
import { STATUS_TRANSITIONS, TERMINAL_APPLICATION_STATUSES } from '../constants.js';

const newReference = () => `APP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const FULL_INCLUDE = {
  service: true,
  citizen: true,
  department: true,
  assignedStaff: { select: { staffId: true, firstName: true, lastName: true } },
  statusHistory: {
    orderBy: { changedAt: 'asc' },
    include: { changedByStaff: { select: { firstName: true, lastName: true } } },
  },
  documents: {
    include: {
      document: {
        select: {
          documentId: true,
          documentType: true,
          originalName: true,
          uploadedAt: true,
          verifiedAt: true,
        },
      },
    },
  },
  receipts: true,
};

const loadApplication = (id) =>
  prisma.application.findUnique({ where: { applicationId: BigInt(id) }, include: FULL_INCLUDE });

function canView(user, app) {
  if (user.role === 'ADMIN') return true;
  if (user.type === 'CITIZEN') return String(app.citizenId) === user.id;
  if (user.role === 'DEPARTMENT_STAFF') {
    return app.department?.departmentCode === user.departmentCode;
  }
  return false;
}

const missingFrom = (required, haveTypes) => (required ?? []).filter((t) => !haveTypes.includes(t));

function present(app) {
  return {
    id: String(app.applicationId),
    reference: app.reference,
    status: app.status,
    service: { code: app.service.code, name: app.service.name },
    department: { code: app.department.departmentCode, name: app.department.departmentName },
    formData: app.formData ?? {},
    createdAt: app.submittedAt,
    updatedAt: app.updatedAt,
    assignedTo: app.assignedStaff
      ? {
          id: String(app.assignedStaff.staffId),
          name: `${app.assignedStaff.firstName} ${app.assignedStaff.lastName}`.trim(),
        }
      : null,
    documents: app.documents.map((d) => ({
      id: String(d.document.documentId),
      type: d.document.documentType,
      originalName: d.document.originalName,
      createdAt: d.document.uploadedAt,
      verifiedAt: d.document.verifiedAt,
      decision: d.reviewDecision ?? d.status ?? null,
    })),
    missingDocuments: missingFrom(
      app.service.requiredDocuments,
      app.documents.map((d) => d.document.documentType)
    ),
    receipts: app.receipts.map((r) => ({
      id: String(r.receiptId),
      receiptNumber: r.receiptNumber,
      type: r.type,
      issuedAt: r.issuedAt,
    })),
    history: app.statusHistory.map((h) => ({
      fromStatus: h.oldStatus,
      toStatus: h.newStatus,
      note: h.note,
      createdAt: h.changedAt,
    })),
    paymentStatus: app.paymentStatus,
  };
}

export async function submitApplication(ctx, { serviceCode, formData, documentIds }) {
  const service = await prisma.serviceType.findUnique({
    where: { code: serviceCode },
    include: { department: true },
  });
  if (!service) throw httpError(404, 'Unknown service');

  const citizenId = BigInt(ctx.user.id);

  const ids = [...new Set(documentIds)].map(BigInt);
  const docs = ids.length
    ? await prisma.document.findMany({
        where: { documentId: { in: ids }, citizenId },
      })
    : [];
  if (docs.length !== ids.length) throw httpError(400, 'One or more documents were not found');

  const reference = newReference();

  const application = await prisma.application.create({
    data: {
      reference,
      citizenId,
      serviceId: service.serviceId,
      departmentId: service.departmentId,
      status: 'SUBMITTED',
      formData,
      statusHistory: { create: { newStatus: 'SUBMITTED' } },
      documents: {
        create: docs.map((d) => ({ documentId: d.documentId, status: 'SUBMITTED' })),
      },
    },
  });

  await audit(ctx, {
    action: 'APPLICATION_SUBMIT',
    resourceType: 'application',
    resourceId: application.applicationId,
  });
  await notify(citizenId, {
    type: 'APPLICATION_SUBMITTED',
    messageKey: 'application.submitted',
    vars: { service: service.name, reference },
  });

  return {
    id: String(application.applicationId),
    reference,
    status: application.status,
    missingDocuments: missingFrom(
      service.requiredDocuments,
      docs.map((d) => d.documentType)
    ),
  };
}

export async function listApplications(ctx, { status, assigned, reference, limit, offset }) {
  const { user } = ctx;
  const where = {};
  if (status) where.status = status;
  if (reference) where.reference = { contains: reference, mode: 'insensitive' };

  if (user.type === 'CITIZEN') {
    where.citizenId = BigInt(user.id);
  } else if (user.role === 'DEPARTMENT_STAFF') {
    const staff = await prisma.staff.findUnique({
      where: { staffId: BigInt(user.id) },
      select: { staffId: true, departmentId: true },
    });
    where.departmentId = staff.departmentId;
    if (assigned === 'me') where.assignedStaffId = staff.staffId;
    if (assigned === 'unassigned') where.assignedStaffId = null;
  } else if (user.role !== 'ADMIN') {
    return [];
  }

  const apps = await prisma.application.findMany({
    where,
    include: { service: { select: { code: true, name: true } } },
    orderBy: { submittedAt: 'desc' },
    take: limit,
    skip: offset,
  });
  return apps.map((a) => ({
    id: String(a.applicationId),
    reference: a.reference,
    status: a.status,
    service: { code: a.service.code, name: a.service.name },
    createdAt: a.submittedAt,
  }));
}

export async function getApplication(ctx, id) {
  const app = await loadApplication(id);
  if (!app || !canView(ctx.user, app)) throw httpError(404, 'Application not found');
  return present(app);
}

export async function changeStatus(ctx, id, { status, note }) {
  const app = await loadApplication(id);
  if (!app || !canView(ctx.user, app)) throw httpError(404, 'Application not found');

  if (app.assignedStaffId && String(app.assignedStaffId) !== ctx.user.id && ctx.user.role === 'DEPARTMENT_STAFF') {
    throw httpError(409, 'This application is assigned to another officer');
  }
  if (!STATUS_TRANSITIONS[app.status]?.includes(status)) {
    throw httpError(409, `Cannot move from ${app.status} to ${status}`);
  }
  if ((status === 'REJECTED' || status === 'MORE_INFO_NEEDED') && !note) {
    throw httpError(400, 'A note is required so the citizen knows why');
  }

  if (status === 'APPROVED') {
    const required = app.service.requiredDocuments ?? [];
    const have = new Set(app.documents.map((d) => d.document.documentType));
    const missing = missingFrom(required, [...have]);
    if (missing.length) {
      throw httpError(409, `Cannot approve: missing required documents (${missing.join(', ')})`);
    }
    const unverified = app.documents
      .filter((d) => !d.document.verifiedAt)
      .map((d) => d.document.documentType);
    if (unverified.length) {
      throw httpError(409, `Cannot approve: documents not verified (${unverified.join(', ')})`);
    }
  }

  const staff = await prisma.staff.findUnique({
    where: { staffId: BigInt(ctx.user.id) },
    select: { staffId: true },
  });

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.application.update({
      where: { applicationId: app.applicationId },
      data: {
        status,
        assignedStaffId: staff.staffId,
        updatedAt: new Date(),
        ...(status === 'APPROVED' ? { completedAt: new Date() } : {}),
      },
    });
    await tx.applicationStatusHistory.create({
      data: {
        applicationId: app.applicationId,
        oldStatus: app.status,
        newStatus: status,
        changedBy: staff.staffId,
        note: note ?? null,
      },
    });
    return row;
  });

  await audit(ctx, {
    action: 'APPLICATION_STATUS_CHANGE',
    resourceType: 'application',
    resourceId: app.applicationId,
    details: { from: app.status, to: status },
  });
  await notify(app.citizenId, {
    type: 'APPLICATION_STATUS',
    messageKey: 'application.status',
    vars: { reference: app.reference, status, note: note ? ` ${note}` : '' },
  });
  return { id: String(updated.applicationId), status };
}

export async function assignApplication(ctx, id, { assign }) {
  const app = await loadApplication(id);
  if (!app || !canView(ctx.user, app)) throw httpError(404, 'Application not found');
  if (TERMINAL_APPLICATION_STATUSES.includes(app.status)) {
    throw httpError(409, 'This application is closed');
  }

  const staff = await prisma.staff.findUnique({
    where: { staffId: BigInt(ctx.user.id) },
    select: { staffId: true },
  });

  if (assign) {
    if (app.assignedStaffId && app.assignedStaffId !== staff.staffId) {
      throw httpError(409, 'Already assigned to another officer');
    }
    await prisma.application.update({
      where: { applicationId: app.applicationId },
      data: { assignedStaffId: staff.staffId },
    });
  } else {
    if (app.assignedStaffId !== staff.staffId) {
      throw httpError(409, 'Only the current assignee can release this application');
    }
    await prisma.application.update({
      where: { applicationId: app.applicationId },
      data: { assignedStaffId: null },
    });
  }

  await audit(ctx, {
    action: 'APPLICATION_ASSIGN',
    resourceType: 'application',
    resourceId: app.applicationId,
    details: { assign },
  });
  return { id: String(app.applicationId), assignedTo: assign ? ctx.user.id : null };
}

export async function respondToRequest(ctx, id, { formData, note }) {
  const app = await loadApplication(id);
  if (!app || !canView(ctx.user, app)) throw httpError(404, 'Application not found');
  if (app.status !== 'MORE_INFO_NEEDED') {
    throw httpError(409, 'This application is not waiting for more information');
  }

  const merged = { ...(app.formData ?? {}), ...formData };
  await prisma.$transaction([
    prisma.application.update({
      where: { applicationId: app.applicationId },
      data: { status: 'UNDER_REVIEW', formData: merged, updatedAt: new Date() },
    }),
    prisma.applicationStatusHistory.create({
      data: {
        applicationId: app.applicationId,
        oldStatus: app.status,
        newStatus: 'UNDER_REVIEW',
        note: note ?? null,
      },
    }),
  ]);

  await audit(ctx, {
    action: 'APPLICATION_RESPOND',
    resourceType: 'application',
    resourceId: app.applicationId,
  });
  return { id: String(app.applicationId), status: 'UNDER_REVIEW' };
}

export async function withdrawApplication(ctx, id, { note }) {
  const app = await loadApplication(id);
  if (!app || !canView(ctx.user, app)) throw httpError(404, 'Application not found');
  if (TERMINAL_APPLICATION_STATUSES.includes(app.status)) {
    throw httpError(409, `A ${app.status} application cannot be withdrawn`);
  }

  await prisma.$transaction([
    prisma.application.update({
      where: { applicationId: app.applicationId },
      data: { status: 'WITHDRAWN', updatedAt: new Date() },
    }),
    prisma.applicationStatusHistory.create({
      data: {
        applicationId: app.applicationId,
        oldStatus: app.status,
        newStatus: 'WITHDRAWN',
        note: note ?? null,
      },
    }),
  ]);

  await audit(ctx, {
    action: 'APPLICATION_WITHDRAW',
    resourceType: 'application',
    resourceId: app.applicationId,
  });
  await notify(app.citizenId, {
    type: 'APPLICATION_WITHDRAWN',
    messageKey: 'application.withdrawn',
    vars: { reference: app.reference },
  });
  return { id: String(app.applicationId), status: 'WITHDRAWN' };
}