import { closePool, getPool } from './pool.js';
import { runSeed } from './seed.js';

const pool = getPool();
await runSeed(pool);
await closePool();
console.log('Seed completed');
