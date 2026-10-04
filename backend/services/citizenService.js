import { prisma } from '../db.js';
import { store, identityCacheKey } from '../cache.js';
import { audit } from '../audit.js';
import { httpError } from '../middleware/error.js';

export function getOwnProfile(ctx) {
  return prisma.citizenProfile.findUnique({ where: { userId: ctx.user.id } });
}

// Home Affairs maintains the authoritative record. Any change must clear the cached copy.
export async function updateCitizen(ctx, nationalId, changes) {
  const existing = await prisma.citizenProfile.findUnique({ where: { nationalId } });
  if (!existing) throw httpError(404, 'Citizen not found');

  await prisma.citizenProfile.update({ where: { nationalId }, data: changes });
  await store.del(identityCacheKey(nationalId));

  const fieldsChanged = Object.keys(changes);
  await audit(ctx, {
    action: 'CITIZEN_UPDATE',
    resourceType: 'CitizenIdentity',
    resourceId: nationalId,
    details: { fieldsChanged },
  });
  return { message: 'Citizen record updated', fieldsChanged };
}
