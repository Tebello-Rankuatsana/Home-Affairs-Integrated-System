// Demo data: departments, identity scopes, services, staff accounts and a few citizens.
// Safe to run repeatedly. Run with: npm run db:seed
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { config } from '../config.js';

if (config.isProd && !process.env.SEED_PASSWORD) {
  throw new Error('Set SEED_PASSWORD before seeding a production database.');
}
const PASSWORD = process.env.SEED_PASSWORD || 'ChangeMe-12345';
const passwordHash = await bcrypt.hash(PASSWORD, 10);

// departments and what identity data each may receive
const DEPARTMENTS = [
  { code: 'HOME_AFFAIRS', name: 'Home Affairs', ministry: 'Ministry of Home Affairs',
    fields: ['fullName', 'dateOfBirth', 'citizenship', 'address', 'phone'] },
  { code: 'TRAFFIC', name: 'Traffic and Transport', ministry: 'Ministry of Public Works and Transport',
    fields: ['fullName', 'dateOfBirth', 'citizenship', 'address'] },
  { code: 'FINANCE', name: 'Finance', ministry: 'Ministry of Finance and Development Planning',
    fields: ['fullName', 'citizenship'] },
  { code: 'PENSION', name: 'Pension Services', ministry: 'Ministry of Finance and Development Planning',
    fields: ['fullName', 'dateOfBirth', 'citizenship'] },
  { code: 'POLICE', name: 'Police Services', ministry: 'Ministry of Police',
    fields: ['fullName', 'citizenship'] },
  { code: 'PASSPORT', name: 'Passport Services', ministry: 'Ministry of Home Affairs',
    fields: ['fullName', 'dateOfBirth', 'citizenship', 'address'] },
];

// Fees are placeholder demo values (null = free)
const SERVICES = [
  { code: 'DRIVING_LICENCE', name: 'Driving licence', dept: 'TRAFFIC', docs: ['NATIONAL_ID', 'PROOF_OF_RESIDENCE', 'PHOTO'], fee: 150, days: 14 },
  { code: 'VEHICLE_REGISTRATION', name: 'Vehicle registration', dept: 'TRAFFIC', docs: ['NATIONAL_ID', 'PROOF_OF_RESIDENCE'], fee: 200, days: 10 },
  { code: 'PASSPORT_APPLICATION', name: 'Passport application', dept: 'PASSPORT', docs: ['NATIONAL_ID', 'BIRTH_CERTIFICATE', 'PHOTO'], fee: 400, days: 21 },
  { code: 'PENSION_APPLICATION', name: 'Pension application', dept: 'PENSION', docs: ['NATIONAL_ID', 'BIRTH_CERTIFICATE'], fee: null, days: 30 },
  { code: 'SUBSIDY_APPLICATION', name: 'Grant / subsidy application', dept: 'FINANCE', docs: ['NATIONAL_ID', 'PROOF_OF_INCOME'], fee: null, days: 30 },
  { code: 'POLICE_CLEARANCE', name: 'Police clearance certificate', dept: 'POLICE', docs: ['NATIONAL_ID', 'PHOTO'], fee: 100, days: 7 },
];

const CITIZENS = [
  { nationalId: '1990010100001', fullName: 'Thabo Mokoena', dateOfBirth: '1990-01-01', citizenship: 'Lesotho', address: '12 Example Street', phone: '+15550100001', email: 'thabo@example.test' },
  { nationalId: '1985050500002', fullName: 'Palesa Molapo', dateOfBirth: '1985-05-05', citizenship: 'Lesotho', address: '34 Sample Road', phone: '+15550100002', email: 'palesa@example.test' },
  { nationalId: '1955112200003', fullName: 'Mpho Letsie', dateOfBirth: '1955-11-22', citizenship: 'Lesotho', address: '7 Demo Lane', phone: '+15550100003', email: null },
];

const deptIds = {};
for (const d of DEPARTMENTS) {
  const dept = await prisma.department.upsert({
    where: { code: d.code },
    update: { name: d.name, ministry: d.ministry },
    create: { code: d.code, name: d.name, ministry: d.ministry },
  });
  deptIds[d.code] = dept.id;
  // skipDuplicates: re-seeding never removes or resets scopes an admin has changed
  await prisma.departmentFieldScope.createMany({
    data: d.fields.map((field) => ({ departmentId: dept.id, field })),
    skipDuplicates: true,
  });
}

for (const s of SERVICES) {
  const data = {
    name: s.name,
    departmentId: deptIds[s.dept],
    requiredDocuments: s.docs,
    feeAmount: s.fee,
    processingTimeDays: s.days,
  };
  await prisma.serviceType.upsert({ where: { code: s.code }, update: data, create: { code: s.code, ...data } });
}

// staff accounts
const STAFF = [
  { email: 'admin@gov.example', role: 'ADMIN', dept: null },
  { email: 'officer@gov.example', role: 'HOME_AFFAIRS_OFFICER', dept: 'HOME_AFFAIRS' },
  { email: 'traffic.staff@gov.example', role: 'DEPARTMENT_STAFF', dept: 'TRAFFIC' },
  { email: 'passport.staff@gov.example', role: 'DEPARTMENT_STAFF', dept: 'PASSPORT' },
  { email: 'pension.staff@gov.example', role: 'DEPARTMENT_STAFF', dept: 'PENSION' },
  { email: 'finance.staff@gov.example', role: 'DEPARTMENT_STAFF', dept: 'FINANCE' },
  { email: 'police.staff@gov.example', role: 'DEPARTMENT_STAFF', dept: 'POLICE' },
];
for (const s of STAFF) {
  const data = { role: s.role, departmentId: s.dept ? deptIds[s.dept] : null };
  await prisma.user.upsert({
    where: { email: s.email },
    update: data, // keeps the existing password and active flag
    create: { email: s.email, passwordHash, ...data },
  });
}

// citizen accounts
for (const c of CITIZENS) {
  const exists = await prisma.citizenProfile.findUnique({ where: { nationalId: c.nationalId } });
  if (exists) continue;
  await prisma.user.create({
    data: {
      role: 'CITIZEN',
      citizenProfile: { create: { ...c, dateOfBirth: new Date(`${c.dateOfBirth}T00:00:00Z`) } },
    },
  });
}

console.log('Seed complete.\n');
console.log(`Staff logins (password: ${PASSWORD}):`);
for (const s of STAFF) console.log(`  ${s.role.padEnd(22)} ${s.email}`);
console.log('\nCitizen national IDs (the one-time code is returned as devOtp outside production):');
for (const c of CITIZENS) console.log(`  ${c.nationalId}  ${c.fullName}`);

await prisma.$disconnect();
process.exit(0);