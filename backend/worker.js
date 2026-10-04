// Run the notification worker on its own: `npm run worker` (set RUN_WORKER=false on the API process)
import { startWorker } from './services/queue.js';

if (!startWorker()) {
  console.error('REDIS_URL is not set, so there is no queue to process.');
  process.exit(1);
}
console.log('Notification worker started');
