// scripts/db-demo.mjs
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

try {
  const citizens = await prisma.citizen.findMany({
    where: {
      nationalIdNumber: {
        in: ['1990010100001', '1985050500002', 'TMP-20260101-0001', '1992121200004'],
      },
    },
    include: { credentials: { where: { credentialType: 'PASSWORD', activeStatus: true } } },
    orderBy: { nationalIdNumber: 'asc' },
  });

  console.log('\nDemo citizens:');
  for (const c of citizens) {
    console.log(
      `  ${c.nationalIdNumber}  ${c.firstName} ${c.lastName}  tempId=${c.temporaryId}  passwordSet=${c.passwordSet}  creds=${c.credentials.length}`
    );
  }

  const services = await prisma.serviceType.findMany({
    select: { code: true, name: true, accessLevel: true },
    orderBy: [{ accessLevel: 'asc' }, { code: 'asc' }],
  });
  console.log('\nServices:');
  for (const s of services) {
    console.log(`  [${s.accessLevel}]  ${s.code}  —  ${s.name}`);
  }
} finally {
  await prisma.$disconnect();
}