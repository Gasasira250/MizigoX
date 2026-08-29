import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getEnv } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import { closePool, getPool } from '../src/db/pool.js';
import { runSeed } from '../src/db/seed.js';
import { createCustomerUser } from './helpers.js';

const app = createApp();

describe('auth and rbac', () => {
  beforeAll(async () => {
    const pool = getPool();
    await runMigrations(pool);
    await runSeed(pool);
  });

  afterAll(async () => {
    await closePool();
  });

  it('rejects invalid credentials', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({
      email: getEnv().SEED_ADMIN_EMAIL,
      password: 'definitely-not-the-password',
    });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('logs in the seeded Super Admin and returns session data', async () => {
    const env = getEnv();
    const response = await request(app).post('/api/v1/auth/login').send({
      email: env.SEED_ADMIN_EMAIL,
      password: env.SEED_ADMIN_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.tokenType).toBe('Bearer');
    expect(response.body.data.accessToken).toBeTruthy();
    expect(response.body.data.user.role).toBe('SUPER_ADMIN');
    expect(response.body.data.user.permissions).toContain('audit.read');
    expect(response.headers['set-cookie']?.join(';')).toContain('mx_refresh=');

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${response.body.data.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(env.SEED_ADMIN_EMAIL.toLowerCase());
    expect(me.body.data.user.organization.countryCode).toBe('RW');
    expect(me.body.data.user.organization.defaultCurrencyCode).toBe('RWF');
  });

  it('blocks unauthenticated access to the admin shell API', async () => {
    const response = await request(app).get('/api/v1/audit');
    expect(response.status).toBe(401);
  });

  it('prevents a Customer User from reading platform audit logs', async () => {
    const email = `customer.${Date.now()}@example.com`;
    const password = 'CustomerPortal!234';
    await createCustomerUser({ email, password });

    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe('CUSTOMER_USER');

    const audit = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(audit.status).toBe(403);

    const countries = await request(app)
      .get('/api/v1/countries')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(countries.status).toBe(200);
    expect(countries.body.data.some((row: { code: string; is_active: boolean }) => row.code === 'RW' && row.is_active)).toBe(
      true,
    );
  });
});
