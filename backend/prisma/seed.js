import bcrypt from 'bcryptjs';
import {prisma} from '../db.js';
import { config } from '../config.js';

if (config.isProd && !process.env.SEED_PASSWORD) {
  throw new Error('Set SEED_PASSWORD before seeding a production database.');
}
const PASSWORD = process.env.SEED_PASSWORD || 'ChangeMe-12345';
const passwordHash = await bcrypt.hash(PASSWORD, 10);

const MINISTRIES = [
  { code: 'MHA', name: 'Ministry of Home Affairs' },
  { code: 'MPWT', name: 'Ministry of Public Works and Transport' },
  { code: 'MFDP', name: 'Ministry of Finance and Development Planning' },
  { code: 'MPOL', name: 'Ministry of Police' },
];

const DEPARTMENTS = [
  { code: 'HOME_AFFAIRS', name: 'Home Affairs', ministry: 'MHA',
    fields: ['fullName', 'dateOfBirth', 'citizenship', 'address', 'phone'] },
  { code: 'TRAFFIC', name: 'Traffic and Transport', ministry: 'MPWT',
    fields: ['fullName', 'dateOfBirth', 'citizenship', 'address'] },
  { code: 'FINANCE', name: 'Finance', ministry: 'MFDP',
    fields: ['fullName', 'citizenship'] },
  { code: 'PENSION', name: 'Pension Services', ministry: 'MFDP',
    fields: ['fullName', 'dateOfBirth', 'citizenship'] },
  { code: 'POLICE', name: 'Police Services', ministry: 'MPOL',
    fields: ['fullName', 'citizenship'] },
  { code: 'PASSPORT', name: 'Passport Services', ministry: 'MHA',
    fields: ['fullName', 'dateOfBirth', 'citizenship', 'address'] },
];

const ROLES = ['CITIZEN', 'ADMIN', 'HOME_AFFAIRS_OFFICER', 'DEPARTMENT_STAFF'];

const SERVICES = [
  { code: 'DRIVING_LICENCE', name: 'Driving licence', dept: 'TRAFFIC',
    docs: ['NATIONAL_ID', 'PROOF_OF_RESIDENCE', 'PHOTO'], fee: 150, days: 14 },
  { code: 'VEHICLE_REGISTRATION', name: 'Vehicle registration', dept: 'TRAFFIC',
    docs: ['NATIONAL_ID', 'PROOF_OF_RESIDENCE'], fee: 200, days: 10 },
  { code: 'PASSPORT_APPLICATION', name: 'Passport application', dept: 'PASSPORT',
    docs: ['NATIONAL_ID', 'BIRTH_CERTIFICATE', 'PHOTO'], fee: 400, days: 21 },
  { code: 'PENSION_APPLICATION', name: 'Pension application', dept: 'PENSION',
    docs: ['NATIONAL_ID', 'BIRTH_CERTIFICATE'], fee: null, days: 30 },
  { code: 'SUBSIDY_APPLICATION', name: 'Grant / subsidy application', dept: 'FINANCE',
    docs: ['NATIONAL_ID', 'PROOF_OF_INCOME'], fee: null, days: 30 },
  { code: 'POLICE_CLEARANCE', name: 'Police clearance certificate', dept: 'POLICE',
    docs: ['NATIONAL_ID', 'PHOTO'], fee: 100, days: 7 },
];

const CITIZENS = [
  { nationalId: '1990010100001', firstName: 'Thabo', lastName: 'Mokoena',
    dateOfBirth: '1990-01-01', gender: 'M',
    citizenship: 'Lesotho', address: '12 Example Street',
    phone: '+15550100001', email: 'thabo@example.test' },
  { nationalId: '1985050500002', firstName: 'Palesa', lastName: 'Molapo',
    dateOfBirth: '1985-05-05', gender: 'F',
    citizenship: 'Lesotho', address: '34 Sample Road',
    phone: '+15550100002', email: 'palesa@example.test' },
  { nationalId: '1955112200003', firstName: 'Mpho', lastName: 'Letsie',
    dateOfBirth: '1955-11-22', gender: 'M',
    citizenship: 'Lesotho', address: '7 Demo Lane',
    phone: '+15550100003', email: null },
];

