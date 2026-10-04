import { prisma } from './db.js';

/**
 * Write one append-only audit entry.
 * `ctx` is { user, ip } (an Express req also works). `actor` overrides ctx.user (used for login,
 * where nobody is authenticated yet). Never put raw personal data in `details`; log field names, not values.
 */
export async function audit(ctx, { action, resourceType, resourceId, details }, actor) {
  const user = actor ?? ctx.user ?? null;
  await prisma.auditLog.create({
    data: {
      actorId: user?.id ?? null,
      actorRole: user?.role ?? null,
      departmentCode: user?.departmentCode ?? null,
      action,
      resourceType,
      resourceId: resourceId ?? null,
      details: details ?? undefined,
      ip: ctx.ip ?? null,
    },
  });
}
