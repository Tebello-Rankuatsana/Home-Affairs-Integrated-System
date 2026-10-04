import { z } from 'zod';
import * as documents from '../services/documentService.js';
import { DOCUMENT_TYPES } from '../constants.js';
import { ctx } from './util.js';

const uuid = z.string().uuid();

export async function upload(req, res) {
  const body = z
    .object({ type: z.enum(DOCUMENT_TYPES), applicationId: uuid.optional() })
    .parse(req.body ?? {});
  res.status(201).json(await documents.uploadDocument(ctx(req), { file: req.file, ...body }));
}

export async function list(req, res) {
  res.json(await documents.listDocuments(ctx(req)));
}

export async function attach(req, res) {
  const applicationId = uuid.parse(req.params.id);
  const documentId = uuid.parse(req.params.documentId);
  res.json(await documents.attachDocument(ctx(req), applicationId, documentId));
}

export async function download(req, res) {
  const { doc, buffer } = await documents.downloadDocument(ctx(req), uuid.parse(req.params.id));
  res.set({
    'Content-Type': doc.mimeType,
    'Content-Length': buffer.length,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`,
    'Cache-Control': 'private, no-store',
  });
  res.send(buffer);
}

export async function remove(req, res) {
  res.json(await documents.deleteDocument(ctx(req), uuid.parse(req.params.id)));
}
