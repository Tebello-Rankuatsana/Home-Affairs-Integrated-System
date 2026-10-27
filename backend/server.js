import { prisma } from './db.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { startWorker } from './services/queue.js';

BigInt.prototype.toJSON = function () {
  return this.toString();
};

async function main() {
  try {
    await prisma.$connect();
    console.log('Connected to Neon PostgreSQL successfully!');

    // Initialize BullMQ 
    const worker = startWorker();
    if (worker) {
      console.log('BullMQ Background Worker started.');
    }

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