// import { createApp } from './app.js';
// import { config } from './config.js';
// import { storage } from './services/storage.js';
// import { startWorker } from './services/queue.js';

await storage.init();
if (config.runWorker && startWorker()) console.log('Notification worker running in this process');

createApp().listen(config.port, () => {
  console.log(`Backend listening on http://localhost:${config.port}  (API docs at /docs)`);
});
