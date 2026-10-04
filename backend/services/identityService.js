import { prisma } from '../db.js';
import { config } from '../config.js';
import { getJSON, setJSON, identityCacheKey } from '../cache.js';
import { audit } from '../audit.js';
import { httpError } from '../middleware/error.js';
import { IDENTITY_FIELDS } from '../constants.js';

// Read-through cache: Redis first, Home Affairs database on a miss
async function loadIdentity(nationalId) {
  const cached = await getJSON(identityCacheKey(nationalId));
  if (cached) return { record: cached, cache: 'hit' };

  const p = await prisma.citizenProfile.findUnique({ where: { nationalId } });
  if (!p) return { record: null, cache: 'miss' };

  const record = {
    fullName: p.fullName,
    dateOfBirth: p.dateOfBirth.toISOString().slice(0, 10),
    citizenship: p.citizenship,
    address: p.address,
    phone: p.phone,
  };
  await setJSON(identityCacheKey(nationalId), record, config.identityCacheTtlSeconds);
  return { record, cache: 'miss' };
}

/**
 * A department asks Home Affairs to verify a citizen.
 *  - Department staff must give an applicationId belonging to THEIR department (purpose limitation);
 *    the citizen is derived from that application and cannot be typed in freely.
 *  - Home Affairs officers may look up by national ID.
 *  - The response only contains fields in the caller's department scope.
 *  - Every release is audited (field names only, never values).
 */
export async function verifyIdentity(ctx, { applicationId, nationalId: lookupId }) {
  const { user } = ctx;
  let nationalId = lookupId;

  if (user.role === 'DEPARTMENT_STAFF') {
    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { serviceType: true, citizen: true },
    });
    if (!app || app.serviceType.departmentId !== user.departmentId) {
      throw httpError(404, 'Application not found for your department');
    }
    nationalId = app.citizen.nationalId;
  }

  const { record, cache } = await loadIdentity(nationalId);
  if (!record) {
    await audit(ctx, { action: 'IDENTITY_NOT_FOUND', resourceType: 'CitizenIdentity', resourceId: nationalId });
    throw httpError(404, 'No verified identity found');
  }

  const scopes = await prisma.departmentFieldScope.findMany({ where: { departmentId: user.departmentId } });
  const fieldsReleased = scopes.map((s) => s.field).filter((f) => IDENTITY_FIELDS.includes(f));
  const data = Object.fromEntries(fieldsReleased.map((f) => [f, record[f]]));

  await audit(ctx, {
    action: 'IDENTITY_VERIFY',
    resourceType: 'CitizenIdentity',
    resourceId: nationalId,
    details: { applicationId: applicationId ?? null, fieldsReleased, cache },
  });

  return { verified: true, source: 'HOME_AFFAIRS', nationalId, cache, data };
}
