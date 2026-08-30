import { createApp } from './app.js';
import { getEnv, isProductionLike } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { closePool, getPool } from './db/pool.js';
import { runSeed } from './db/seed.js';
import { logger } from './lib/logger.js';
import { startNotificationWorker } from './modules/notifications/notification.worker.js';

async function bootstrap() {
  const env = getEnv();
  const pool = getPool();

  if (env.MIGRATE_ON_BOOT) {
    await runMigrations(pool);
  }
  if (env.SEED_ON_BOOT) {
    await runSeed(pool);
  }

  const app = createApp();
  const stopNotificationWorker = startNotificationWorker(pool);
  const server = app.listen(env.API_PORT, env.API_HOST, () => {
    logger.info('MizigoX API listening', {
      host: env.API_HOST,
      port: env.API_PORT,
      appEnv: env.APP_ENV,
      production: isProductionLike(env),
    });
  });

  const shutdown = async () => {
    logger.info('Shutting down MizigoX API');
    stopNotificationWorker();
    server.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

bootstrap().catch((error) => {
  logger.error('Failed to start MizigoX API', {
    message: error instanceof Error ? error.message : 'unknown',
  });
  process.exit(1);
});
