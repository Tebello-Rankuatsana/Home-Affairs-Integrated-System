// middleware/requireFullId.js
// Rejects requests from citizens whose temporary ID has expired, or who are
// trying to access a FULL_ID service with only a temporary ID.
import { prisma } from '../db.js';
import { SELF_SERVICE_CODES, CITIZEN_STATUS, SERVICE_ACCESS_LEVELS } from '../constants.js';

/**
 * Middleware: blocks citizens with expired/disabled accounts.
 * Attaches the citizen row to req.citizen so downstream handlers can read
 * temporaryId without a second query.
 */
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
    if (citizen.registrationStatus === CITIZEN_STATUS.DISABLED) {
      return res.status(403).json({
        error: 'Account disabled',
        hint: 'Your temporary ID has expired. Visit Home Affairs to complete your ID application.',
      });
    }
    if (
      citizen.temporaryId &&
      citizen.temporaryIdExpiresAt &&
      new Date(citizen.temporaryIdExpiresAt) < new Date()
    ) {
      // Auto-disable on first hit after expiry — cheap insurance against cron lag.
      await prisma.citizen.update({
        where: { citizenId: citizen.citizenId },
        data: { registrationStatus: CITIZEN_STATUS.DISABLED },
      });
      return res.status(403).json({
        error: 'Temporary ID expired',
        hint: 'Your temporary ID has expired. Visit Home Affairs to complete your ID application.',
      });
    }
    req.citizen = citizen;
    next();
  } catch (e) {
    next(e);
  }
}

/**
 * Middleware factory: ensures the requested service is accessible given
 * the citizen's identity state. Use on POST /applications or any endpoint
 * that accepts a `serviceCode`.
 *
 *   router.post('/applications', requireServiceAccess, handler)
 *
 * The body must contain `serviceCode`. On success, `req.serviceType` is
 * populated so the handler doesn't query it again.
 */
export async function requireServiceAccess(req, res, next) {
  if (!req.user || req.user.role !== 'CITIZEN') return next();
  const serviceCode = req.body?.serviceCode;
  if (!serviceCode) {
    return res.status(400).json({ error: 'serviceCode is required' });
  }
  try {
    const svc = await prisma.serviceType.findUnique({
      where: { code: serviceCode },
      select: { serviceId: true, code: true, name: true, accessLevel: true, departmentId: true },
    });
    if (!svc) {
      return res.status(404).json({ error: `Unknown service: ${serviceCode}` });
    }
    const citizen =
      req.citizen ??
      (await prisma.citizen.findUnique({
        where: { citizenId: BigInt(req.user.id) },
        select: { temporaryId: true },
      }));

    if (svc.accessLevel === SERVICE_ACCESS_LEVELS.STAFF_ONLY) {
      return res.status(403).json({
        error: 'Service is staff-only',
        hint: `${svc.name} is not available for online applications.`,
      });
    }

    if (
      svc.accessLevel === SERVICE_ACCESS_LEVELS.FULL_ID &&
      (citizen?.temporaryId || !SELF_SERVICE_CODES.includes(svc.code))
    ) {
      if (citizen?.temporaryId) {
        return res.status(403).json({
          error: 'Official ID required',
          hint: `Your temporary ID only unlocks ID and Birth Certificate services. Complete your ID application to access ${svc.name}.`,
        });
      }
    }

    req.serviceType = svc;
    next();
  } catch (e) {
    next(e);
  }
}