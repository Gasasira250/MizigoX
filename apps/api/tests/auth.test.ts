import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getEnv } from '../src/config/env.js';
import { runMigrations } from '../src/db/migrate.js';
import { closePool, getPool } from '../src/db/pool.js';
import { runSeed } from '../src/db/seed.js';
import { createCustomerUser } from './helpers.js';

const app = createApp();

async function loginAsAdmin() {
  const env = getEnv();
  const response = await request(app).post('/api/v1/auth/login').send({
    email: env.SEED_ADMIN_EMAIL,
    password: env.SEED_ADMIN_PASSWORD,
  });
  expect(response.status).toBe(200);
  return response.body.data.accessToken as string;
}

async function operatorOrganizationId() {
  const result = await getPool().query<{ id: string }>(
    `
      SELECT id FROM organizations
      WHERE type = 'OPERATOR' AND deleted_at IS NULL
      ORDER BY created_at
      LIMIT 1
    `,
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error('Seeded operator organization is missing');
  }
  return id;
}

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
    const token = await loginAsAdmin();

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(env.SEED_ADMIN_EMAIL.toLowerCase());
    expect(me.body.data.user.organization.countryCode).toBe('RW');
    expect(me.body.data.user.organization.defaultCurrencyCode).toBe('RWF');
  });

  it('blocks unauthenticated access to the admin shell API', async () => {
    const response = await request(app).get('/api/v1/audit');
    expect(response.status).toBe(401);
  });

  it('rejects open registration without an invite token', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      firstName: 'No',
      lastName: 'Invite',
      password: 'ValidPassword123',
    });
    expect(response.status).toBe(422);
  });

  it('prevents a Customer User from inviting users or reading audit logs', async () => {
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

    const invite = await request(app)
      .post('/api/v1/auth/invites')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({
        email: `blocked.${Date.now()}@example.com`,
        role: 'CUSTOMER_USER',
      });
    expect(invite.status).toBe(403);
  });

  it('invites a user, registers them, and enforces RBAC', async () => {
    const adminToken = await loginAsAdmin();
    const organizationId = await operatorOrganizationId();
    const email = `ops.${Date.now()}@mizigox.local`;

    const invalidRole = await request(app)
      .post('/api/v1/auth/invites')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email,
        role: 'CUSTOMER_USER',
        organizationId,
      });
    expect(invalidRole.status).toBe(422);

    const created = await request(app)
      .post('/api/v1/auth/invites')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email,
        role: 'LOGISTICS_MANAGER',
        organizationId,
      });
    expect(created.status).toBe(201);
    expect(created.body.data.token).toBeTruthy();
    expect(created.body.data.email).toBe(email);

    const preview = await request(app).get(`/api/v1/auth/invites/${created.body.data.token}`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.email).toBe(email);
    expect(preview.body.data.role).toBe('LOGISTICS_MANAGER');

    const weakPassword = await request(app).post('/api/v1/auth/register').send({
      token: created.body.data.token,
      firstName: 'Aline',
      lastName: 'Uwase',
      password: 'short',
    });
    expect(weakPassword.status).toBe(422);

    const registered = await request(app).post('/api/v1/auth/register').send({
      token: created.body.data.token,
      firstName: 'Aline',
      lastName: 'Uwase',
      password: 'LogisticsMgr!234',
    });
    expect(registered.status).toBe(200);
    expect(registered.body.data.user.role).toBe('LOGISTICS_MANAGER');
    expect(registered.body.data.user.organization.id).toBe(organizationId);
    expect(registered.body.data.accessToken).toBeTruthy();

    const reused = await request(app).post('/api/v1/auth/register').send({
      token: created.body.data.token,
      firstName: 'Aline',
      lastName: 'Uwase',
      password: 'LogisticsMgr!234',
    });
    expect(reused.status).toBe(404);

    const audit = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${registered.body.data.accessToken}`);
    expect(audit.status).toBe(403);

    const changed = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${registered.body.data.accessToken}`)
      .send({
        currentPassword: 'LogisticsMgr!234',
        newPassword: 'LogisticsMgr!567',
      });
    expect(changed.status).toBe(200);

    const oldPassword = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'LogisticsMgr!234',
    });
    expect(oldPassword.status).toBe(401);

    const newPassword = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'LogisticsMgr!567',
    });
    expect(newPassword.status).toBe(200);
    expect(newPassword.body.data.user.firstName).toBe('Aline');
  });
});
