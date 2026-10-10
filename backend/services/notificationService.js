import { prisma } from '../db.js';
import { enqueueDelivery } from './queue.js';
import { httpError } from '../middleware/error.js';
import { t, languageFor } from '../i18n.js';

function render(profile, payload) {
  if (payload.message) return payload.message;
  if (payload.messageKey) return t(languageFor(profile), payload.messageKey, payload.vars ?? {});
  return '';
}

// citizenId is the Citizen PK (BigInt). Profile/contact lookups use the real
// schema fields: CitizenProfile.citizenId, Citizen.phone / Citizen.contactEmail.
export async function notify(citizenId, payload) {
  try {
    const id = BigInt(citizenId);
    const citizen = await prisma.citizen.findUnique({
      where: { citizenId: id },
      include: { profile: true },
    });
    if (!citizen) return;

    const message = render(citizen.profile, payload);
    if (!message) return;

    await prisma.notification.create({
      data: { citizenId: id, channel: 'IN_APP', type: payload.type, message, status: 'SENT' },
    });

    const external = [];
    if (citizen.phone) external.push('SMS');
    if (citizen.contactEmail) external.push('EMAIL');

    for (const channel of external) {
      const n = await prisma.notification.create({
        data: { citizenId: id, channel, type: payload.type, message, status: 'PENDING' },
      });
      await enqueueDelivery(String(n.notificationId));
    }
  } catch (err) {
    console.error('notify failed:', err.message);
  }
}

async function ownCitizenId(ctx) {
  return BigInt(ctx.user.id);
}

export async function listNotifications(ctx, { unreadOnly }) {
  const citizenId = await ownCitizenId(ctx);

  const items = await prisma.notification.findMany({
    where: { citizenId, channel: 'IN_APP' },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const unreadCount = items.filter((n) => !n.readAt).length;
  const filtered = unreadOnly ? items.filter((n) => !n.readAt) : items;

  return {
    unreadCount,
    items: filtered.map(({ notificationId, type, message, readAt, createdAt }) => ({
      id: String(notificationId),
      type,
      message,
      readAt,
      createdAt,
    })),
  };
}

export async function markRead(ctx, id) {
  const citizenId = await ownCitizenId(ctx);
  const n = await prisma.notification.findUnique({ where: { notificationId: BigInt(id) } });
  if (!n || n.citizenId !== citizenId || n.channel !== 'IN_APP') {
    throw httpError(404, 'Notification not found');
  }
  if (!n.readAt) {
    await prisma.notification.update({
      where: { notificationId: n.notificationId },
      data: { readAt: new Date() },
    });
  }
  return { id: String(n.notificationId), read: true };
}

export async function markAllRead(ctx) {
  const citizenId = await ownCitizenId(ctx);
  const result = await prisma.notification.updateMany({
    where: { citizenId, channel: 'IN_APP', readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}
