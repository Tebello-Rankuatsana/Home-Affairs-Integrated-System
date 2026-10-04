import { prisma } from '../db.js';
import { sendSms, sendEmail } from './messaging.js';

// Sends one SMS/EMAIL notification. Throws on failure so BullMQ can retry with backoff.
export async function deliverNotification(notificationId) {
  const n = await prisma.notification.findUnique({ where: { id: notificationId }, include: { citizen: true } });
  if (!n || n.status === 'SENT') return;

  try {
    if (n.channel === 'SMS') await sendSms(n.citizen.phone, n.message);
    else if (n.channel === 'EMAIL') await sendEmail(n.citizen.email, 'Government Services update', n.message);
    await prisma.notification.update({ where: { id: n.id }, data: { status: 'SENT', error: null } });
  } catch (err) {
    await prisma.notification.update({ where: { id: n.id }, data: { status: 'FAILED', error: String(err.message).slice(0, 300) } });
    throw err;
  }
}
