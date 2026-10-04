import { prisma } from '../db.js';

export function listAuditLogs({ action, actorId, limit }) {
  const where = {};
  if (action) where.action = action;
  if (actorId) where.actorId = actorId;
  return prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
}
