// middleware/requireFullId.js
// Guards citizen endpoints against expired temporary IDs.
// Does NOT itself restrict which services a temp-ID holder can apply for —
// that check lives in applicationController.submit().
import { prisma } from '../db.js';

export async function requireActiveCitizen(req, res, next) {
  if (!req.user || req.user.role !== 'CITIZEN') return next();

  try {
    const citizen = await prisma.citizen.findUnique({
      where: { citizenId: BigInt(req.user.id) },
      select: {
        citizenId: true,
        nationalIdNumber: true,
        temporaryId: true,
        temporaryIdExpiresAt: true,
        registrationStatus: true,
      },
    });
    if (!citizen) {
      return res.status(401).json({ error: 'Account not found' });
    }

    if (citizen.registrationStatus === 'DISABLED') {
      return res.status(403).json({
        error: 'Account disabled',
        hint: 'Visit Home Affairs to complete your identity verification.',
      });
    }

    // Auto-disable if the temp ID has expired but the cron hasn't run yet.
    if (
      citizen.temporaryId &&
      citizen.temporaryIdExpiresAt &&
      new Date(citizen.temporaryIdExpiresAt) < new Date()
    ) {
      await prisma.citizen.update({
        where: { citizenId: citizen.citizenId },
        data: { registrationStatus: 'DISABLED' },
      });
      return res.status(403).json({
        error: 'Temporary ID expired',
        hint: 'Complete your ID application to restore access.',
      });
    }

    req.citizen = citizen;
    next();
  } catch (e) {
    next(e);
  }
}