import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getEnv, parseAppEnv } from '../src/config/env.js';
import { runMigrations } from '../src/db/migrate.js';
import { closePool, getPool } from '../src/db/pool.js';
import { runSeed } from '../src/db/seed.js';
import { verifyProviderWebhook } from '../src/modules/billing/payment-providers.js';
import {
  completePasswordReset,
  requestPasswordReset,
} from '../src/modules/auth/password-reset.service.js';
import { createCustomerUser } from './helpers.js';

const app = createApp();

async function login(email: string, password: string) {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data.accessToken as string;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('production hardening and security', () => {
  beforeAll(async () => {
    const pool = getPool();
    await runMigrations(pool);
    await runSeed(pool);
  });

  afterAll(async () => {
    await closePool();
  });

  it('rejects production configuration that would seed or use insecure cookies', () => {
    expect(() =>
      parseAppEnv({
        ...process.env,
        NODE_ENV: 'production',
        APP_ENV: 'production',
        SEED_ON_BOOT: 'true',
        COOKIE_SECURE: 'true',
      }),
    ).toThrow(/SEED_ON_BOOT/);

    expect(() =>
      parseAppEnv({
        ...process.env,
        NODE_ENV: 'production',
        APP_ENV: 'production',
        SEED_ON_BOOT: 'false',
        COOKIE_SECURE: 'false',
      }),
    ).toThrow(/COOKIE_SECURE/);

    expect(() =>
      parseAppEnv({
        ...process.env,
        NODE_ENV: 'production',
        APP_ENV: 'production',
        SEED_ON_BOOT: 'false',
        COOKIE_SECURE: 'true',
        COOKIE_SAMESITE: 'none',
      }),
    ).not.toThrow();
  });

  it('sets security headers and does not reflect unknown CORS origins', async () => {
    const health = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(health.status).toBe(200);
    expect(health.headers['x-content-type-options']).toBe('nosniff');
    expect(health.headers['access-control-allow-origin']).toBeUndefined();

    const allowed = await request(app).get('/api/v1/health').set('Origin', getEnv().WEB_ORIGIN);
    expect(allowed.headers['access-control-allow-origin']).toBe(getEnv().WEB_ORIGIN);
  });

  it('does not leak database errors from readiness', async () => {
    const response = await request(app).get('/api/v1/health/ready');
    expect(response.status).toBe(200);
    expect(response.body.data.checks.database.status).toBe('ok');
    expect(response.body.data.checks.database.message).toBeUndefined();
  });

  it('rejects non-JSON mutating requests', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'text/plain')
      .send('email=attacker@example.com&password=nope');
    expect(response.status).toBe(422);
  });

  it('requires authentication on sensitive collections', async () => {
    const paths = [
      '/api/v1/customers',
      '/api/v1/shipments',
      '/api/v1/vehicles',
      '/api/v1/drivers',
      '/api/v1/routes',
      '/api/v1/invoices',
      '/api/v1/payments',
      '/api/v1/notifications',
      '/api/v1/audit',
      '/api/v1/tracking/live',
    ];
    for (const path of paths) {
      const response = await request(app).get(path);
      expect(response.status).toBe(401);
    }
  });

  it('does not reveal whether an email exists during password reset', async () => {
    const unknown = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: `missing.${Date.now()}@example.com` });
    expect(unknown.status).toBe(200);
    expect(unknown.body.data.accepted).toBe(true);
    expect(unknown.body.data.resetToken).toBeUndefined();
  });

  it('resets a password through hashed tokens and revokes sessions', async () => {
    const email = `reset.${Date.now()}@example.com`;
    const original = 'Original-Pass-2026!';
    await createCustomerUser({ email, password: original });

    const httpForgot = await request(app).post('/api/v1/auth/forgot-password').send({ email });
    expect(httpForgot.status).toBe(200);
    expect(httpForgot.body.data.accepted).toBe(true);
    expect(httpForgot.body.data.resetToken).toBeUndefined();

    const requested = await requestPasswordReset(getPool(), { email });
    expect(requested.accepted).toBe(true);
    expect(requested.resetToken).toBeTruthy();

    await completePasswordReset(getPool(), {
      token: requested.resetToken!,
      newPassword: 'Replacement-Pass-2026!',
    });

    const oldLogin = await request(app).post('/api/v1/auth/login').send({
      email,
      password: original,
    });
    expect(oldLogin.status).toBe(401);

    const nextLogin = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'Replacement-Pass-2026!',
    });
    expect(nextLogin.status).toBe(200);
  });

  it('blocks unsigned payment webhooks and cross-organization shipment access', async () => {
    expect(() => verifyProviderWebhook(undefined, '{}')).toThrow();

    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();
    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth(admin))
      .send({ name: `Hardening shipper ${stamp}`, countryCode: 'RW' });
    expect(customer.status).toBe(201);

    const shipment = await request(app)
      .post('/api/v1/shipments')
      .set(auth(admin))
      .send({
        customerOrganizationId: customer.body.data.id,
        cargoDescription: 'Isolation cargo',
        origin: { countryCode: 'RW', streetLine1: 'Nyabugogo depot', adminArea2: 'Gasabo' },
        destination: { countryCode: 'RW', streetLine1: 'Huye market', adminArea2: 'Huye' },
        items: [{ description: 'Box', quantity: 1, weightKg: 10 }],
      });
    expect(shipment.status).toBe(201);

    const outsider = await createCustomerUser({
      email: `outsider.${stamp}@example.com`,
      password: 'Outsider-Pass-2026!',
    });
    const outsiderToken = await login(`outsider.${stamp}@example.com`, 'Outsider-Pass-2026!');

    const stolenShipment = await request(app)
      .get(`/api/v1/shipments/${shipment.body.data.id}`)
      .set(auth(outsiderToken));
    expect([403, 404]).toContain(stolenShipment.status);

    const stolenCustomer = await request(app)
      .get(`/api/v1/customers/${customer.body.data.id}`)
      .set(auth(outsiderToken));
    expect([403, 404]).toContain(stolenCustomer.status);

    const invoices = await request(app).get('/api/v1/invoices').set(auth(outsiderToken));
    expect(invoices.status).toBe(200);
    expect(
      (invoices.body.data as Array<{ customerOrganizationId?: string }>).every(
        (row) => row.customerOrganizationId === outsider.organizationId,
      ),
    ).toBe(true);
  });
});
