import crypto from 'node:crypto';
import path from 'node:path';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { audit } from '../audit.js';
import { httpError } from '../middleware/error.js';
import { notify } from './notificationService.js';
import { storage } from './storage.js';

const SIGNATURES = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
};

const looksLike = (buffer, mime) =>
  SIGNATURES[mime]?.every((byte, i) => buffer[i] === byte) ?? false;

const cleanName = (name) =>
  path.basename(name || 'document').replace(/[^\w.\- ()]/g, '_').slice(0, 120) || 'document';

const shape = (d) => ({
  id: String(d.documentId),
  type: d.documentType,
  originalName: d.originalName,
  mimeType: d.mimeType,
  sizeBytes: d.sizeBytes,
  createdAt: d.uploadedAt,
  verifiedAt: d.verifiedAt,
  status: d.status,
});

export async function uploadDocument(ctx, { file, type, applicationId }) {
  if (!file) throw httpError(400, 'No file uploaded (use the "file" field)');
  if (
    !config.upload.allowedMimeTypes.includes(file.mimetype) ||
    !looksLike(file.buffer, file.mimetype)
  ) {
    throw httpError(400, 'Only genuine PDF, JPEG or PNG files are accepted');
  }

  const citizenId = BigInt(ctx.user.id);

  if (applicationId) {
    const app = await prisma.application.findUnique({
      where: { applicationId: BigInt(applicationId) },
    });
    if (!app || app.citizenId !== citizenId) throw httpError(404, 'Application not found');
  }

  const storageKey = `${citizenId}/${crypto.randomUUID()}`;
  await storage.put(storageKey, file.buffer, file.mimetype);

  let doc;
  try {
    doc = await prisma.document.create({
      data: {
        citizenId,
        documentType: type,
        originalName: cleanName(file.originalname),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
        sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
        status: 'SUBMITTED',
        ...(applicationId && {
          applications: {
            create: [{ applicationId: BigInt(applicationId), status: 'SUBMITTED' }],
          },
        }),
      },
    });
  } catch (err) {
    await storage.remove(storageKey).catch(() => {});
    throw err;
  }

  await audit(ctx, {
    action: 'DOCUMENT_UPLOAD',
    resourceType: 'document',
    resourceId: doc.documentId,
    details: { type },
  });
  return shape(doc);
}

export async function listDocuments(ctx) {
  const docs = await prisma.document.findMany({
    where: { citizenId: BigInt(ctx.user.id) },
    orderBy: { uploadedAt: 'desc' },
  });
  return docs.map(shape);
}

export async function attachDocument(ctx, applicationId, documentId) {
  const citizenId = BigInt(ctx.user.id);
  const app = await prisma.application.findUnique({
    where: { applicationId: BigInt(applicationId) },
  });
  if (!app || app.citizenId !== citizenId) throw httpError(404, 'Application not found');
  if (['APPROVED', 'REJECTED', 'WITHDRAWN'].includes(app.status)) {
    throw httpError(409, 'This application is closed');
  }

  const doc = await prisma.document.findUnique({
    where: { documentId: BigInt(documentId) },
  });
  if (!doc || doc.citizenId !== citizenId) throw httpError(404, 'Document not found');

  const existing = await prisma.applicationDocument.findUnique({
    where: {
      applicationId_documentId: {
        applicationId: app.applicationId,
        documentId: doc.documentId,
      },
    },
  });
  if (!existing) {
    await prisma.applicationDocument.create({
      data: {
        applicationId: app.applicationId,
        documentId: doc.documentId,
        status: 'SUBMITTED',
      },
    });
  }

  await audit(ctx, {
    action: 'DOCUMENT_ATTACH',
    resourceType: 'application',
    resourceId: app.applicationId,
    details: { documentId: String(doc.documentId) },
  });
  return {
    applicationId: String(app.applicationId),
    documentId: String(doc.documentId),
    attached: true,
  };
}

