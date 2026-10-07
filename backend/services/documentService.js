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

const META = {
  id: true,
  type: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
  verifiedAt: true,
  reviewDecision: true,
};

const profileOf = (ctx) =>
  prisma.citizenProfile.findUnique({ where: { userId: ctx.user.id } });

async function loadOwnedApplication(profile, applicationId) {
  const app = await prisma.application.findUnique({ where: { id: applicationId } });
  if (!app || app.citizenId !== profile.id) throw httpError(404, 'Application not found');
  return app;
}

export async function uploadDocument(ctx, { file, type, applicationId }) {
  if (!file) throw httpError(400, 'No file uploaded (use the "file" field)');
  if (
    !config.upload.allowedMimeTypes.includes(file.mimetype) ||
    !looksLike(file.buffer, file.mimetype)
  ) {
    throw httpError(400, 'Only genuine PDF, JPEG or PNG files are accepted');
  }

  const profile = await profileOf(ctx);
  if (!profile) throw httpError(400, 'Complete your citizen profile before uploading');
  if (applicationId) await loadOwnedApplication(profile, applicationId);

  const storageKey = `${profile.id}/${crypto.randomUUID()}`;
  await storage.put(storageKey, file.buffer, file.mimetype);

  let doc;
  try {
    doc = await prisma.document.create({
      data: {
        citizenId: profile.id,
        type,
        originalName: cleanName(file.originalname),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey,
        sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
        ...(applicationId && { applications: { create: [{ applicationId }] } }),
      },
    });
  } catch (err) {
    await storage.remove(storageKey).catch(() => {});
    throw err;
  }

  await audit(ctx, {
    action: 'DOCUMENT_UPLOAD',
    resourceType: 'Document',
    resourceId: doc.id,
    details: { type, applicationId: applicationId ?? null },
  });
  return {
    id: doc.id,
    type: doc.type,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
  };
}

export async function listDocuments(ctx) {
  const profile = await profileOf(ctx);
  if (!profile) return [];
  return prisma.document.findMany({
    where: { citizenId: profile.id },
    select: META,
    orderBy: { createdAt: 'desc' },
  });
}

export async function attachDocument(ctx, applicationId, documentId) {
  const profile = await profileOf(ctx);
  if (!profile) throw httpError(404, 'Profile not found');
  const app = await loadOwnedApplication(profile, applicationId);
  if (app.status === 'APPROVED' || app.status === 'REJECTED' || app.status === 'WITHDRAWN') {
    throw httpError(409, 'This application is closed');
  }

  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc || doc.citizenId !== profile.id) throw httpError(404, 'Document not found');

  const existing = await prisma.applicationDocument.findUnique({
    where: { applicationId_documentId: { applicationId, documentId } },
  });
  if (!existing) {
    await prisma.applicationDocument.create({ data: { applicationId, documentId } });
  }

  await audit(ctx, {
    action: 'DOCUMENT_ATTACH',
    resourceType: 'Application',
    resourceId: applicationId,
    details: { documentId },
  });
  return { applicationId, documentId, attached: true };
}

export async function reviewDocument(ctx, applicationId, documentId, { decision, note }) {
  if (decision === 'REJECTED' && !note) {
    throw httpError(400, 'A note is required when rejecting a document');
  }

  const link = await prisma.applicationDocument.findUnique({
    where: { applicationId_documentId: { applicationId, documentId } },
    include: {
      application: { include: { serviceType: true, citizen: true } },
      document: true,
    },
  });
  if (!link) throw httpError(404, 'Document is not attached to this application');

  const app = link.application;
  if (app.serviceType.departmentId !== ctx.user.departmentId) {
    throw httpError(404, 'Document is not attached to this application');
  }
  if (app.assignedToId && app.assignedToId !== ctx.user.id) {
    throw httpError(409, 'This application is assigned to another officer');
  }

  const verifiedAt = decision === 'APPROVED' ? new Date() : null;
  await prisma.document.update({
    where: { id: documentId },
    data: {
      reviewDecision: decision,
      verifiedAt,
      verifiedById: ctx.user.id,
    },
  });

  await audit(ctx, {
    action: 'DOCUMENT_REVIEW',
    resourceType: 'Document',
    resourceId: documentId,
    details: { applicationId, decision },
  });

  await notify(app.citizenId, {
    type: `DOCUMENT_${decision}`,
    messageKey:
      decision === 'APPROVED'
        ? 'document.verified'
        : decision === 'REJECTED'
          ? 'document.rejected'
          : 'document.needsResubmission',
    vars: { reference: app.reference, note: note ? ` ${note}` : '' },
  });

  return { id: documentId, applicationId, decision, verifiedAt };
}

export async function downloadDocument(ctx, id) {
  const { user } = ctx;
  const doc = await prisma.document.findUnique({ where: { id }, include: { citizen: true } });
  if (!doc) throw httpError(404, 'Document not found');

  let allowed = user.role === 'CITIZEN' && doc.citizen.userId === user.id;
  if (!allowed && user.role === 'DEPARTMENT_STAFF') {
    const links = await prisma.applicationDocument.findMany({
      where: { documentId: id },
      include: { application: { include: { serviceType: true } } },
    });
    allowed = links.some((l) => l.application.serviceType.departmentId === user.departmentId);
  }
  if (!allowed) throw httpError(404, 'Document not found');

  const buffer = await storage.get(doc.storageKey);
  if (user.role !== 'CITIZEN') {
    await audit(ctx, {
      action: 'DOCUMENT_DOWNLOAD',
      resourceType: 'Document',
      resourceId: id,
      details: { type: doc.type },
    });
  }
  return { doc, buffer };
}

export async function deleteDocument(ctx, id) {
  const profile = await profileOf(ctx);
  if (!profile) throw httpError(404, 'Profile not found');
  const doc = await prisma.document.findUnique({
    where: { id },
    include: { applications: true },
  });
  if (!doc || doc.citizenId !== profile.id) throw httpError(404, 'Document not found');
  if (doc.applications.length > 0) {
    throw httpError(409, 'This document is attached to an application and cannot be deleted');
  }

  await prisma.document.delete({ where: { id } });
  await storage.remove(doc.storageKey);
  await audit(ctx, { action: 'DOCUMENT_DELETE', resourceType: 'Document', resourceId: id });
  return { id, deleted: true };
}