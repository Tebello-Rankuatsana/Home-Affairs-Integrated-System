// controllers/citizenController.js
import { z } from 'zod';
import { prisma } from '../db.js';
import { ctx } from './util.js';
import { httpError } from '../middleware/error.js';
import { audit } from '../audit.js';

// ---------------------------------------------------------------------------
// GET /me — current citizen profile
// ---------------------------------------------------------------------------
export async function me(req, res) {
  const citizenId = BigInt(req.user.id);

  const citizen = await prisma.citizen.findUnique({
    where: { citizenId },
    include: { profile: true },
  });
  if (!citizen) throw httpError(404, 'Citizen not found');

  res.json({
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

    // Fields the frontend reads to decide access:
    temporaryId: citizen.temporaryId,
    temporaryIdExpiresAt: citizen.temporaryIdExpiresAt,
    registrationStatus: citizen.registrationStatus,
    passwordSet: citizen.passwordSet,
  });
}

// ---------------------------------------------------------------------------
// PATCH /me — citizen updates their own contact details
// ---------------------------------------------------------------------------
export async function updateSelf(req, res) {
  const body = z
    .object({
      email: z.string().email().nullable().optional(),
      preferredLanguage: z.enum(['en', 'st']).optional(),
    })
    .parse(req.body);

  const citizenId = BigInt(req.user.id);

  const citizenUpdates = {};
  if (body.email !== undefined) citizenUpdates.contactEmail = body.email;

  if (Object.keys(citizenUpdates).length > 0) {
    await prisma.citizen.update({
      where: { citizenId },
      data: citizenUpdates,
    });
  }

  if (body.preferredLanguage !== undefined) {
    await prisma.citizenProfile.upsert({
      where: { citizenId },
      update: { preferredLanguage: body.preferredLanguage },
      create: { citizenId, preferredLanguage: body.preferredLanguage },
    });
  }

  await audit(ctx(req), {
    action: 'CITIZEN_SELF_UPDATE',
    resourceType: 'citizen',
    resourceId: citizenId,
    details: {
      fields: [
        ...(citizenUpdates.contactEmail !== undefined ? ['email'] : []),
        ...(body.preferredLanguage !== undefined ? ['preferredLanguage'] : []),
      ],
    },
  });

  // Return the same shape as /me so the frontend can refresh in place
  return me(req, res);
}

// ---------------------------------------------------------------------------
// POST /citizens — Home Affairs officer creates a citizen record
// ---------------------------------------------------------------------------
export async function create(req, res) {
  const body = z
    .object({
      nationalId: z.string().min(5).max(50),
      fullName: z.string().min(2).max(150),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      citizenship: z.string().min(2).max(50).default('Lesotho'),
      address: z.string().max(500).optional(),
      phone: z.string().min(7).max(20),
      email: z.string().email().optional(),
      gender: z.enum(['M', 'F', 'OTHER', 'UNSPECIFIED']).default('UNSPECIFIED'),
    })
    .parse(req.body);

  const existing = await prisma.citizen.findUnique({
    where: { nationalIdNumber: body.nationalId.trim() },
  });
  if (existing) {
    throw httpError(409, 'A citizen with this National ID already exists');
  }

  const [firstName, ...rest] = body.fullName.trim().split(/\s+/);
  const lastName = rest.join(' ') || 'Unknown';

  const citizen = await prisma.citizen.create({
    data: {
      nationalIdNumber: body.nationalId.trim(),
      firstName,
      lastName,
      dateOfBirth: new Date(`${body.dateOfBirth}T00:00:00.000Z`),
      gender: body.gender,
      citizenshipStatus: body.citizenship,
      address: body.address || null,
      phone: body.phone,
      contactEmail: body.email || null,
      profile: {
        create: { preferredLanguage: 'en', accountStatus: 'ACTIVE' },
      },
    },
  });

  await audit(ctx(req), {
    action: 'CITIZEN_CREATED',
    resourceType: 'citizen',
    resourceId: citizen.citizenId,
    details: { nationalId: citizen.nationalIdNumber },
  });

  res.status(201).json({
    id: String(citizen.citizenId),
    nationalId: citizen.nationalIdNumber,
    fullName: `${citizen.firstName} ${citizen.lastName}`.trim(),
    dateOfBirth: citizen.dateOfBirth,
    citizenship: citizen.citizenshipStatus,
    address: citizen.address,
    phone: citizen.phone,
    email: citizen.contactEmail,
    temporaryId: citizen.temporaryId,
    temporaryIdExpiresAt: citizen.temporaryIdExpiresAt,
    registrationStatus: citizen.registrationStatus,
  });
}

// ---------------------------------------------------------------------------
// PATCH /citizens/:nationalId — Home Affairs officer updates a citizen
// ---------------------------------------------------------------------------
export async function update(req, res) {
  const { nationalId } = req.params;
  const body = z
    .object({
      fullName: z.string().min(2).max(150).optional(),
      address: z.string().max(500).optional(),
      phone: z.string().min(7).max(20).optional(),
    })
    .parse(req.body);

  const citizen = await prisma.citizen.findUnique({
    where: { nationalIdNumber: nationalId },
  });
  if (!citizen) throw httpError(404, 'Citizen not found');

  const updates = {};
  if (body.fullName !== undefined) {
    const [firstName, ...rest] = body.fullName.trim().split(/\s+/);
    updates.firstName = firstName;
    updates.lastName = rest.join(' ') || 'Unknown';
  }
  if (body.address !== undefined) updates.address = body.address;
  if (body.phone !== undefined) updates.phone = body.phone;

  if (Object.keys(updates).length === 0) {
    throw httpError(400, 'Nothing to update');
  }

  const updated = await prisma.citizen.update({
    where: { citizenId: citizen.citizenId },
    data: updates,
  });

  await audit(ctx(req), {
    action: 'CITIZEN_UPDATED',
    resourceType: 'citizen',
    resourceId: citizen.citizenId,
    details: { fields: Object.keys(updates) },
  });

  res.json({
    message: 'Citizen record updated',
    fieldsChanged: Object.keys(updates),
  });
}