export async function reviewDocument(ctx, applicationId, documentId, { decision, note }) {
  if (decision === 'REJECTED' && !note) {
    throw httpError(400, 'A note is required when rejecting a document');
  }

  const link = await prisma.applicationDocument.findUnique({
    where: {
      applicationId_documentId: {
        applicationId: BigInt(applicationId),
        documentId: BigInt(documentId),
      },
    },
    include: {
      application: { include: { service: true, citizen: true } },
      document: true,
    },
  });
  if (!link) throw httpError(404, 'Document is not attached to this application');

  const staff = await prisma.staff.findUnique({
    where: { staffId: BigInt(ctx.user.id) },
    select: { staffId: true, departmentId: true },
  });
  if (!staff || link.application.departmentId !== staff.departmentId) {
    throw httpError(404, 'Document is not attached to this application');
  }

  const verifiedAt = decision === 'APPROVED' ? new Date() : null;

  await prisma.$transaction([
    prisma.applicationDocument.update({
      where: { applicationDocumentId: link.applicationDocumentId },
      data: {
        reviewDecision: decision,
        reviewNote: note ?? null,
        status: decision,
        verifiedBy: staff.staffId,
        verifiedAt,
      },
    }),
    prisma.document.update({
      where: { documentId: link.documentId },
      data: {
        status: decision,
        reviewDecision: decision,
        verifiedBy: staff.staffId,
        verifiedAt,
      },
    }),
  ]);

  await audit(ctx, {
    action: 'DOCUMENT_REVIEW',
    resourceType: 'application_document',
    resourceId: link.applicationDocumentId,
    details: { applicationId, documentId, decision },
  });

  await notify(link.application.citizenId, {
    type: `DOCUMENT_${decision}`,
    messageKey:
      decision === 'APPROVED'
        ? 'document.verified'
        : decision === 'REJECTED'
          ? 'document.rejected'
          : 'document.needsResubmission',
    vars: { reference: link.application.reference, note: note ? ` ${note}` : '' },
  });

  return { id: String(link.documentId), applicationId, decision, verifiedAt };
}

export async function downloadDocument(ctx, id) {
  const { user } = ctx;
  const doc = await prisma.document.findUnique({
    where: { documentId: BigInt(id) },
    include: { citizen: true },
  });
  if (!doc) throw httpError(404, 'Document not found');

  let allowed = user.type === 'CITIZEN' && String(doc.citizenId) === user.id;
  if (!allowed && user.role === 'DEPARTMENT_STAFF') {
    const staff = await prisma.staff.findUnique({
      where: { staffId: BigInt(user.id) },
      select: { departmentId: true },
    });
    const links = await prisma.applicationDocument.findMany({
      where: { documentId: doc.documentId },
      include: { application: true },
    });
    allowed = links.some((l) => l.application.departmentId === staff?.departmentId);
  }
  if (!allowed) throw httpError(404, 'Document not found');

  const buffer = await storage.get(doc.storageKey);
  if (user.type !== 'CITIZEN') {
    await audit(ctx, {
      action: 'DOCUMENT_DOWNLOAD',
      resourceType: 'document',
      resourceId: doc.documentId,
      details: { type: doc.documentType },
    });
  }
  return {
    doc: { mimeType: doc.mimeType, originalName: doc.originalName || 'document' },
    buffer,
  };
}

export async function deleteDocument(ctx, id) {
  const citizenId = BigInt(ctx.user.id);
  const doc = await prisma.document.findUnique({
    where: { documentId: BigInt(id) },
    include: { applications: true },
  });
  if (!doc || doc.citizenId !== citizenId) throw httpError(404, 'Document not found');
  if (doc.applications.length > 0) {
    throw httpError(409, 'This document is attached to an application and cannot be deleted');
  }

  await prisma.document.delete({ where: { documentId: doc.documentId } });
  await storage.remove(doc.storageKey);
  await audit(ctx, {
    action: 'DOCUMENT_DELETE',
    resourceType: 'document',
    resourceId: doc.documentId,
  });
  return { id: String(doc.documentId), deleted: true };
}