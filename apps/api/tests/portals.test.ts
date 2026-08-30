import { can, canAny } from '@mizigox/shared';
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
    `SELECT id FROM organizations WHERE type = 'OPERATOR' AND deleted_at IS NULL ORDER BY created_at LIMIT 1`,
  );
  return result.rows[0]!.id;
}

async function createCustomer(token: string, name: string) {
  const response = await request(app)
    .post('/api/v1/customers')
    .set(auth(token))
    .send({ name, countryCode: 'RW' });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; name: string };
}

async function createShipment(token: string, customerId: string, cargo: string) {
  const response = await request(app)
    .post('/api/v1/shipments')
    .set(auth(token))
    .send({
      customerOrganizationId: customerId,
      cargoDescription: cargo,
      origin: { countryCode: 'RW', streetLine1: 'Nyabugogo depot', adminArea2: 'Gasabo' },
      destination: { countryCode: 'RW', streetLine1: 'Huye market', adminArea2: 'Huye' },
      items: [{ description: 'Box', quantity: 1, weightKg: 40 }],
    });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; reference: string; status: string };
}

async function createVehicle(token: string, organizationId: string, plate: string) {
  const response = await request(app).post('/api/v1/vehicles').set(auth(token)).send({
    organizationId,
    vehicleType: 'LIGHT_TRUCK',
    registrationNumber: plate,
    payloadCapacity: 3500,
    payloadUnit: 'KG',
    status: 'AVAILABLE',
  });
  expect(response.status).toBe(201);
  return response.body.data as { id: string };
}

async function createDriver(
  token: string,
  organizationId: string,
  input: { phone: string; userId?: string },
) {
  const response = await request(app).post('/api/v1/drivers').set(auth(token)).send({
    organizationId,
    firstName: 'Jean',
    lastName: 'Habimana',
    phoneE164: input.phone,
    userId: input.userId,
    status: 'AVAILABLE',
  });
  expect(response.status).toBe(201);
  return response.body.data as { id: string };
}

async function dispatchRoute(
  token: string,
  organizationId: string,
  extras: { shipmentId: string; vehicleId: string; driverId: string },
) {
  const created = await request(app)
    .post('/api/v1/routes')
    .set(auth(token))
    .send({
      organizationId,
      shipmentIds: [extras.shipmentId],
      vehicleId: extras.vehicleId,
      driverId: extras.driverId,
      plannedDepartureAt: '2026-09-01T07:00:00.000Z',
      plannedArrivalAt: '2026-09-01T16:00:00.000Z',
      status: 'PLANNED',
    });
  expect(created.status).toBe(201);
  const routeId = created.body.data.id as string;
  const ready = await request(app)
    .post(`/api/v1/routes/${routeId}/status`)
    .set(auth(token))
    .send({ status: 'READY' });
  expect(ready.status).toBe(200);
  const dispatched = await request(app)
    .post(`/api/v1/dispatch/routes/${routeId}`)
    .set(auth(token))
    .send({});
  expect(dispatched.status).toBe(200);
  return dispatched.body.data as {
    id: string;
    stops: Array<{ id: string; status: string; stopType: string; shipmentId: string | null }>;
  };
}

async function advanceShipment(token: string, shipmentId: string, statuses: string[]) {
  for (const status of statuses) {
    const response = await request(app)
      .post(`/api/v1/shipments/${shipmentId}/status`)
      .set(auth(token))
      .send({ status });
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe(status);
  }
}

