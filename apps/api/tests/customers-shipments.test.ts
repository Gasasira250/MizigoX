import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getEnv } from '../src/config/env.js';
import { runMigrations } from '../src/db/migrate.js';
import { closePool, getPool } from '../src/db/pool.js';
import { runSeed } from '../src/db/seed.js';
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

describe('customers and shipments', () => {
  beforeAll(async () => {
    const pool = getPool();
    await runMigrations(pool);
    await runSeed(pool);
  });

  afterAll(async () => {
    await closePool();
  });

  it('lets staff create a customer and book a searchable shipment', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();

    const created = await request(app)
      .post('/api/v1/customers')
      .set(auth(admin))
      .send({
        name: `Kigali Traders ${stamp}`,
        legalName: 'Kigali Traders Ltd',
        email: `traders.${stamp}@example.com`,
        countryCode: 'RW',
        primaryContact: {
          firstName: 'Jean',
          lastName: 'Habimana',
          email: `jean.${stamp}@example.com`,
        },
        primaryAddress: {
          countryCode: 'RW',
          adminArea2: 'Gasabo',
          locality: 'Kigali',
          streetLine1: 'KG 12 Ave',
        },
      });

    expect(created.status).toBe(201);
    expect(created.body.data.name).toContain('Kigali Traders');
    expect(created.body.data.contacts).toHaveLength(1);
    expect(created.body.data.addresses[0].countryCode).toBe('RW');

    const shipment = await request(app)
      .post('/api/v1/shipments')
      .set(auth(admin))
      .send({
        customerOrganizationId: created.body.data.id,
        cargoDescription: 'Coffee bags',
        weightKg: 1200,
        piecesCount: 24,
        origin: {
          countryCode: 'RW',
          adminArea2: 'Gasabo',
          locality: 'Kigali',
          streetLine1: 'Nyabugogo depot',
        },
        destination: {
          countryCode: 'RW',
          adminArea2: 'Huye',
          locality: 'Huye',
          streetLine1: 'Main market',
        },
        items: [{ description: '60kg bag', quantity: 24, weightKg: 50 }],
      });

    expect(shipment.status).toBe(201);
    expect(shipment.body.data.reference).toMatch(/^MX-RW-\d{4}-\d{5}$/);
    expect(shipment.body.data.status).toBe('BOOKED');
    expect(shipment.body.data.events[0].type).toBe('BOOKED');
    expect(shipment.body.data.items).toHaveLength(1);

    const listed = await request(app)
      .get('/api/v1/shipments?q=Coffee&status=BOOKED')
      .set(auth(admin));
    expect(listed.status).toBe(200);
    expect(
      listed.body.data.some((row: { id: string }) => row.id === shipment.body.data.id),
    ).toBe(true);

    const moved = await request(app)
      .post(`/api/v1/shipments/${shipment.body.data.id}/status`)
      .set(auth(admin))
      .send({ status: 'IN_TRANSIT', note: 'Left Kigali' });
    expect(moved.status).toBe(200);
    expect(moved.body.data.status).toBe('IN_TRANSIT');
    expect(moved.body.data.events.length).toBeGreaterThan(1);

    const invalid = await request(app)
      .post(`/api/v1/shipments/${shipment.body.data.id}/status`)
      .set(auth(admin))
      .send({ status: 'BOOKED' });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('SHIPMENT_INVALID_TRANSITION');
  });

  it('keeps customer users inside their own tenant', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const other = await request(app)
      .post('/api/v1/customers')
      .set(auth(admin))
      .send({ name: `Other Shipper ${Date.now()}`, countryCode: 'RW' });
    expect(other.status).toBe(201);

    const otherShipment = await request(app)
      .post('/api/v1/shipments')
      .set(auth(admin))
      .send({
        customerOrganizationId: other.body.data.id,
        cargoDescription: 'Private cargo',
        origin: { countryCode: 'RW', streetLine1: 'Warehouse A', adminArea2: 'Gasabo' },
        destination: { countryCode: 'RW', streetLine1: 'Warehouse B', adminArea2: 'Kicukiro' },
      });
    expect(otherShipment.status).toBe(201);

    const email = `portal.${Date.now()}@example.com`;
    const password = 'CustomerPortal!234';
    const customer = await createCustomerUser({ email, password });
    const token = await login(email, password);

    const createCustomer = await request(app)
      .post('/api/v1/customers')
      .set(auth(token))
      .send({ name: 'Should fail', countryCode: 'RW' });
    expect(createCustomer.status).toBe(403);

    const leaked = await request(app)
      .get(`/api/v1/shipments/${otherShipment.body.data.id}`)
      .set(auth(token));
    expect(leaked.status).toBe(403);

    const own = await request(app)
      .post('/api/v1/shipments')
      .set(auth(token))
      .send({
        cargoDescription: 'Retail goods',
        origin: { countryCode: 'RW', streetLine1: 'Shop 1', adminArea2: 'Nyarugenge' },
        destination: { countryCode: 'RW', streetLine1: 'Shop 2', adminArea2: 'Gasabo' },
      });
    expect(own.status).toBe(201);
    expect(own.body.data.customerOrganizationId).toBe(customer.organizationId);

    const list = await request(app).get('/api/v1/shipments').set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body.data.every((row: { customerOrganizationId: string }) => row.customerOrganizationId === customer.organizationId)).toBe(
      true,
    );
    expect(
      list.body.data.some((row: { id: string }) => row.id === otherShipment.body.data.id),
    ).toBe(false);
  });
});
