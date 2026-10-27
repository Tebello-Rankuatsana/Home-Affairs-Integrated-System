// scripts/db-verify.mjs
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function cols(table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' ORDER BY column_name`
  );
  return rows.map((r) => r.column_name);
}

try {
  console.log('citizen:', (await cols('citizen')).join(', '));
  console.log('');
  console.log('service:', (await cols('service')).join(', '));
  console.log('');
  console.log('authentication_credentials:', (await cols('authentication_credentials')).join(', '));
} finally {
  await prisma.$disconnect();
}