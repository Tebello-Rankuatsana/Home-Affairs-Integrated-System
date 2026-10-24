import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
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
  {
    code: 'VEHICLE_REGISTRATION', name: 'Vehicle registration', dept: 'TRAFFIC',
    docs: ['NATIONAL_ID', 'PROOF_OF_RESIDENCE', 'PROOF_OF_INCOME'], 
    fee: 200, days: 10,
    formSchema: [
      { name: 'vehicleType', label: 'Vehicle Type', type: 'select', options: ['New', 'Used', 'Imported'], required: true },
      { name: 'vinNumber', label: 'VIN Number', type: 'text', required: true },
      { name: 'engineNumber', label: 'Engine Number', type: 'text', required: true },
      { name: 'make', label: 'Make', type: 'text', required: true },
      { name: 'model', label: 'Model', type: 'text', required: true },
      { name: 'year', label: 'Year of Manufacture', type: 'number', required: true },
      { name: 'color', label: 'Color', type: 'text', required: true },
      { name: 'previousOwnerId', label: 'Previous Owner ID (if Used)', type: 'text', required: false },
      { name: 'customsRef', label: 'Customs Clearance Ref (if Imported)', type: 'text', required: false }
    ]
  },
  {
    code: 'DRIVING_LICENCE', name: 'Driving licence', dept: 'TRAFFIC',
    docs: ['NATIONAL_ID', 'PROOF_OF_RESIDENCE', 'PHOTO'],
    fee: 150, days: 14,
    formSchema: [
      { name: 'vehicleClass', label: 'Vehicle Class', type: 'select', options: ['A', 'B', 'C', 'EB'], required: true },
      { name: 'isRenewal', label: 'Is this a renewal?', type: 'select', options: ['Yes', 'No'], required: true },
      { name: 'previousLicenceNo', label: 'Previous Licence Number (if renewal)', type: 'text', required: false }
    ]
  },
  {
    code: 'ID_APPLICATION', name: 'National ID Application', dept: 'HOME_AFFAIRS',
    docs: ['BIRTH_CERTIFICATE', 'PHOTO'],
    fee: 50, days: 5,
    formSchema: [
      { name: 'reason', label: 'Reason for Application', type: 'select', options: ['First Time', 'Lost', 'Replacement'], required: true },
      { name: 'previousIdNumber', label: 'Previous ID Number (if lost/replacement)', type: 'text', required: false }
    ]
  },
  {
    code: 'PASSPORT_APPLICATION', name: 'Passport application', dept: 'PASSPORT',
    docs: ['NATIONAL_ID', 'BIRTH_CERTIFICATE', 'PHOTO'],
    fee: 400, days: 21,
    formSchema: [
      { name: 'passportType', label: 'Passport Type', type: 'select', options: ['Normal', 'Official', 'Diplomatic'], required: true },
      { name: 'previousPassportNo', label: 'Previous Passport Number (if any)', type: 'text', required: false }
    ]
  },
  {
    code: 'PENSION_APPLICATION', name: 'Pension application', dept: 'PENSION',
    docs: ['NATIONAL_ID', 'BIRTH_CERTIFICATE'],
    fee: null, days: 30,
    formSchema: [
      { name: 'employerName', label: 'Last Employer Name', type: 'text', required: true },
      { name: 'retirementDate', label: 'Date of Retirement', type: 'date', required: true },
      { name: 'bankName', label: 'Bank Name', type: 'text', required: true },
      { name: 'accountNumber', label: 'Bank Account Number', type: 'text', required: true }
    ]
  },
  {
    code: 'POLICE_CLEARANCE', name: 'Police clearance certificate', dept: 'POLICE',
    docs: ['NATIONAL_ID', 'PHOTO'],
    fee: 100, days: 7,
    formSchema: [
      { name: 'reason', label: 'Reason for Clearance', type: 'select', options: ['Employment', 'Visa', 'Other'], required: true }
    ]
  }
];

