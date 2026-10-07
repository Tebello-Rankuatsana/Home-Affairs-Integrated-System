import { prisma } from '../db.js';
import { enqueueDelivery } from './queue.js';
import { httpError } from '../middleware/error.js';
import { t, languageFor } from '../i18n.js';

function render(profile, payload) {
  if (payload.message) return payload.message;
  if (payload.messageKey) return t(languageFor(profile), payload.messageKey, payload.vars ?? {});
  return '';
}

export async function notify(citizenId, payload) {
  try {
    const profile = await prisma.citizenProfile.findUnique({ where: { id: citizenId } });
    if (!profile) return;

    const message = render(profile, payload);
    if (!message) return;

    await prisma.notification.create({
      data: { citizenId, channel: 'IN_APP', type: payload.type, message, status: 'SENT' },
    });

    const external = [];
    if (profile.phone) external.push('SMS');
    if (profile.email) external.push('EMAIL');

    for (const channel of external) {
      const n = await prisma.notification.create({
        data: { citizenId, channel, type: payload.type, message, status: 'PENDING' },
      });
      await enqueueDelivery(n.id);
    }
  } catch (err) {
    console.error('notify failed:', err.message);
  }
}

export async function listNotifications(ctx, { unreadOnly }) {
  const profile = await prisma.citizenProfile.findUnique({ where: { userId: ctx.user.id } });
  if (!profile) return { unreadCount: 0, items: [] };

  const items = await prisma.notification.findMany({
    where: { citizenId: profile.id, channel: 'IN_APP' },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const unreadCount = items.filter((n) => !n.readAt).length;
  const filtered = unreadOnly ? items.filter((n) => !n.readAt) : items;

  return {
    unreadCount,
    items: filtered.map(({ id, type, message, readAt, createdAt }) => ({
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
  if (!profile) throw httpError(404, 'Profile not found');
  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n || n.citizenId !== profile.id || n.channel !== 'IN_APP') {
    throw httpError(404, 'Notification not found');
  }
  if (!n.readAt) {
    await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }
  return { id, read: true };
}

export async function markAllRead(ctx) {
  const profile = await prisma.citizenProfile.findUnique({ where: { userId: ctx.user.id } });
  if (!profile) throw httpError(404, 'Profile not found');
  const result = await prisma.notification.updateMany({
    where: { citizenId: profile.id, channel: 'IN_APP', readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}