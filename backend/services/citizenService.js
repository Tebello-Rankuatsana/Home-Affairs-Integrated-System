import { prisma } from '../db.js';
import { store, identityCacheKey } from '../cache.js';
import { audit } from '../audit.js';
import { httpError } from '../middleware/error.js';

export async function getOwnProfile(ctx) {
  const profile = await prisma.citizenProfile.findUnique({ where: { userId: ctx.user.id } });
  if (!profile) throw httpError(404, 'Profile not found');
  return profile;
}

export async function updateSelf(ctx, changes) {
  const profile = await prisma.citizenProfile.findUnique({ where: { userId: ctx.user.id } });
  if (!profile) throw httpError(404, 'Profile not found');

  const updated = await prisma.citizenProfile.update({
    where: { id: profile.id },
    data: changes,
  });

  await audit(ctx, {
    action: 'CITIZEN_SELF_UPDATE',
    resourceType: 'CitizenProfile',
    resourceId: profile.id,
    details: { fieldsChanged: Object.keys(changes) },
  });
  return updated;
}

export async function createCitizen(ctx, data) {
  const existing = await prisma.citizenProfile.findUnique({ where: { nationalId: data.nationalId } });
  if (existing) throw httpError(409, 'A citizen with this national ID already exists');

  const user = await prisma.user.create({
    data: {
      role: 'CITIZEN',
      citizenProfile: {
        create: {
          nationalId: data.nationalId,
          fullName: data.fullName,
          dateOfBirth: new Date(`${data.dateOfBirth}T00:00:00Z`),
          citizenship: data.citizenship,
          address: data.address,
          phone: data.phone,
          email: data.email ?? null,
          preferredLanguage: data.preferredLanguage ?? 'en',
        },
      },
    },
    include: { citizenProfile: true },
  });

  await audit(ctx, {
    action: 'CITIZEN_CREATE',
    resourceType: 'CitizenIdentity',
    resourceId: data.nationalId,
  });
  return user.citizenProfile;
}

export async function updateCitizen(ctx, nationalId, changes) {
  const existing = await prisma.citizenProfile.findUnique({ where: { nationalId } });
  if (!existing) throw httpError(404, 'Citizen not found');

  const record = await prisma.citizenProfile.update({ where: { nationalId }, data: changes });
  await store.del(identityCacheKey(nationalId));

  const fieldsChanged = Object.keys(changes);
  await audit(ctx, {
    action: 'CITIZEN_UPDATE',
    resourceType: 'CitizenIdentity',
    resourceId: nationalId,
    details: { fieldsChanged },
  });
  return { message: 'Citizen record updated', fieldsChanged, record };
}