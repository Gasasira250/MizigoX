import { Pool } from 'pg';
import { getEnv } from '../config/env.js';

let pool: Pool | undefined;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getEnv().DATABASE_URL,
      max: 10,
    });
  }

  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
