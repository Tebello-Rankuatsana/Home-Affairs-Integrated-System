import { prisma } from '../db.js';
import { config } from '../config.js';
import { getJSON, setJSON, identityCacheKey } from '../cache.js';
import { audit } from '../audit.js';
import { httpError } from '../middleware/error.js';
import { IDENTITY_FIELDS } from '../constants.js';

async function loadIdentity(nationalId) {
  const cached = await getJSON(identityCacheKey(nationalId));
  if (cached) return { record: cached, cache: 'hit' };

  const c = await prisma.citizen.findUnique({ where: { nationalIdNumber: nationalId } });
  if (!c) return { record: null, cache: 'miss' };

  const record = {
    fullName: `${c.firstName} ${c.lastName}`.trim(),
    dateOfBirth: c.dateOfBirth.toISOString().slice(0, 10),
    citizenship: c.citizenshipStatus ?? null,
    address: c.address ?? null,
    phone: c.phone ?? null,
  };
  await setJSON(identityCacheKey(nationalId), record, config.identityCacheTtlSeconds);
  return { record, cache: 'miss' };
}

export async function verifyIdentity(ctx, { applicationId, nationalId: lookupId }) {
  const { user } = ctx;
  let nationalId = lookupId;
  let departmentId = null;
  let reason = null;

  if (user.role === 'DEPARTMENT_STAFF') {
    const app = await prisma.application.findUnique({
      where: { applicationId: BigInt(applicationId) },
      include: { citizen: true, department: true },
    });

    const staff = await prisma.staff.findUnique({
      where: { staffId: BigInt(user.id) },
      select: { departmentId: true },
    });
    if (!app || !staff || app.departmentId !== staff.departmentId) {
      throw httpError(404, 'Application not found for your department');
    }
    nationalId = app.citizen.nationalIdNumber;
    departmentId = staff.departmentId;
  } else {
    const staff = await prisma.staff.findUnique({
      where: { staffId: BigInt(user.id) },
      select: { departmentId: true },
    });
    departmentId = staff?.departmentId ?? null;
  }

  const { record, cache } = await loadIdentity(nationalId);
  if (!record) {
    await audit(ctx, {
      action: 'IDENTITY_NOT_FOUND',
      resourceType: 'citizen_identity',
      resourceId: nationalId,
    });
    throw httpError(404, 'No verified identity found');
  }

  const scopes = departmentId
    ? await prisma.departmentFieldScope.findMany({ where: { departmentId } })
    : [];
  const fieldsReleased = scopes.map((s) => s.field).filter((f) => IDENTITY_FIELDS.includes(f));
  const data = Object.fromEntries(fieldsReleased.map((f) => [f, record[f]]));

  const citizen = await prisma.citizen.findUnique({
    where: { nationalIdNumber: nationalId },
    select: { citizenId: true },
  });

  if (citizen && departmentId) {
    await prisma.identityRequest.create({
      data: {
        departmentId,
        citizenId: citizen.citizenId,
        requestedBy: BigInt(user.id),
        respondedAt: new Date(),
        reason: reason ?? (applicationId ? `verify for application ${applicationId}` : 'officer lookup'),
        fieldsReleased,
      },
    });
  }

  await audit(ctx, {
    action: 'IDENTITY_VERIFY',
    resourceType: 'citizen_identity',
    resourceId: nationalId,
    details: { applicationId: applicationId ?? null, fieldsReleased, cache },
  });

  return { verified: true, source: 'HOME_AFFAIRS', nationalId, cache, data };
}