const STAFF = [
  { email: 'admin@gov.example', role: 'ADMIN', dept: 'HOME_AFFAIRS',
    firstName: 'System', lastName: 'Admin' },
  { email: 'officer@gov.example', role: 'HOME_AFFAIRS_OFFICER', dept: 'HOME_AFFAIRS',
    firstName: 'Officer', lastName: 'Home' },
  { email: 'traffic.staff@gov.example', role: 'DEPARTMENT_STAFF', dept: 'TRAFFIC',
    firstName: 'Traffic', lastName: 'Staff' },
  { email: 'passport.staff@gov.example', role: 'DEPARTMENT_STAFF', dept: 'PASSPORT',
    firstName: 'Passport', lastName: 'Staff' },
  { email: 'pension.staff@gov.example', role: 'DEPARTMENT_STAFF', dept: 'PENSION',
    firstName: 'Pension', lastName: 'Staff' },
  { email: 'finance.staff@gov.example', role: 'DEPARTMENT_STAFF', dept: 'FINANCE',
    firstName: 'Finance', lastName: 'Staff' },
  { email: 'police.staff@gov.example', role: 'DEPARTMENT_STAFF', dept: 'POLICE',
    firstName: 'Police', lastName: 'Staff' },
];

// ministries
const ministryIds = {};
for (const m of MINISTRIES) {
  const row = await prisma.ministry.upsert({
    where: { ministryCode: m.code },
    update: { ministryName: m.name },
    create: { ministryCode: m.code, ministryName: m.name },
  });
  ministryIds[m.code] = row.ministryId;
}

// departments and their scopes
const deptIds = {};
for (const d of DEPARTMENTS) {
  const row = await prisma.department.upsert({
    where: { departmentCode: d.code },
    update: { departmentName: d.name, ministryId: ministryIds[d.ministry] },
    create: {
      departmentCode: d.code,
      departmentName: d.name,
      ministryId: ministryIds[d.ministry],
    },
  });
  deptIds[d.code] = row.departmentId;

  await prisma.departmentFieldScope.createMany({
    data: d.fields.map((field) => ({ departmentId: row.departmentId, field })),
    skipDuplicates: true,
  });
}

// roles
const roleIds = {};
for (const name of ROLES) {
  const row = await prisma.role.upsert({
    where: { roleName: name },
    update: {},
    create: { roleName: name },
  });
  roleIds[name] = row.roleId;
}

// services
for (const s of SERVICES) {
  const data = {
    name: s.name,
    departmentId: deptIds[s.dept],
    requiredDocuments: s.docs,
    feeAmount: s.fee,
    currency: 'LSL',
    processingTimeDays: s.days,
    availableOnline: true,
  };
  await prisma.serviceType.upsert({
    where: { code: s.code },
    update: data,
    create: { code: s.code, ...data },
  });
}

// staff accounts
for (const s of STAFF) {
  const deptId = deptIds[s.dept];
  const ministryId = ministryIds[DEPARTMENTS.find((d) => d.code === s.dept).ministry];

  const staff = await prisma.staff.upsert({
    where: { email: s.email },
    update: {
      firstName: s.firstName,
      lastName: s.lastName,
      departmentId: deptId,
      ministryId,
    },
    create: {
      email: s.email,
      firstName: s.firstName,
      lastName: s.lastName,
      employeeNumber: `EMP-${s.email.split('@')[0]}`,
      departmentId: deptId,
      ministryId,
    },
  });

  const existingCred = await prisma.authenticationCredential.findFirst({
    where: { staffId: staff.staffId, credentialType: 'PASSWORD' },
  });
  if (!existingCred) {
    await prisma.authenticationCredential.create({
      data: {
        staffId: staff.staffId,
        credentialType: 'PASSWORD',
        credentialHash: passwordHash,
        activeStatus: true,
      },
    });
  }

  await prisma.staffRole.deleteMany({ where: { staffId: staff.staffId } });
  await prisma.staffRole.create({
    data: { staffId: staff.staffId, roleId: roleIds[s.role] },
  });
}

// citizens
for (const c of CITIZENS) {
  const exists = await prisma.citizen.findUnique({
    where: { nationalIdNumber: c.nationalId },
  });
  if (exists) continue;

  await prisma.citizen.create({
    data: {
      nationalIdNumber: c.nationalId,
      firstName: c.firstName,
      lastName: c.lastName,
      dateOfBirth: new Date(`${c.dateOfBirth}T00:00:00Z`),
      gender: c.gender,
      citizenshipStatus: c.citizenship,
      address: c.address,
      phone: c.phone,
      contactEmail: c.email,
      profile: {
        create: { preferredLanguage: 'en', accountStatus: 'ACTIVE' },
      },
    },
  });
}

console.log('Seed complete.\n');
console.log(`Staff logins (password: ${PASSWORD}):`);
for (const s of STAFF) console.log(`  ${s.role.padEnd(22)} ${s.email}`);
console.log('\nCitizen national IDs (the one-time code is returned as devOtp outside production):');
for (const c of CITIZENS) console.log(`  ${c.nationalId}  ${c.firstName} ${c.lastName}`);

await prisma.$disconnect();
process.exit(0);