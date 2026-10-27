// scripts/check-login-state.mjs
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';

const ids = ['1990010100001', '1985050500002', 'TMP-20260101-0001', '1992121200004'];

try {
  const rows = await prisma.citizen.findMany({
    where: { nationalIdNumber: { in: ids } },
    include: {
      credentials: {
        where: { credentialType: 'PASSWORD', activeStatus: true },
      },
    },
  });

  console.log('\nCitizen state:');
  for (const c of rows) {
    console.log(
      `  ${c.nationalIdNumber}  passwordSet=${c.passwordSet}  tempId=${c.temporaryId}  status=${c.registrationStatus}  creds=${c.credentials.length}`
    );
  }

  console.log('\nPassword check against "ChangeMe-12345":');
  for (const c of rows) {
    if (!c.credentials.length) {
      console.log(`  ${c.nationalIdNumber}  → no PASSWORD credential`);
      continue;
    }
    const ok = await bcrypt.compare('ChangeMe-12345', c.credentials[0].credentialHash);
    console.log(
      `  ${c.nationalIdNumber}  → ${ok ? '✔ matches' : '✗ does NOT match'}  (hash prefix: ${c.credentials[0].credentialHash.slice(0, 7)})`
    );
  }
} finally {
  await prisma.$disconnect();
}