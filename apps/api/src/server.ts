import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { closePool, getPool } from './db/pool.js';
import { runSeed } from './db/seed.js';

async function bootstrap() {
  const env = getEnv();
  const pool = getPool();

  await runMigrations(pool);
  if (env.SEED_ON_BOOT) {
    await runSeed(pool);
  }

  const app = createApp();
  const server = app.listen(env.API_PORT, env.API_HOST, () => {
    console.log(`MizigoX API listening on http://${env.API_HOST}:${env.API_PORT}`);
  });

  const shutdown = async () => {
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
  console.error('Failed to start MizigoX API', error);
  process.exit(1);
});
