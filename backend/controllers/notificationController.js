import { z } from 'zod';
import * as notifications from '../services/notificationService.js';
import { ctx } from './util.js';

export async function list(req, res) {
  const q = z.object({ unread: z.enum(['true', 'false']).optional() }).parse(req.query);
  res.json(await notifications.listNotifications(ctx(req), { unreadOnly: q.unread === 'true' }));
}

export async function markRead(req, res) {
  res.json(await notifications.markRead(ctx(req), z.string().uuid().parse(req.params.id)));
}

export async function markAllRead(req, res) {
  res.json(await notifications.markAllRead(ctx(req)));
}