import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { startWorker } from './services/queue.js';

BigInt.prototype.toJSON = function () {
  return this.toString();
};

async function main() {
  try {
    await prisma.$connect();
    console.log('Connected to the database.');

    const worker = startWorker();
    if (worker) console.log('Notification worker started.');

    const app = createApp();
    const server = app.listen(config.port, () => {
      console.log(`Server running on http://localhost:${config.port}`);
    });

    const shutdown = async (signal) => {
      console.log(`Received ${signal}, shutting down.`);
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    console.error('Startup failed:', error);
    process.exit(1);
  }
}

main();