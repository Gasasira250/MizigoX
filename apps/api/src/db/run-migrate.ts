import { runMigrations } from './migrate.js';
import { closePool, getPool } from './pool.js';

const pool = getPool();
await runMigrations(pool);
await closePool();
console.log('Migrations applied');
