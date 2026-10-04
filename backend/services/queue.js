import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config.js';
import { deliverNotification } from './deliveryService.js';

const QUEUE_NAME = 'notifications';

// BullMQ needs its own connection with maxRetriesPerRequest disabled
const connect = () => new Redis(config.redisUrl, { maxRetriesPerRequest: null });

const queue = config.redisUrl
  ? new Queue(QUEUE_NAME, {
      connection: connect(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    })
  : null;

// With Redis: queue the job for the worker. Without Redis: deliver in the background of this process.
export async function enqueueDelivery(notificationId) {
  if (queue) {
    await queue.add('deliver', { notificationId });
  } else {
    setImmediate(() => deliverNotification(notificationId).catch((err) => console.error('delivery failed', err.message)));
  }
}

export function startWorker() {
  if (!config.redisUrl) return null;
  const worker = new Worker(QUEUE_NAME, (job) => deliverNotification(job.data.notificationId), {
    connection: connect(),
    concurrency: 5,
  });
  worker.on('failed', (job, err) => console.error(`notification job ${job?.id} failed: ${err.message}`));
  return worker;
}
