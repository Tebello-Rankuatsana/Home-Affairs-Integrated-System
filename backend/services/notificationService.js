import { prisma } from '../db.js';
import { enqueueDelivery } from './queue.js';
import { httpError } from '../middleware/error.js';

/**
 * Notify a citizen. The in-app notification is stored immediately; SMS and email go through the queue.
 * Never throws: a failed notification must not fail the request that triggered it.
 */
export async function notify(citizenId, { type, message }) {
  try {
    const profile = await prisma.citizenProfile.findUnique({ where: { id: citizenId } });
    if (!profile) return;

    await prisma.notification.create({ data: { citizenId, channel: 'IN_APP', type, message, status: 'SENT' } });

    const external = [];
    if (profile.phone) external.push('SMS');
    if (profile.email) external.push('EMAIL');
    for (const channel of external) {
      const n = await prisma.notification.create({ data: { citizenId, channel, type, message, status: 'PENDING' } });
      await enqueueDelivery(n.id);
    }
  } catch (err) {
    console.error('notify failed:', err.message);
  }
}

export async function listNotifications(ctx, { unreadOnly }) {
  const profile = await prisma.citizenProfile.findUnique({ where: { userId: ctx.user.id } });
  const where = { citizenId: profile.id, channel: 'IN_APP' };
  const items = await prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  const unreadCount = items.filter((n) => !n.readAt).length;
  return {
    unreadCount,
    items: (unreadOnly ? items.filter((n) => !n.readAt) : items).map(({ id, type, message, readAt, createdAt }) => ({
      id,
      type,
      message,
      readAt,
      createdAt,
    })),
  };
}

export async function markRead(ctx, id) {
  const profile = await prisma.citizenProfile.findUnique({ where: { userId: ctx.user.id } });
  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n || n.citizenId !== profile.id || n.channel !== 'IN_APP') throw httpError(404, 'Notification not found');
  if (!n.readAt) await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  return { id, read: true };
}
