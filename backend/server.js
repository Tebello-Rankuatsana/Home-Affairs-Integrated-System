import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { createApp } from './app.js';
import { config } from './config.js';


BigInt.prototype.toJSON = function () {
  return this.toString();
};

const { PrismaClient } = pkg;

// Initialize PostgreSQL pool and Prisma adapter
const pool = new pg.Pool({ connectionString: config.databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    //Verify Database Connection
    await prisma.$connect();
    console.log('Connected to Neon PostgreSQL successfully!');

    // Query Public Schema Tables
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;

    console.log(`Found ${tables.length} tables in public schema.`);
    console.table(tables);

    //Starting Express App
    const app = createApp();
    app.listen(config.port, () => {
      console.log(`Server running on http://localhost:${config.port}`);
    });
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
}

main();