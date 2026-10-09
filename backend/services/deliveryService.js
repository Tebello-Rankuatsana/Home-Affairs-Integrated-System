import { prisma } from '../db.js';
import { sendSms, sendEmail } from './messaging.js';
import { t } from '../i18n.js';

export async function deliverNotification(notificationId) {
  const n = await prisma.notification.findUnique({
    where: { notificationId: BigInt(notificationId) },
    include: { citizen: { include: { profile: true } } },
  });
  if (!n || n.status === 'SENT') return;

  try {
    if (n.channel === 'SMS') {
      if (!n.citizen.phone) return;
      await sendSms(n.citizen.phone, n.message);
    } else if (n.channel === 'EMAIL') {
      if (!n.citizen.contactEmail) return;
      const lang = n.citizen.profile?.preferredLanguage ?? 'en';
      await sendEmail(n.citizen.contactEmail, t(lang, 'otp.email.subject'), n.message);
    }
    await prisma.notification.update({
      where: { notificationId: n.notificationId },
      data: { status: 'SENT', error: null },
    });
  } catch (err) {
    await prisma.notification.update({
      where: { notificationId: n.notificationId },
      data: { status: 'FAILED', error: String(err.message).slice(0, 300) },
    });
    throw err;
  }
}