// prisma/seed.js
// Idempotent: safe to run multiple times.
//   npx prisma db seed   (or)   node prisma/seed.js

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Check your .env file.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'ChangeMe-12345';

const SELF_SERVICE_CODES = ['ID_APPLICATION', 'BIRTH_CERTIFICATE'];

const DEMO_CITIZENS = [
  {
    nationalIdNumber: '1990010100001',
    firstName: 'Amara',
    lastName: 'Okonkwo',
    dateOfBirth: new Date('1990-01-01'),
    gender: 'F',
    citizenshipStatus: 'CITIZEN',
    contactEmail: 'amara.okonkwo@demo.ls',
    phone: '+26658000001',
    address: '12 Main Street, Maseru',
    temporaryId: false,
    registrationStatus: 'ACTIVE',
  },
  {
    nationalIdNumber: '1985050500002',
    firstName: 'Thabo',
    lastName: 'Mokoena',
    dateOfBirth: new Date('1985-05-05'),
    gender: 'M',
    citizenshipStatus: 'CITIZEN',
    contactEmail: 'thabo.mokoena@demo.ls',
    phone: '+26658000002',
    address: '45 Market Road, Maseru',
    temporaryId: false,
    registrationStatus: 'ACTIVE',
  },
  {
    nationalIdNumber: 'TMP-20260101-0001',
    firstName: 'Palesa',
    lastName: 'Mofokeng',
    dateOfBirth: new Date('2003-08-14'),
    gender: 'F',
    citizenshipStatus: 'CITIZEN',
    contactEmail: 'palesa.mofokeng@demo.ls',
    phone: '+26658000003',
    address: '7 Hill Road, Maseru',
    placeOfBirth: 'Maseru',
    parentGuardianNames: 'Maria Mofokeng',
    temporaryId: true,
    temporaryIdExpiresAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    registrationStatus: 'ACTIVE',
  },
  {
    nationalIdNumber: '1992121200004',
    firstName: 'Kabelo',
    lastName: 'Thabane',
    dateOfBirth: new Date('1992-12-12'),
    gender: 'M',
    citizenshipStatus: 'CITIZEN',
    contactEmail: null,
    phone: '+26658000004',
    address: '3 River View, Maseru',
    temporaryId: false,
    registrationStatus: 'ACTIVE',
    skipPassword: true,
  },
];

async function ensureMinistry() {
  return prisma.ministry.upsert({
    where: { ministryCode: 'MHA' },
    update: {},
    create: { ministryName: 'Ministry of Home Affairs', ministryCode: 'MHA' },
  });
}

async function ensureDepartment(ministryId, code, name) {
  return prisma.department.upsert({
    where: { departmentCode: code },
    update: {},
    create: { ministryId, departmentName: name, departmentCode: code },
  });
}

async function ensureSelfServices(homeAffairsId) {
  const idService = await prisma.serviceType.upsert({
    where: { code: 'ID_APPLICATION' },
    update: { accessLevel: 'ANY_ID' },
    create: {
      departmentId: homeAffairsId,
      name: 'National ID Application',
      code: 'ID_APPLICATION',
      processingTimeDays: 14,
      feeAmount: 0,
      currency: 'LSL',
      availableOnline: true,
      requiredDocuments: [],
      accessLevel: 'ANY_ID',
      helpContent:
        'Apply for a new national ID. Temporary-ID holders can use this service ' +
        'to complete the identity verification required to unlock all other services.',
    },
  });
  const bcService = await prisma.serviceType.upsert({
    where: { code: 'BIRTH_CERTIFICATE' },
    update: { accessLevel: 'ANY_ID' },
    create: {
      departmentId: homeAffairsId,
      name: 'Birth Certificate',
      code: 'BIRTH_CERTIFICATE',
      processingTimeDays: 10,
      feeAmount: 0,
      currency: 'LSL',
      availableOnline: true,
      requiredDocuments: [],
      accessLevel: 'ANY_ID',
      helpContent: 'Request a certified copy of a Lesotho birth certificate.',
    },
  });
  console.log(`✔ Self-services ready: ${idService.code}, ${bcService.code}`);
}

async function lockDownEverythingElse() {
  const result = await prisma.serviceType.updateMany({
    where: { code: { notIn: SELF_SERVICE_CODES } },
    data: { accessLevel: 'FULL_ID' },
  });
  console.log(`✔ Set accessLevel='FULL_ID' on ${result.count} services.`);
}

