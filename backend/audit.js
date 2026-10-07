import { prisma } from './db.js';

export async function audit(ctx, entry, actorOverride) {
  const actor = actorOverride ?? ctx.user ?? null;
  const { action, resourceType, resourceId, details } = entry;

  await prisma.auditLog.create({
    data: {
      actorId: actor ? BigInt(actor.id) : null,
      actorRole: actor?.role ?? null,
      departmentCode: actor?.departmentCode ?? null,
      action,
      resourceType,
      resourceId: resourceId != null ? String(resourceId) : null,
      details: details ?? undefined,
      ip: ctx.ip ?? null,
    },
  });
}