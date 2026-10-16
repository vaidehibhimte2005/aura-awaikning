import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { sendDueReminders } from './controllers/liveSessionController.js';
import { runTrainingJobs } from './services/training/reminderService.js';
import { getConfig } from './services/training/configService.js';
import { seedDefaultPackages } from './seed/defaultPackages.js';

async function start() {
  await connectDB();
  await getConfig(); // creates the default admin settings on first boot
  await seedDefaultPackages(); // creates Daily / Weekly / Monthly plans only if none exist
  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`✓ Aura Awakening API listening on http://localhost:${env.port} (${env.nodeEnv})`);
    console.log(`  Payment provider: ${env.payments.provider}`);
  });

  // Lightweight scheduler for live-session reminders (move to a worker/cron in larger deployments).
  const timer = setInterval(() => sendDueReminders().catch((e) => console.error('reminders', e.message)), 5 * 60 * 1000);

  // Session evaluation, reminders and expiry — every step is idempotent, so overlapping runs are harmless.
  const trainingTimer = setInterval(() => runTrainingJobs().catch((e) => console.error('training jobs', e.message)), 60 * 1000);
  runTrainingJobs().catch((e) => console.error('training jobs', e.message));

  const shutdown = (signal) => {
    console.log(`${signal} received — shutting down`);
    clearInterval(timer);
    clearInterval(trainingTimer);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('✖ Failed to start server:', err.message);
  process.exit(1);
});