describe('phase 11 portals and authorization', () => {
  beforeAll(async () => {
    const pool = getPool();
    await runMigrations(pool);
    await runSeed(pool);
  });

  afterAll(async () => {
    await closePool();
  });

  it('normalizes can() helpers against backend permission strings', () => {
    expect(can(['shipments.read'], 'shipments.read')).toBe(true);
    expect(can(['shipments.read'], 'shipments:read')).toBe(true);
    expect(can(['shipments.manage'], 'shipments.create')).toBe(true);
    expect(can(['invoices.read'], 'payments.read')).toBe(false);
    expect(canAny(['pod.create'], 'pod.manage', 'pod.create')).toBe(true);
  });

  it('serves role-based dashboards from live data and hides unauthorized dashboards', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const ops = await request(app).get('/api/v1/dashboards/operations').set(auth(admin));
    expect(ops.status).toBe(200);
    expect(ops.body.data.shipments).toEqual(
      expect.objectContaining({
        active: expect.any(Number),
        delivered: expect.any(Number),
        overdue: expect.any(Number),
      }),
    );
    expect(ops.body.data.fleet.availableVehicles).toEqual(expect.any(Number));

    const finance = await request(app).get('/api/v1/dashboards/finance').set(auth(admin));
    expect(finance.status).toBe(200);
    expect(finance.body.data.summary.totalRevenue).toEqual(expect.any(String));

    const customerEmail = `portal.dash.${Date.now()}@example.com`;
    await createCustomerUser({
      email: customerEmail,
      password: 'CustomerPortal!234',
    });
    const cToken = await login(customerEmail, 'CustomerPortal!234');
    expect((await request(app).get('/api/v1/dashboards/operations').set(auth(cToken))).status).toBe(
      403,
    );
    expect((await request(app).get('/api/v1/dashboards/finance').set(auth(cToken))).status).toBe(
      403,
    );
    const customerDash = await request(app).get('/api/v1/dashboards/customer').set(auth(cToken));
    expect(customerDash.status).toBe(200);
    expect(customerDash.body.data.shipments.delivered).toEqual(expect.any(Number));
  });

  it('isolates customer portal data and search from other organizations', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();
    const customerA = await createCustomerUser({
      email: `portal.a.${stamp}@example.com`,
      password: 'CustomerPortal!234',
    });
    const customerB = await createCustomerUser({
      email: `portal.b.${stamp}@example.com`,
      password: 'CustomerPortal!234',
    });
    const shipmentA = await createShipment(admin, customerA.organizationId, `Alpha cargo ${stamp}`);
    const shipmentB = await createShipment(admin, customerB.organizationId, `Bravo cargo ${stamp}`);
    const tokenA = await login(`portal.a.${stamp}@example.com`, 'CustomerPortal!234');
    const tokenB = await login(`portal.b.${stamp}@example.com`, 'CustomerPortal!234');

    const listA = await request(app).get('/api/v1/shipments').set(auth(tokenA));
    expect(listA.status).toBe(200);
    const idsA = listA.body.data.map((row: { id: string }) => row.id);
    expect(idsA).toContain(shipmentA.id);
    expect(idsA).not.toContain(shipmentB.id);

    const leak = await request(app).get(`/api/v1/shipments/${shipmentB.id}`).set(auth(tokenA));
    expect(leak.status).toBe(403);

    const searchA = await request(app)
      .get(`/api/v1/search?q=${encodeURIComponent(shipmentB.reference)}`)
      .set(auth(tokenA));
    expect(searchA.status).toBe(200);
    expect(searchA.body.data.results).toEqual([]);

    const profile = await request(app).get('/api/v1/me/customer-profile').set(auth(tokenB));
    expect(profile.status).toBe(200);
    expect(profile.body.data.id).toBe(customerB.organizationId);

    const tracking = await request(app)
      .get(`/api/v1/tracking/shipments/${shipmentA.id}`)
      .set(auth(tokenA));
    expect(tracking.status).toBe(200);
    expect(tracking.body.data.reference).toBe(shipmentA.reference);
  });

  it('enforces driver assignment isolation, trip workflow, and POD delivery', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();
    const customer = await createCustomer(admin, `Driver portal ${stamp}`);
    const shipment = await createShipment(admin, customer.id, `POD cargo ${stamp}`);
    const otherShipment = await createShipment(admin, customer.id, `Other cargo ${stamp}`);
    const vehicle = await createVehicle(admin, organizationId, `RAD ${String(stamp).slice(-6)} P`);
    const driverUser = await createOrgUser({
      email: `driver.portal.${stamp}@mizigox.test`,
      password: 'Driver-Portal-2026!',
      role: 'DRIVER',
      organizationId,
    });
    const otherDriverUser = await createOrgUser({
      email: `driver.other.${stamp}@mizigox.test`,
      password: 'Driver-Portal-2026!',
      role: 'DRIVER',
      organizationId,
    });
    const driver = await createDriver(admin, organizationId, {
      phone: `+250788${String(stamp).slice(-6)}`,
      userId: driverUser.userId,
    });
    await createDriver(admin, organizationId, {
      phone: `+250789${String(stamp).slice(-6)}`,
      userId: otherDriverUser.userId,
    });
    const route = await dispatchRoute(admin, organizationId, {
      shipmentId: shipment.id,
      vehicleId: vehicle.id,
      driverId: driver.id,
    });
    await advanceShipment(admin, shipment.id, [
      'READY_FOR_PICKUP',
      'PICKED_UP',
      'IN_TRANSIT',
      'OUT_FOR_DELIVERY',
    ]);

    const driverToken = await login(`driver.portal.${stamp}@mizigox.test`, 'Driver-Portal-2026!');
    const otherToken = await login(`driver.other.${stamp}@mizigox.test`, 'Driver-Portal-2026!');

    const dash = await request(app).get('/api/v1/dashboards/driver').set(auth(driverToken));
    expect(dash.status).toBe(200);
    expect(dash.body.data.currentAssignment.id).toBe(route.id);

    expect(
      (await request(app).get('/api/v1/dashboards/operations').set(auth(driverToken))).status,
    ).toBe(403);
    expect(
      (await request(app).get(`/api/v1/driver/trips/${route.id}`).set(auth(otherToken))).status,
    ).toBe(403);

    const listed = await request(app).get('/api/v1/shipments').set(auth(driverToken));
    const listedIds = listed.body.data.map((row: { id: string }) => row.id);
    expect(listedIds).toContain(shipment.id);
    expect(listedIds).not.toContain(otherShipment.id);

    const deliveredDirect = await request(app)
      .post(`/api/v1/shipments/${shipment.id}/status`)
      .set(auth(driverToken))
      .send({ status: 'DELIVERED' });
    expect(deliveredDirect.status).toBe(403);

    const adminDeliver = await request(app)
      .post(`/api/v1/shipments/${shipment.id}/status`)
      .set(auth(admin))
      .send({ status: 'DELIVERED' });
    expect(adminDeliver.status).toBe(422);
    expect(adminDeliver.body.error.code).toBe('POD_REQUIRED');

    const accepted = await request(app)
      .post(`/api/v1/driver/trips/${route.id}/accept`)
      .set(auth(driverToken))
      .send({});
    expect(accepted.status).toBe(200);
    const started = await request(app)
      .post(`/api/v1/driver/trips/${route.id}/start`)
      .set(auth(driverToken))
      .send({});
    expect(started.status).toBe(200);
    expect(started.body.data.status).toBe('IN_TRANSIT');

    for (const stop of started.body.data.stops as Array<{ id: string; status: string }>) {
      const arrived = await request(app)
        .post(`/api/v1/driver/stops/${stop.id}/arrive`)
        .set(auth(driverToken))
        .send({});
      expect(arrived.status).toBe(200);
      const serviced = await request(app)
        .post(`/api/v1/driver/stops/${stop.id}/complete`)
        .set(auth(driverToken))
        .send({});
      expect(serviced.status).toBe(200);
    }

    const pod = await request(app).post('/api/v1/pod').set(auth(driverToken)).send({
      shipmentId: shipment.id,
      recipientName: 'Marie Uwase',
      recipientPhone: '+250788000111',
      notes: 'Left with reception',
    });
    expect(pod.status).toBe(201);
    expect(pod.body.data.status).toBe('SUBMITTED');
    const delivered = await request(app).get(`/api/v1/shipments/${shipment.id}`).set(auth(admin));
    expect(delivered.body.data.status).toBe('DELIVERED');

    const completed = await request(app)
      .post(`/api/v1/driver/trips/${route.id}/complete`)
      .set(auth(driverToken))
      .send({});
    expect(completed.status).toBe(200);
    expect(completed.body.data.status).toBe('COMPLETED');
  });

  it('blocks unauthorized admin, finance, profile, and settings access', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();
    const finance = await createOrgUser({
      email: `finance.off.${stamp}@mizigox.test`,
      password: 'Finance-Officer-2026!',
      role: 'FINANCE_OFFICER',
      organizationId,
    });
    const financeToken = await login(`finance.off.${stamp}@mizigox.test`, 'Finance-Officer-2026!');
    const customer = await createCustomerUser({
      email: `settings.${stamp}@example.com`,
      password: 'CustomerPortal!234',
    });
    const customerToken = await login(`settings.${stamp}@example.com`, 'CustomerPortal!234');

    expect((await request(app).get('/api/v1/admin/users').set(auth(financeToken))).status).toBe(
      403,
    );
    expect(
      (await request(app).get('/api/v1/dashboards/finance').set(auth(financeToken))).status,
    ).toBe(200);
    expect((await request(app).get('/api/v1/audit').set(auth(customerToken))).status).toBe(403);
    expect((await request(app).get('/api/v1/admin/audit').set(auth(customerToken))).status).toBe(
      403,
    );

    const escalate = await request(app)
      .patch(`/api/v1/admin/users/${finance.userId}/role`)
      .set(auth(financeToken))
      .send({ role: 'SUPER_ADMIN' });
    expect(escalate.status).toBe(403);

    const selfRole = await request(app)
      .patch('/api/v1/me/profile')
      .set(auth(customerToken))
      .send({ firstName: 'Pat', role: 'SUPER_ADMIN' });
    expect(selfRole.status).toBe(200);
    expect(selfRole.body.data.role).toBe('CUSTOMER_USER');
    expect(selfRole.body.data.firstName).toBe('Pat');

    const orgPatch = await request(app)
      .patch(`/api/v1/organizations/${customer.organizationId}`)
      .set(auth(customerToken))
      .send({ name: 'Hacked Ltd' });
    expect(orgPatch.status).toBe(403);

    const otherOrg = await createOperatorOrganization(`Other ${stamp}`);
    const otherAdmin = await createOrgUser({
      email: `other.admin.${stamp}@mizigox.test`,
      password: 'Company-Admin-2026!',
      role: 'COMPANY_ADMIN',
      organizationId: otherOrg.id,
    });
    const otherToken = await login(`other.admin.${stamp}@mizigox.test`, 'Company-Admin-2026!');
    const usersLeak = await request(app)
      .get(`/api/v1/admin/users?organizationId=${organizationId}`)
      .set(auth(otherToken));
    expect(usersLeak.status).toBe(403);

    const users = await request(app).get('/api/v1/admin/users').set(auth(admin));
    expect(users.status).toBe(200);
    expect(Array.isArray(users.body.data)).toBe(true);

    void otherAdmin;
  });

  it('covers customer, operations, and finance record workflows', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();
    const customer = await createCustomer(admin, `Workflow ${stamp}`);
    const shipment = await createShipment(admin, customer.id, `Workflow cargo ${stamp}`);
    const invoice = await request(app)
      .post('/api/v1/invoices')
      .set(auth(admin))
      .send({
        customerOrganizationId: customer.id,
        shipmentIds: [shipment.id],
        items: [{ description: 'Freight', quantity: '1', unitPrice: '10000.00' }],
      });
    expect(invoice.status).toBe(201);
    const issued = await request(app)
      .post(`/api/v1/invoices/${invoice.body.data.id}/issue`)
      .set(auth(admin));
    expect([200, 201]).toContain(issued.status);

    const opsDash = await request(app).get('/api/v1/dashboards/operations').set(auth(admin));
    expect(opsDash.status).toBe(200);
    const loadedShipment = await request(app)
      .get(`/api/v1/shipments/${shipment.id}`)
      .set(auth(admin));
    expect(loadedShipment.status).toBe(200);
    const search = await request(app)
      .get(`/api/v1/search?q=${encodeURIComponent(shipment.reference)}`)
      .set(auth(admin));
    expect(search.status).toBe(200);
    expect(search.body.data.results.some((hit: { id: string }) => hit.id === shipment.id)).toBe(
      true,
    );

    const loadedInvoice = await request(app)
      .get(`/api/v1/invoices/${invoice.body.data.id}`)
      .set(auth(admin));
    expect(loadedInvoice.status).toBe(200);
    expect(loadedInvoice.body.data.customerOrganizationId).toBe(customer.id);
  });
});
