import { prisma } from '../db.js';

function buildWhere({ action, actorId, resourceType, resourceId, from, to }) {
  const where = {};
  if (action) where.action = action;
  if (actorId) where.actorId = BigInt(actorId);
  if (resourceType) where.resourceType = resourceType;
  if (resourceId) where.resourceId = resourceId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }
  return where;
}

export function listAuditLogs({ action, actorId, resourceType, resourceId, from, to, limit, offset = 0 }) {
  const where = buildWhere({ action, actorId, resourceType, resourceId, from, to });
  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });
}

export function countAuditLogs({ action, actorId, resourceType, resourceId, from, to }) {
  return prisma.auditLog.count({
    where: buildWhere({ action, actorId, resourceType, resourceId, from, to }),
  });
}