const CITIZENS = [
  { nationalId: '1990010100001', firstName: 'Thabo', lastName: 'Mokoena',
    dateOfBirth: '1990-01-01', gender: 'M',
    citizenship: 'Lesotho', address: '12 Example Street',
    phone: '+15550100001', email: 'thabo@example.test' },
  { nationalId: '1985050500002', firstName: 'Palesa', lastName: 'Molapo',
    dateOfBirth: '1985-05-05', gender: 'F',
    citizenship: 'Lesotho', address: '34 Sample Road',
    phone: '+15550100002', email: 'palesa@example.test' }
];

const STAFF = [
  { email: 'admin@gov.example', role: 'ADMIN', dept: 'HOME_AFFAIRS', firstName: 'System', lastName: 'Admin' },
  { email: 'officer@gov.example', role: 'HOME_AFFAIRS_OFFICER', dept: 'HOME_AFFAIRS', firstName: 'Officer', lastName: 'Home' },
  { email: 'traffic.staff@gov.example', role: 'DEPARTMENT_STAFF', dept: 'TRAFFIC', firstName: 'Traffic', lastName: 'Staff' }
];

// --- Seeding Logic ---
const ministryIds = {};
for (const m of MINISTRIES) {
  const row = await prisma.ministry.upsert({ where: { ministryCode: m.code }, update: { ministryName: m.name }, create: { ministryCode: m.code, ministryName: m.name } });
  ministryIds[m.code] = row.ministryId;
}

const deptIds = {};
for (const d of DEPARTMENTS) {
  const row = await prisma.department.upsert({ where: { departmentCode: d.code }, update: { departmentName: d.name, ministryId: ministryIds[d.ministry] }, create: { departmentCode: d.code, departmentName: d.name, ministryId: ministryIds[d.ministry] } });
  deptIds[d.code] = row.departmentId;
  await prisma.departmentFieldScope.createMany({ data: d.fields.map((field) => ({ departmentId: row.departmentId, field })), skipDuplicates: true });
}

const roleIds = {};
for (const name of ROLES) {
  const row = await prisma.role.upsert({ where: { roleName: name }, update: {}, create: { roleName: name } });
  roleIds[name] = row.roleId;
}

for (const s of SERVICES) {
  const data = {
    name: s.name,
    departmentId: deptIds[s.dept],
    requiredDocuments: s.docs,
    feeAmount: s.fee,
    currency: 'LSL',
    processingTimeDays: s.days,
    availableOnline: true,
    formSchema: s.formSchema // Save the custom schema
  };
  await prisma.serviceType.upsert({ where: { code: s.code }, update: data, create: { code: s.code, ...data } });
}

for (const s of STAFF) {
  const deptId = deptIds[s.dept];
  const ministryId = ministryIds[DEPARTMENTS.find((d) => d.code === s.dept).ministry];
  const staff = await prisma.staff.upsert({ where: { email: s.email }, update: { firstName: s.firstName, lastName: s.lastName, departmentId: deptId, ministryId }, create: { email: s.email, firstName: s.firstName, lastName: s.lastName, employeeNumber: `EMP-${s.email.split('@')[0]}`, departmentId: deptId, ministryId } });
  
  const existingCred = await prisma.authenticationCredential.findFirst({ where: { staffId: staff.staffId, credentialType: 'PASSWORD' } });
  if (!existingCred) {
    await prisma.authenticationCredential.create({ data: { staffId: staff.staffId, credentialType: 'PASSWORD', credentialHash: passwordHash, activeStatus: true } });
  }
  await prisma.staffRole.deleteMany({ where: { staffId: staff.staffId } });
  await prisma.staffRole.create({ data: { staffId: staff.staffId, roleId: roleIds[s.role] } });
}

for (const c of CITIZENS) {
  const exists = await prisma.citizen.findUnique({ where: { nationalIdNumber: c.nationalId } });
  if (!exists) {
    await prisma.citizen.create({
      data: {
        nationalIdNumber: c.nationalId, firstName: c.firstName, lastName: c.lastName,
        dateOfBirth: new Date(`${c.dateOfBirth}T00:00:00Z`), gender: c.gender,
        citizenshipStatus: c.citizenship, address: c.address, phone: c.phone,
        contactEmail: c.email, profile: { create: { preferredLanguage: 'en', accountStatus: 'ACTIVE' } }
      }
    });
  }
}

console.log('Seed complete.');
await prisma.$disconnect();
process.exit(0);