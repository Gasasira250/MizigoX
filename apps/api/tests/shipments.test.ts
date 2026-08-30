import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getEnv } from '../src/config/env.js';
import { runMigrations } from '../src/db/migrate.js';
import { closePool, getPool } from '../src/db/pool.js';
import { runSeed } from '../src/db/seed.js';
import { createCustomerUser, createOperatorOrganization, createOrgUser } from './helpers.js';

const app = createApp();

async function login(email: string, password: string) {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data.accessToken as string;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function defaultOperatorId() {
  const result = await getPool().query<{ id: string }>(
    `
      SELECT id FROM organizations
      WHERE type = 'OPERATOR' AND deleted_at IS NULL
      ORDER BY created_at
      LIMIT 1
    `,
  );
  return result.rows[0]!.id;
}

describe('shipment management', () => {
  beforeAll(async () => {
    const pool = getPool();
    await runMigrations(pool);
    await runSeed(pool);
  });

  afterAll(async () => {
    await closePool();
  });

  it('creates a shipment with a unique reference, packages, and pickup/delivery details', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();
    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth(admin))
      .send({ name: `Shipper ${stamp}`, countryCode: 'RW', city: 'Kigali' });
    expect(customer.status).toBe(201);

    const created = await request(app)
      .post('/api/v1/shipments')
      .set(auth(admin))
      .send({
        customerOrganizationId: customer.body.data.id,
        shipmentType: 'EXPRESS',
        priority: 'HIGH',
        description: 'Tea export',
        cargoDescription: 'Boxed tea',
        cargoType: 'General',
        declaredValue: 250000,
        declaredCurrencyCode: 'RWF',
        estimatedPickupAt: '2026-09-01T07:00:00.000Z',
        estimatedDeliveryAt: '2026-09-02T16:00:00.000Z',
        pickup: {
          contactName: 'Aline Uwase',
          phoneE164: '+250788111001',
          instructions: 'Call on arrival',
          countryCode: 'RW',
          adminArea1: 'Kigali',
          adminArea2: 'Gasabo',
          subLocality: 'Kimironko',
          streetLine1: 'Nyabugogo depot',
          latitude: -1.9441,
          longitude: 30.0619,
        },
        delivery: {
          contactName: 'Eric Niyonzima',
          phoneE164: '+250788111002',
          countryCode: 'RW',
          adminArea2: 'Musanze',
          locality: 'Musanze',
          streetLine1: 'Main market',
        },
        items: [
          {
            description: 'Tea carton',
            quantity: 10,
            weightKg: 20,
            lengthCm: 40,
            widthCm: 30,
            heightCm: 25,
            packageType: 'CARTON',
            isFragile: false,
          },
          {
            description: 'Sample bag',
            quantity: 2,
            weightKg: 5,
            packageType: 'BAG',
            isFragile: true,
            specialHandling: 'Keep dry',
          },
        ],
      });

    expect(created.status).toBe(201);
    expect(created.body.data.reference).toMatch(/^MX-RW-\d{4}-\d{5}$/);
    expect(created.body.data.status).toBe('CONFIRMED');
    expect(created.body.data.priority).toBe('HIGH');
    expect(created.body.data.shipmentType).toBe('EXPRESS');
    expect(created.body.data.pickup.contactName).toBe('Aline Uwase');
    expect(created.body.data.delivery.address.adminArea2).toBe('Musanze');
    expect(created.body.data.items).toHaveLength(2);
    expect(created.body.data.piecesCount).toBe(12);
    expect(created.body.data.weightKg).toBe(210);
    expect(created.body.data.events[0].type).toBe('CREATED');

    const second = await request(app)
      .post('/api/v1/shipments')
      .set(auth(admin))
      .send({
        customerOrganizationId: customer.body.data.id,
        cargoDescription: 'Second booking',
        origin: { countryCode: 'RW', streetLine1: 'A' },
        destination: { countryCode: 'RW', streetLine1: 'B' },
      });
    expect(second.status).toBe(201);
    expect(second.body.data.reference).not.toBe(created.body.data.reference);
  });

  it('generates unique references under concurrent creates and supports drafts', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth(admin))
      .send({ name: `Concurrent ${Date.now()}`, countryCode: 'RW' });
    expect(customer.status).toBe(201);

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        request(app)
          .post('/api/v1/shipments')
          .set(auth(admin))
          .send({
            customerOrganizationId: customer.body.data.id,
            cargoDescription: `Concurrent cargo ${index}`,
            origin: { countryCode: 'RW', streetLine1: `Origin ${index}` },
            destination: { countryCode: 'RW', streetLine1: `Destination ${index}` },
          }),
      ),
    );
    expect(results.every((result) => result.status === 201)).toBe(true);
    const references = results.map((result) => result.body.data.reference as string);
    expect(new Set(references).size).toBe(5);

    const draft = await request(app)
      .post('/api/v1/shipments')
      .set(auth(admin))
      .send({
        customerOrganizationId: customer.body.data.id,
        status: 'DRAFT',
        cargoDescription: 'Draft cargo',
        origin: { countryCode: 'RW', streetLine1: 'Draft origin' },
        destination: { countryCode: 'RW', streetLine1: 'Draft destination' },
      });
    expect(draft.status).toBe(201);
    expect(draft.body.data.status).toBe('DRAFT');
  });

  it('updates a shipment, manages packages, and records history', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();
    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth(admin))
      .send({ name: `Update Shipper ${stamp}`, countryCode: 'RW' });
    const created = await request(app)
      .post('/api/v1/shipments')
      .set(auth(admin))
      .send({
        customerOrganizationId: customer.body.data.id,
        cargoDescription: 'General cargo',
        origin: { countryCode: 'RW', streetLine1: 'Warehouse A', adminArea2: 'Gasabo' },
        destination: { countryCode: 'RW', streetLine1: 'Warehouse B', adminArea2: 'Huye' },
        items: [{ description: 'Box', quantity: 1, weightKg: 8 }],
      });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    const updated = await request(app)
      .patch(`/api/v1/shipments/${id}`)
      .set(auth(admin))
      .send({
        priority: 'URGENT',
        specialInstructions: 'Handle upright',
        pickup: {
          contactName: 'Depot clerk',
          phoneE164: '+250788222001',
          countryCode: 'RW',
          streetLine1: 'Updated depot',
          adminArea2: 'Nyarugenge',
        },
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.priority).toBe('URGENT');
    expect(updated.body.data.pickup.contactName).toBe('Depot clerk');

    const withPackage = await request(app)
      .post(`/api/v1/shipments/${id}/items`)
      .set(auth(admin))
      .send({ description: 'Crate', quantity: 3, weightKg: 12, packageType: 'CRATE' });
    expect(withPackage.status).toBe(201);
    expect(withPackage.body.data.items).toHaveLength(2);
    const crateId = withPackage.body.data.items.find(
      (item: { description: string }) => item.description === 'Crate',
    ).id;

    const edited = await request(app)
      .patch(`/api/v1/shipments/${id}/items/${crateId}`)
      .set(auth(admin))
      .send({ quantity: 4, isFragile: true });
    expect(edited.status).toBe(200);
    expect(
      edited.body.data.items.find((item: { id: string }) => item.id === crateId).quantity,
    ).toBe(4);

    const removed = await request(app)
      .delete(`/api/v1/shipments/${id}/items/${crateId}`)
      .set(auth(admin));
    expect(removed.status).toBe(200);
    expect(removed.body.data.items).toHaveLength(1);

    const history = await request(app).get(`/api/v1/shipments/${id}/events`).set(auth(admin));
    expect(history.status).toBe(200);
    expect(history.body.data.map((event: { type: string }) => event.type)).toEqual(
      expect.arrayContaining(['CREATED', 'PACKAGE_ADDED', 'PACKAGE_UPDATED', 'PACKAGE_REMOVED']),
    );
  });

  it('enforces the status lifecycle and cancellation', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth(admin))
      .send({ name: `Lifecycle ${Date.now()}`, countryCode: 'RW' });
    const created = await request(app)
      .post('/api/v1/shipments')
      .set(auth(admin))
      .send({
        customerOrganizationId: customer.body.data.id,
        cargoDescription: 'Lifecycle cargo',
        origin: { countryCode: 'RW', streetLine1: 'A' },
        destination: { countryCode: 'RW', streetLine1: 'B' },
      });
    const id = created.body.data.id as string;

    const invalid = await request(app)
      .post(`/api/v1/shipments/${id}/status`)
      .set(auth(admin))
      .send({ status: 'DELIVERED' });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('SHIPMENT_INVALID_TRANSITION');

    const ready = await request(app)
      .post(`/api/v1/shipments/${id}/status`)
      .set(auth(admin))
      .send({ status: 'READY_FOR_PICKUP', note: 'Truck staged' });
    expect(ready.status).toBe(200);
    expect(ready.body.data.events.at(-1).previousStatus).toBe('CONFIRMED');

    const picked = await request(app)
      .post(`/api/v1/shipments/${id}/status`)
      .set(auth(admin))
      .send({ status: 'PICKED_UP' });
    expect(picked.status).toBe(200);
    expect(picked.body.data.actualPickupAt).toBeTruthy();

    const packageLocked = await request(app)
      .post(`/api/v1/shipments/${id}/items`)
      .set(auth(admin))
      .send({ description: 'Too late', quantity: 1 });
    expect(packageLocked.status).toBe(422);

    const cancelled = await request(app).post(`/api/v1/shipments/${id}/cancel`).set(auth(admin));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');

    const archived = await request(app).delete(`/api/v1/shipments/${id}`).set(auth(admin));
    expect(archived.status).toBe(200);
    const missing = await request(app).get(`/api/v1/shipments/${id}`).set(auth(admin));
    expect(missing.status).toBe(404);
  });

  it('validates inputs and paginates, filters, and sorts the list', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();
    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth(admin))
      .send({ name: `Filter Shipper ${stamp}`, countryCode: 'RW' });

    const invalid = await request(app)
      .post('/api/v1/shipments')
      .set(auth(admin))
      .send({
        customerOrganizationId: customer.body.data.id,
        cargoDescription: 'Bad package',
        origin: { countryCode: 'RW', streetLine1: 'A' },
        destination: { countryCode: 'RW', streetLine1: 'B' },
        items: [{ description: 'Neg', quantity: 1, weightKg: -2 }],
      });
    expect(invalid.status).toBe(422);

    for (const priority of ['LOW', 'URGENT'] as const) {
      const created = await request(app)
        .post('/api/v1/shipments')
        .set(auth(admin))
        .send({
          customerOrganizationId: customer.body.data.id,
          cargoDescription: `Filter cargo ${priority} ${stamp}`,
          priority,
          origin: { countryCode: 'RW', streetLine1: 'Origin' },
          destination: { countryCode: 'RW', streetLine1: 'Destination' },
        });
      expect(created.status).toBe(201);
    }

    const page = await request(app)
      .get(
        `/api/v1/shipments?q=Filter%20cargo&customerId=${customer.body.data.id}&page=1&pageSize=1&sort=priority&order=desc`,
      )
      .set(auth(admin));
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta.total).toBeGreaterThanOrEqual(2);
    expect(page.body.data[0].priority).toBe('URGENT');

    const filtered = await request(app)
      .get(`/api/v1/shipments?q=${stamp}&priority=LOW&status=CONFIRMED`)
      .set(auth(admin));
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.length).toBeGreaterThanOrEqual(1);
    expect(filtered.body.data.every((row: { priority: string }) => row.priority === 'LOW')).toBe(
      true,
    );
  });

  it('enforces permissions and organization isolation', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();
    const password = 'ShipPass!234';
    const operatorId = await defaultOperatorId();

    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth(admin))
      .send({ name: `Iso Customer ${stamp}`, countryCode: 'RW' });
    const shipment = await request(app)
      .post('/api/v1/shipments')
      .set(auth(admin))
      .send({
        customerOrganizationId: customer.body.data.id,
        cargoDescription: 'Private load',
        origin: { countryCode: 'RW', streetLine1: 'A' },
        destination: { countryCode: 'RW', streetLine1: 'B' },
      });
    expect(shipment.status).toBe(201);

    const unauthenticated = await request(app).get('/api/v1/shipments');
    expect(unauthenticated.status).toBe(401);

    await createOrgUser({
      email: `finance.ship.${stamp}@example.com`,
      password,
      role: 'FINANCE_OFFICER',
      organizationId: operatorId,
    });
    const financeToken = await login(`finance.ship.${stamp}@example.com`, password);
    const financeList = await request(app).get('/api/v1/shipments').set(auth(financeToken));
    expect(financeList.status).toBe(200);
    const financeCreate = await request(app)
      .post('/api/v1/shipments')
      .set(auth(financeToken))
      .send({
        customerOrganizationId: customer.body.data.id,
        cargoDescription: 'Nope',
        origin: { countryCode: 'RW', streetLine1: 'A' },
        destination: { countryCode: 'RW', streetLine1: 'B' },
      });
    expect(financeCreate.status).toBe(403);

    const otherOperator = await createOperatorOrganization(`North Operator ${stamp}`);
    await createOrgUser({
      email: `north.admin.${stamp}@example.com`,
      password,
      role: 'COMPANY_ADMIN',
      organizationId: otherOperator.id,
    });
    const otherToken = await login(`north.admin.${stamp}@example.com`, password);
    const leaked = await request(app)
      .get(`/api/v1/shipments/${shipment.body.data.id}`)
      .set(auth(otherToken));
    expect(leaked.status).toBe(403);

    const attach = await request(app)
      .post('/api/v1/shipments')
      .set(auth(otherToken))
      .send({
        customerOrganizationId: customer.body.data.id,
        cargoDescription: 'Cross tenant',
        origin: { countryCode: 'RW', streetLine1: 'A' },
        destination: { countryCode: 'RW', streetLine1: 'B' },
      });
    expect(attach.status).toBe(403);

    const portal = await createCustomerUser({
      email: `portal.ship.${stamp}@example.com`,
      password,
    });
    const portalToken = await login(`portal.ship.${stamp}@example.com`, password);
    const portalLeak = await request(app)
      .get(`/api/v1/shipments/${shipment.body.data.id}`)
      .set(auth(portalToken));
    expect(portalLeak.status).toBe(403);
    void portal;
  });

  it('writes audit records for shipment lifecycle actions', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth(admin))
      .send({ name: `Audit Shipper ${Date.now()}`, countryCode: 'RW' });
    const created = await request(app)
      .post('/api/v1/shipments')
      .set(auth(admin))
      .send({
        customerOrganizationId: customer.body.data.id,
        cargoDescription: 'Audit cargo',
        origin: { countryCode: 'RW', streetLine1: 'A' },
        destination: { countryCode: 'RW', streetLine1: 'B' },
      });
    const id = created.body.data.id as string;
    await request(app).patch(`/api/v1/shipments/${id}`).set(auth(admin)).send({ priority: 'HIGH' });
    await request(app)
      .post(`/api/v1/shipments/${id}/items`)
      .set(auth(admin))
      .send({ description: 'Audit box', quantity: 1 });
    await request(app).post(`/api/v1/shipments/${id}/cancel`).set(auth(admin));

    const actions = await getPool().query<{ action: string }>(
      `
        SELECT action FROM audit_logs
        WHERE entity_id = $1::text OR after->>'shipmentId' = $1
        ORDER BY created_at
      `,
      [id],
    );
    expect(actions.rows.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'SHIPMENT_CREATED',
        'SHIPMENT_UPDATED',
        'SHIPMENT_PACKAGE_ADDED',
        'SHIPMENT_CANCELLED',
      ]),
    );
  });
});
