import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { store, identityCacheKey } from '../cache.js';
import { audit } from '../audit.js';
import { httpError } from '../middleware/error.js';

export async function getOwnProfile(ctx) {
  const citizen = await prisma.citizen.findUnique({
    where: { citizenId: BigInt(ctx.user.id) },
    include: { profile: true },
  });
  if (!citizen) throw httpError(404, 'Profile not found');

  return {
    id: String(citizen.citizenId),
    nationalId: citizen.nationalIdNumber,
    fullName: `${citizen.firstName} ${citizen.lastName}`.trim(),
    firstName: citizen.firstName,
    lastName: citizen.lastName,
    dateOfBirth: citizen.dateOfBirth,
    citizenship: citizen.citizenshipStatus,
    address: citizen.address,
    phone: citizen.phone,
    email: citizen.contactEmail,
    preferredLanguage: citizen.profile?.preferredLanguage ?? 'en',
  };
}

export async function updateSelf(ctx, changes) {
  const citizenId = BigInt(ctx.user.id);

  if (changes.email !== undefined) {
    await prisma.citizen.update({
      where: { citizenId },
      data: { contactEmail: changes.email },
    });
  }
  if (changes.preferredLanguage !== undefined) {
    await prisma.citizenProfile.upsert({
      where: { citizenId },
      update: { preferredLanguage: changes.preferredLanguage },
      create: { citizenId, preferredLanguage: changes.preferredLanguage },
    });
  }

  await audit(ctx, {
    action: 'CITIZEN_SELF_UPDATE',
    resourceType: 'citizen',
    resourceId: citizenId,
    details: { fieldsChanged: Object.keys(changes) },
  });
  return getOwnProfile(ctx);
}

export async function createCitizen(ctx, data) {
  const existing = await prisma.citizen.findUnique({
    where: { nationalIdNumber: data.nationalId },
  });
  if (existing) throw httpError(409, 'A citizen with this national ID already exists');

  const { firstName, lastName } = splitName(data.fullName);

  const created = await prisma.citizen.create({
    data: {
      nationalIdNumber: data.nationalId,
      firstName: firstName || 'Unknown',
      lastName: lastName || 'Unknown',
      dateOfBirth: new Date(`${data.dateOfBirth}T00:00:00Z`),
      gender: data.gender ?? 'UNSPECIFIED',
      citizenshipStatus: data.citizenship ?? null,
      contactEmail: data.email ?? null,
      phone: data.phone ?? null,
      address: data.address ?? null,
      profile: {
        create: {
          preferredLanguage: data.preferredLanguage ?? 'en',
          accountStatus: 'ACTIVE',
        },
      },
    },
  });

  await audit(ctx, {
    action: 'CITIZEN_CREATE',
    resourceType: 'citizen',
    resourceId: created.citizenId,
  });
  return { id: String(created.citizenId), nationalId: created.nationalIdNumber };
}

export async function updateCitizen(ctx, nationalId, changes) {
  const existing = await prisma.citizen.findUnique({
    where: { nationalIdNumber: nationalId },
  });
  if (!existing) throw httpError(404, 'Citizen not found');

  const data = {};
  if (changes.fullName !== undefined) {
    const { firstName, lastName } = splitName(changes.fullName);
    if (firstName) data.firstName = firstName;
    if (lastName) data.lastName = lastName;
  }
  if (changes.address !== undefined) data.address = changes.address;
  if (changes.phone !== undefined) data.phone = changes.phone;

  await prisma.citizen.update({ where: { citizenId: existing.citizenId }, data });
  await store.del(identityCacheKey(nationalId));

  const fieldsChanged = Object.keys(changes);
  await audit(ctx, {
    action: 'CITIZEN_UPDATE',
    resourceType: 'citizen_identity',
    resourceId: nationalId,
    details: { fieldsChanged },
  });
  return { message: 'Citizen record updated', fieldsChanged };
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}