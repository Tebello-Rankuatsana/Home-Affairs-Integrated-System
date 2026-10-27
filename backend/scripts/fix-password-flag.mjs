// scripts/fix-password-flag.mjs
import 'dotenv/config';
import { prisma } from '../db.js';

const ids = ['1990010100001', '1985050500002'];

try {
  for (const nationalId of ids) {
    const citizen = await prisma.citizen.findUnique({
      where: { nationalIdNumber: nationalId },
      include: { credentials: { where: { credentialType: 'PASSWORD', activeStatus: true } } },
    });
    if (!citizen) { console.log(`✗ ${nationalId}  not found`); continue; }
    if (!citizen.credentials.length) {
      console.log(`✗ ${nationalId}  no PASSWORD credential`);
      continue;
    }
    if (citizen.passwordSet) {
      console.log(`= ${nationalId}  already true`);
      continue;
    }
    await prisma.citizen.update({
      where: { citizenId: citizen.citizenId },
      data: { passwordSet: true },
    });
    console.log(`✔ ${nationalId}  passwordSet flipped to true`);
  }
} finally {
  await prisma.$disconnect();
}