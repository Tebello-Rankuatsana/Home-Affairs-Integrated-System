import pkg from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { config } from './config.js';

const { PrismaClient } = pkg;

// Configure the pool to handle serverless DB latency
const pool = new pg.Pool({ 
  connectionString: config.databaseUrl,
  max: 10, // Prevent exhausting Neon's connection limits
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000 
});

const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });