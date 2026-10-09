import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { config } from './config.js';

let notificationQueue = null;
let redisConnection = null;
let workerInstance = null;

// Helper to construct Redis connection options
function getRedisOptions() {
  const options = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };

  if (config.redisUrl && config.redisUrl.startsWith('rediss://')) {
    options.tls = { rejectUnauthorized: false };
  }

  return options;
}

// Initialize Queue if Redis is configured
if (config.redisUrl) {
  redisConnection = new Redis(config.redisUrl, getRedisOptions());

  notificationQueue = new Queue('notifications', {
    connection: redisConnection,
  });
}

/**
 * Starts the BullMQ worker for background job processing.
 * Imported and called directly inside server.js on startup.
 */
export function startWorker() {
  if (!config.redisUrl) {
    console.log('[Queue] REDIS_URL not set — worker skipped (using in-memory fallback).');
    return;
  }

  if (workerInstance) {
    console.log('[Queue Worker] Worker is already running.');
    return workerInstance;
  }

  const workerConnection = new Redis(config.redisUrl, getRedisOptions());

  workerInstance = new Worker(
    'notifications',
    async (job) => {
      console.log(`[BullMQ Worker] Processing notification job ${job.id}:`, job.data);
      // Process notification (e.g., OTP delivery, emails, SMS)
      await new Promise((resolve) => setTimeout(resolve, 500));
      console.log(`[BullMQ Worker] Job ${job.id} completed.`);
    },
    { connection: workerConnection }
  );

  workerInstance.on('completed', (job) => {
    console.log(`[BullMQ Worker] Job ${job.id} has completed successfully.`);
  });

  workerInstance.on('failed', (job, err) => {
    console.error(`[BullMQ Worker] Job ${job?.id} failed with error:`, err.message);
  });

  console.log('[BullMQ Worker] Notification worker successfully initialized and listening.');
  return workerInstance;
}

//Enqueues a notification delivery task.
 // Falls back to setImmediate when Redis/BullMQ is not active.
export async function enqueueDelivery(data) {
  if (notificationQueue) {
    await notificationQueue.add('send-notification', {
      payload: data,
      createdAt: new Date().toISOString(),
    });
    console.log('[Queue] Enqueued notification to BullMQ.');
  } else {
    // In-memory fallback
    setImmediate(() => {
      console.log('[Queue Fallback] Processing notification in-memory:', data);
    });
  }
}