import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import { closePool, getPool } from '../src/db/pool.js';
import { runSeed } from '../src/db/seed.js';

const app = createApp();

describe('health', () => {
  beforeAll(async () => {
    const pool = getPool();
    await runMigrations(pool);
    await runSeed(pool);
  });

  afterAll(async () => {
    await closePool();
  });

  it('returns liveness', async () => {
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.service).toBe('mizigox-api');
    expect(response.body.meta.requestId).toBeTruthy();
  });

  it('returns database readiness', async () => {
    const response = await request(app).get('/api/v1/health/ready');
    expect(response.status).toBe(200);
    expect(response.body.data.checks.database.status).toBe('ok');
  });
});