async function ensureCitizen(spec) {
  const existing = await prisma.citizen.findUnique({
    where: { nationalIdNumber: spec.nationalIdNumber },
    include: { credentials: { where: { credentialType: 'PASSWORD' } } },
  });

  const citizenData = {
    nationalIdNumber: spec.nationalIdNumber,
    firstName: spec.firstName,
    lastName: spec.lastName,
    dateOfBirth: spec.dateOfBirth,
    gender: spec.gender,
    citizenshipStatus: spec.citizenshipStatus ?? 'CITIZEN',
    contactEmail: spec.contactEmail ?? null,
    phone: spec.phone ?? null,
    address: spec.address ?? null,
    temporaryId: spec.temporaryId ?? false,
    temporaryIdExpiresAt: spec.temporaryIdExpiresAt ?? null,
    registrationStatus: spec.registrationStatus ?? 'ACTIVE',
    placeOfBirth: spec.placeOfBirth ?? null,
    parentGuardianNames: spec.parentGuardianNames ?? null,
    passwordSet: !spec.skipPassword,
  };

  let citizen = existing;
  if (!citizen) {
    citizen = await prisma.citizen.create({
      data: citizenData,
      include: { credentials: { where: { credentialType: 'PASSWORD' } } },
    });
    await prisma.citizenProfile.create({
      data: { citizenId: citizen.citizenId, accountStatus: 'ACTIVE' },
    }).catch(() => {});
    console.log(`✔ Created citizen ${spec.nationalIdNumber} (${spec.firstName} ${spec.lastName})`);
  } else {
    console.log(`✔ Citizen ${spec.nationalIdNumber} already exists — leaving fields intact.`);
  }

  if (spec.skipPassword) {
    console.log(`  ↳ password intentionally NOT set (OTP-only account)`);
    return citizen;
  }

  const hasPassword = citizen.credentials.some((c) => c.activeStatus !== false);
  if (hasPassword) {
    console.log(`  ↳ password already set — not overwriting.`);
    return citizen;
  }

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await prisma.authenticationCredential.create({
    data: {
      citizenId: citizen.citizenId,
      credentialType: 'PASSWORD',
      credentialHash: hash,
      activeStatus: true,
    },
  });
  console.log(`  ↳ password set: ${DEMO_PASSWORD}`);
  return citizen;
}

async function main() {
  console.log('\n=== Seeding GovServe Lesotho ===\n');

  const ministry = await ensureMinistry();
  const homeAffairs = await ensureDepartment(ministry.ministryId, 'HOME_AFFAIRS', 'Home Affairs');
  const traffic = await ensureDepartment(ministry.ministryId, 'TRAFFIC', 'Traffic and Transport');
  await ensureDepartment(ministry.ministryId, 'PASSPORT', 'Passport Services');
  await ensureDepartment(ministry.ministryId, 'POLICE', 'Police Clearance');

  const staffEmail = process.env.SEED_STAFF_EMAIL || 'traffic.staff@gov.example';
  const existingStaff = await prisma.staff.findUnique({ where: { email: staffEmail } });
  if (!existingStaff) {
    const staffPassword = process.env.SEED_PASSWORD || 'ChangeMe-12345';
    const hash = await bcrypt.hash(staffPassword, 10);
    await prisma.staff.create({
      data: {
        ministryId: ministry.ministryId,
        departmentId: traffic.departmentId,
        employeeNumber: 'EMP-0001',
        firstName: 'Traffic',
        lastName: 'Staff',
        email: staffEmail,
        phone: '+26658000100',
        credentials: {
          create: {
            credentialType: 'PASSWORD',
            credentialHash: hash,
            activeStatus: true,
          },
        },
      },
    });
    console.log(`✔ Created staff ${staffEmail} (password: ${staffPassword})`);
  } else {
    console.log(`✔ Staff ${staffEmail} already exists`);
  }

  await ensureSelfServices(homeAffairs.departmentId);
  await lockDownEverythingElse();

  console.log('\n--- Demo citizens ---');
  for (const spec of DEMO_CITIZENS) {
    await ensureCitizen(spec);
  }

  console.log('\n=== Seed complete ===\n');
  console.log('Demo credentials:');
  console.log('  Password for all accounts:', DEMO_PASSWORD);
  console.log('');
  console.log('  FULL-ID citizen  : 1990010100001  Amara Okonkwo');
  console.log('  FULL-ID citizen  : 1985050500002  Thabo Mokoena');
  console.log('  TEMP-ID citizen  : TMP-20260101-0001  Palesa Mofokeng (limited access)');
  console.log('  OTP-only citizen : 1992121200004  Kabelo Thabane (no password; use OTP)');
  console.log('');
  console.log('  Staff login      :', staffEmail, '/', DEMO_PASSWORD);
  console.log('');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());