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

async function createCustomer(token: string, name: string) {
  const response = await request(app)
    .post('/api/v1/customers')
    .set(auth(token))
    .send({ name, countryCode: 'RW' });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; name: string };
}

async function createShipment(
  token: string,
  customerId: string,
  input: { cargo?: string; weightKg?: number; status?: string } = {},
) {
  const response = await request(app)
    .post('/api/v1/shipments')
    .set(auth(token))
    .send({
      customerOrganizationId: customerId,
      cargoDescription: input.cargo ?? 'Route cargo',
      weightKg: input.weightKg,
      status: input.status,
      origin: { countryCode: 'RW', streetLine1: 'Nyabugogo depot', adminArea2: 'Gasabo' },
      destination: { countryCode: 'RW', streetLine1: 'Huye market', adminArea2: 'Huye' },
      items: input.weightKg
        ? [{ description: 'Pallet', quantity: 1, weightKg: input.weightKg }]
        : [{ description: 'Box', quantity: 1, weightKg: 40 }],
    });
  expect(response.status).toBe(201);
  return response.body.data as {
    id: string;
    reference: string;
    status: string;
    operatorOrganizationId: string;
    currentRoute: { id: string; reference: string; status: string } | null;
  };
}

async function createVehicle(
  token: string,
  organizationId: string,
  input: { plate: string; payload?: number; status?: string } = { plate: `RAA ${Date.now()}` },
) {
  const response = await request(app)
    .post('/api/v1/vehicles')
    .set(auth(token))
    .send({
      organizationId,
      vehicleType: 'LIGHT_TRUCK',
      registrationNumber: input.plate,
      payloadCapacity: input.payload ?? 3500,
      payloadUnit: 'KG',
      status: input.status ?? 'AVAILABLE',
    });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; reference: string; status: string };
}

async function createDriver(
  token: string,
  organizationId: string,
  input: { phone: string; status?: string } = { phone: `+250788${String(Date.now()).slice(-6)}` },
) {
  const response = await request(app)
    .post('/api/v1/drivers')
    .set(auth(token))
    .send({
      organizationId,
      firstName: 'Jean',
      lastName: 'Habimana',
      phoneE164: input.phone,
      status: input.status ?? 'AVAILABLE',
    });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; reference: string; status: string };
}

async function createReadyRoute(
  token: string,
  organizationId: string,
  extras: {
    shipmentIds?: string[];
    vehicleId?: string;
    driverId?: string;
    status?: 'DRAFT' | 'PLANNED';
  } = {},
) {
  const created = await request(app)
    .post('/api/v1/routes')
    .set(auth(token))
    .send({
      organizationId,
      shipmentIds: extras.shipmentIds ?? [],
      vehicleId: extras.vehicleId,
      driverId: extras.driverId,
      plannedDepartureAt: '2026-09-01T07:00:00.000Z',
      plannedArrivalAt: '2026-09-01T16:00:00.000Z',
      status: extras.status ?? 'PLANNED',
    });
  expect(created.status).toBe(201);
  return created.body.data as {
    id: string;
    reference: string;
    status: string;
    stops: Array<{ id: string; sequence: number; stopType: string }>;
    shipments: Array<{ shipmentId: string; reference: string }>;
    events: Array<{ type: string; previousStatus: string | null; status: string | null }>;
  };
}

describe('route management and dispatch', () => {
  beforeAll(async () => {
    const pool = getPool();
    await runMigrations(pool);
    await runSeed(pool);
  });

  afterAll(async () => {
    await closePool();
  });

  it('creates, retrieves, updates, and cancels a route with a unique reference', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();
    const customer = await createCustomer(admin, `Route Shipper ${stamp}`);
    const shipment = await createShipment(admin, customer.id, { cargo: `Tea ${stamp}` });

    const created = await request(app)
      .post('/api/v1/routes')
      .set(auth(admin))
      .send({
        organizationId,
        shipmentIds: [shipment.id],
        notes: 'Kigali to Huye',
        status: 'DRAFT',
      });
    expect(created.status).toBe(201);
    expect(created.body.data.reference).toMatch(/^MX-RT-\d{6}$/);
    expect(created.body.data.status).toBe('DRAFT');
    expect(created.body.data.shipments).toHaveLength(1);
    expect(created.body.data.stops.length).toBeGreaterThanOrEqual(2);
    expect(created.body.data.origin).toContain('Nyabugogo');
    expect(created.body.data.destination).toContain('Huye');

    const fetched = await request(app)
      .get(`/api/v1/routes/${created.body.data.id}`)
      .set(auth(admin));
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.reference).toBe(created.body.data.reference);

    const updated = await request(app)
      .patch(`/api/v1/routes/${created.body.data.id}`)
      .set(auth(admin))
      .send({
        notes: 'Updated corridor',
        plannedDepartureAt: '2026-09-02T06:00:00.000Z',
        plannedArrivalAt: '2026-09-02T15:00:00.000Z',
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.notes).toBe('Updated corridor');

    const cancelled = await request(app)
      .post(`/api/v1/routes/${created.body.data.id}/status`)
      .set(auth(admin))
      .send({ status: 'CANCELLED', note: 'Customer postponed' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');

    const history = await request(app)
      .get(`/api/v1/routes/${created.body.data.id}/history`)
      .set(auth(admin));
    expect(history.status).toBe(200);
    expect(history.body.data.map((event: { type: string }) => event.type)).toEqual(
      expect.arrayContaining(['CREATED', 'UPDATED', 'CANCELLED']),
    );
  });

  it('enforces controlled status transitions and records history', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();
    const customer = await createCustomer(admin, `Lifecycle ${stamp}`);
    const shipment = await createShipment(admin, customer.id);
    const vehicle = await createVehicle(admin, organizationId, {
      plate: `RAB ${String(stamp).slice(-3)} C`,
    });
    const driver = await createDriver(admin, organizationId, {
      phone: `+250781${String(stamp).slice(-6)}`,
    });
    const route = await createReadyRoute(admin, organizationId, {
      shipmentIds: [shipment.id],
      vehicleId: vehicle.id,
      driverId: driver.id,
    });

    const jump = await request(app)
      .post(`/api/v1/routes/${route.id}/status`)
      .set(auth(admin))
      .send({ status: 'IN_TRANSIT' });
    expect(jump.status).toBe(422);
    expect(jump.body.error.code).toBe('ROUTE_INVALID_TRANSITION');

    const ready = await request(app)
      .post(`/api/v1/routes/${route.id}/status`)
      .set(auth(admin))
      .send({ status: 'READY' });
    expect(ready.status).toBe(200);
    expect(ready.body.data.status).toBe('READY');

    const vehicleAfterReady = await request(app)
      .get(`/api/v1/vehicles/${vehicle.id}`)
      .set(auth(admin));
    expect(vehicleAfterReady.body.data.status).toBe('ASSIGNED');
    const driverAfterReady = await request(app)
      .get(`/api/v1/drivers/${driver.id}`)
      .set(auth(admin));
    expect(driverAfterReady.body.data.status).toBe('ASSIGNED');

    const back = await request(app)
      .post(`/api/v1/routes/${route.id}/status`)
      .set(auth(admin))
      .send({ status: 'PLANNED' });
    expect(back.status).toBe(200);
    expect(back.body.data.status).toBe('PLANNED');
    const vehicleRestored = await request(app)
      .get(`/api/v1/vehicles/${vehicle.id}`)
      .set(auth(admin));
    expect(vehicleRestored.body.data.status).toBe('AVAILABLE');
  });

  it('manages stops, unique sequence, and reorder', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();
    const customer = await createCustomer(admin, `Stops ${stamp}`);
    const shipment = await createShipment(admin, customer.id);
    const route = await createReadyRoute(admin, organizationId, {
      shipmentIds: [shipment.id],
      status: 'DRAFT',
    });

    const added = await request(app)
      .post(`/api/v1/routes/${route.id}/stops`)
      .set(auth(admin))
      .send({
        stopType: 'WAYPOINT',
        formattedAddress: 'Muhanga rest stop',
        contactName: 'Depot clerk',
        contactPhone: '+250788333001',
      });
    expect(added.status).toBe(201);
    expect(added.body.data.stops).toHaveLength(route.stops.length + 1);

    const waypoint = added.body.data.stops.find(
      (stop: { stopType: string }) => stop.stopType === 'WAYPOINT',
    );
    const patched = await request(app)
      .patch(`/api/v1/routes/${route.id}/stops/${waypoint.id}`)
      .set(auth(admin))
      .send({ instructions: 'Fuel and check cargo', status: 'PENDING' });
    expect(patched.status).toBe(200);
    expect(
      patched.body.data.stops.find((stop: { id: string }) => stop.id === waypoint.id).instructions,
    ).toBe('Fuel and check cargo');

    const ids = patched.body.data.stops.map((stop: { id: string }) => stop.id).reverse();
    const reordered = await request(app)
      .post(`/api/v1/routes/${route.id}/stops/reorder`)
      .set(auth(admin))
      .send({ stopIds: ids });
    expect(reordered.status).toBe(200);
    expect(reordered.body.data.stops.map((stop: { id: string }) => stop.id)).toEqual(ids);
    expect(reordered.body.data.stops[0].sequence).toBe(1);

    const incomplete = await request(app)
      .post(`/api/v1/routes/${route.id}/stops/reorder`)
      .set(auth(admin))
      .send({ stopIds: ids.slice(0, 1) });
    expect(incomplete.status).toBe(422);

    const removed = await request(app)
      .delete(`/api/v1/routes/${route.id}/stops/${waypoint.id}`)
      .set(auth(admin));
    expect(removed.status).toBe(200);
    expect(removed.body.data.stops.every((stop: { id: string }) => stop.id !== waypoint.id)).toBe(
      true,
    );
  });

  it('assigns and removes shipments without conflicting active routes', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();
    const customer = await createCustomer(admin, `Assign ${stamp}`);
    const first = await createShipment(admin, customer.id, { cargo: `First ${stamp}` });
    const second = await createShipment(admin, customer.id, { cargo: `Second ${stamp}` });
    const route = await createReadyRoute(admin, organizationId, {
      shipmentIds: [first.id],
      status: 'DRAFT',
    });

    const added = await request(app)
      .post(`/api/v1/routes/${route.id}/shipments`)
      .set(auth(admin))
      .send({ shipmentId: second.id });
    expect(added.status).toBe(201);
    expect(added.body.data.shipments).toHaveLength(2);

    const listed = await request(app).get(`/api/v1/routes/${route.id}/shipments`).set(auth(admin));
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(2);

    const other = await createReadyRoute(admin, organizationId, { status: 'DRAFT' });
    const conflict = await request(app)
      .post(`/api/v1/routes/${other.id}/shipments`)
      .set(auth(admin))
      .send({ shipmentId: second.id });
    expect(conflict.status).toBe(422);
    expect(conflict.body.error.message).toMatch(/already on active route/i);

    const removed = await request(app)
      .delete(`/api/v1/routes/${route.id}/shipments/${second.id}`)
      .set(auth(admin));
    expect(removed.status).toBe(200);
    expect(removed.body.data.shipments).toHaveLength(1);

    const reassigned = await request(app)
      .post(`/api/v1/routes/${other.id}/shipments`)
      .set(auth(admin))
      .send({ shipmentId: second.id });
    expect(reassigned.status).toBe(201);

    const shipmentView = await request(app).get(`/api/v1/shipments/${first.id}`).set(auth(admin));
    expect(shipmentView.body.data.currentRoute.reference).toBe(route.reference);
  });

  it('validates vehicle and driver availability, capacity, and organization', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();
    const customer = await createCustomer(admin, `Fleet val ${stamp}`);
    const heavy = await createShipment(admin, customer.id, {
      cargo: `Heavy ${stamp}`,
      weightKg: 500,
    });
    const light = await createShipment(admin, customer.id, {
      cargo: `Light ${stamp}`,
      weightKg: 80,
    });
    const smallVehicle = await createVehicle(admin, organizationId, {
      plate: `RAC ${String(stamp).slice(-3)} D`,
      payload: 100,
    });
    const retired = await createVehicle(admin, organizationId, {
      plate: `RAD ${String(stamp).slice(-3)} E`,
    });
    await request(app)
      .post(`/api/v1/vehicles/${retired.id}/status`)
      .set(auth(admin))
      .send({ status: 'INACTIVE' });
    await request(app)
      .post(`/api/v1/vehicles/${retired.id}/status`)
      .set(auth(admin))
      .send({ status: 'RETIRED' });
    const offDuty = await createDriver(admin, organizationId, {
      phone: `+250782${String(stamp).slice(-6)}`,
    });
    await request(app)
      .post(`/api/v1/drivers/${offDuty.id}/status`)
      .set(auth(admin))
      .send({ status: 'OFF_DUTY' });

    const retiredAssign = await request(app)
      .post('/api/v1/routes')
      .set(auth(admin))
      .send({ organizationId, shipmentIds: [light.id], vehicleId: retired.id });
    expect(retiredAssign.status).toBe(422);

    const offDutyAssign = await request(app)
      .post('/api/v1/routes')
      .set(auth(admin))
      .send({ organizationId, shipmentIds: [light.id], driverId: offDuty.id });
    expect(offDutyAssign.status).toBe(422);

    const otherOrg = await createOperatorOrganization(`West Fleet ${stamp}`);
    const foreignVehicle = await createVehicle(admin, otherOrg.id, {
      plate: `RAE ${String(stamp).slice(-3)} F`,
    });
    const foreignDriver = await createDriver(admin, otherOrg.id, {
      phone: `+250783${String(stamp).slice(-6)}`,
    });
    const foreignVehicleAssign = await request(app)
      .post('/api/v1/routes')
      .set(auth(admin))
      .send({
        organizationId,
        shipmentIds: [light.id],
        vehicleId: foreignVehicle.id,
      });
    expect(foreignVehicleAssign.status).toBe(403);
    const foreignDriverAssign = await request(app)
      .post('/api/v1/routes')
      .set(auth(admin))
      .send({
        organizationId,
        shipmentIds: [light.id],
        driverId: foreignDriver.id,
      });
    expect(foreignDriverAssign.status).toBe(403);

    const overweight = await createReadyRoute(admin, organizationId, {
      shipmentIds: [heavy.id],
      vehicleId: smallVehicle.id,
      driverId: (
        await createDriver(admin, organizationId, { phone: `+250784${String(stamp).slice(-6)}` })
      ).id,
    });
    const ready = await request(app)
      .post(`/api/v1/routes/${overweight.id}/status`)
      .set(auth(admin))
      .send({ status: 'READY' });
    expect(ready.status).toBe(200);
    const capacityFail = await request(app)
      .post(`/api/v1/routes/${overweight.id}/dispatch`)
      .set(auth(admin));
    expect(capacityFail.status).toBe(422);
    expect(capacityFail.body.error.message).toMatch(/exceeds vehicle capacity/i);
    expect(capacityFail.body.data ?? capacityFail.body.error.details).toBeTruthy();
  });

  it('dispatches a valid ready route and rejects incomplete dispatch', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();
    const customer = await createCustomer(admin, `Dispatch ${stamp}`);
    const shipment = await createShipment(admin, customer.id, {
      cargo: `Dispatch ${stamp}`,
      weightKg: 200,
    });
    const vehicle = await createVehicle(admin, organizationId, {
      plate: `RAF ${String(stamp).slice(-3)} G`,
      payload: 2000,
    });
    const driver = await createDriver(admin, organizationId, {
      phone: `+250785${String(stamp).slice(-6)}`,
    });

    const empty = await createReadyRoute(admin, organizationId, { status: 'PLANNED' });
    const noShipment = await request(app)
      .post(`/api/v1/routes/${empty.id}/status`)
      .set(auth(admin))
      .send({ status: 'READY' });
    expect(noShipment.status).toBe(200);
    const missingShipment = await request(app)
      .post(`/api/v1/dispatch/routes/${empty.id}`)
      .set(auth(admin));
    expect(missingShipment.status).toBe(422);
    expect(missingShipment.body.error.message).toMatch(/shipment/i);

    const route = await createReadyRoute(admin, organizationId, {
      shipmentIds: [shipment.id],
      vehicleId: vehicle.id,
      driverId: driver.id,
    });
    const notReady = await request(app)
      .post(`/api/v1/routes/${route.id}/dispatch`)
      .set(auth(admin));
    expect(notReady.status).toBe(422);

    await request(app)
      .post(`/api/v1/routes/${route.id}/status`)
      .set(auth(admin))
      .send({ status: 'READY' });

    const check = await request(app)
      .get(`/api/v1/routes/${route.id}/dispatch-check`)
      .set(auth(admin));
    expect(check.status).toBe(200);
    expect(check.body.data.ok).toBe(true);

    const dispatched = await request(app)
      .post(`/api/v1/dispatch/routes/${route.id}`)
      .set(auth(admin))
      .send({ note: 'Left Kigali yard' });
    expect(dispatched.status).toBe(200);
    expect(dispatched.body.data.status).toBe('DISPATCHED');
    expect(dispatched.body.data.dispatchedAt).toBeTruthy();

    const vehicleAfter = await request(app).get(`/api/v1/vehicles/${vehicle.id}`).set(auth(admin));
    expect(vehicleAfter.body.data.status).toBe('ASSIGNED');
    const driverAfter = await request(app).get(`/api/v1/drivers/${driver.id}`).set(auth(admin));
    expect(driverAfter.body.data.status).toBe('ASSIGNED');
    const shipmentAfter = await request(app)
      .get(`/api/v1/shipments/${shipment.id}`)
      .set(auth(admin));
    expect(shipmentAfter.body.data.status).toBe('ASSIGNED');
    expect(shipmentAfter.body.data.currentRoute.status).toBe('DISPATCHED');

    const lockedStop = await request(app)
      .post(`/api/v1/routes/${route.id}/stops`)
      .set(auth(admin))
      .send({ stopType: 'WAYPOINT', formattedAddress: 'Too late' });
    expect(lockedStop.status).toBe(422);

    const transit = await request(app)
      .post(`/api/v1/routes/${route.id}/status`)
      .set(auth(admin))
      .send({ status: 'IN_TRANSIT' });
    expect(transit.status).toBe(200);
    const vehicleTransit = await request(app)
      .get(`/api/v1/vehicles/${vehicle.id}`)
      .set(auth(admin));
    expect(vehicleTransit.body.data.status).toBe('IN_TRANSIT');
    const driverTransit = await request(app).get(`/api/v1/drivers/${driver.id}`).set(auth(admin));
    expect(driverTransit.body.data.status).toBe('ON_TRIP');

    await request(app)
      .post(`/api/v1/routes/${route.id}/status`)
      .set(auth(admin))
      .send({ status: 'ARRIVED' });
    const completed = await request(app)
      .post(`/api/v1/routes/${route.id}/status`)
      .set(auth(admin))
      .send({ status: 'COMPLETED' });
    expect(completed.status).toBe(200);
    const vehicleDone = await request(app).get(`/api/v1/vehicles/${vehicle.id}`).set(auth(admin));
    expect(vehicleDone.body.data.status).toBe('AVAILABLE');
    const driverDone = await request(app).get(`/api/v1/drivers/${driver.id}`).set(auth(admin));
    expect(driverDone.body.data.status).toBe('AVAILABLE');
  });

  it('rolls back dispatch when a later write fails', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();
    const customer = await createCustomer(admin, `Rollback ${stamp}`);
    const shipment = await createShipment(admin, customer.id, { cargo: `Rollback ${stamp}` });
    const vehicle = await createVehicle(admin, organizationId, {
      plate: `RAG ${String(stamp).slice(-3)} H`,
    });
    const driver = await createDriver(admin, organizationId, {
      phone: `+250786${String(stamp).slice(-6)}`,
    });
    const route = await createReadyRoute(admin, organizationId, {
      shipmentIds: [shipment.id],
      vehicleId: vehicle.id,
      driverId: driver.id,
    });
    await request(app)
      .post(`/api/v1/routes/${route.id}/status`)
      .set(auth(admin))
      .send({ status: 'READY' });

    const pool = getPool();
    await pool.query(`
      CREATE OR REPLACE FUNCTION test_fail_dispatch_event()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.event_type = 'DISPATCHED' THEN
          RAISE EXCEPTION 'forced dispatch failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await pool.query(`
      DROP TRIGGER IF EXISTS test_fail_dispatch_event ON route_events;
      CREATE TRIGGER test_fail_dispatch_event
      BEFORE INSERT ON route_events
      FOR EACH ROW EXECUTE FUNCTION test_fail_dispatch_event();
    `);

    let failedStatus = 0;
    try {
      const failed = await request(app)
        .post(`/api/v1/routes/${route.id}/dispatch`)
        .set(auth(admin));
      failedStatus = failed.status;
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS test_fail_dispatch_event ON route_events');
      await pool.query('DROP FUNCTION IF EXISTS test_fail_dispatch_event()');
    }
    expect(failedStatus).toBeGreaterThanOrEqual(400);

    const stillReady = await request(app).get(`/api/v1/routes/${route.id}`).set(auth(admin));
    expect(stillReady.body.data.status).toBe('READY');
    const shipmentStill = await request(app)
      .get(`/api/v1/shipments/${shipment.id}`)
      .set(auth(admin));
    expect(shipmentStill.body.data.status).toBe('CONFIRMED');
    expect(
      stillReady.body.data.events.some((event: { type: string }) => event.type === 'DISPATCHED'),
    ).toBe(false);
  });

  it('prevents conflicting vehicle and driver assignment on committed routes', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();
    const customer = await createCustomer(admin, `Conflict ${stamp}`);
    const first = await createShipment(admin, customer.id, { cargo: `C1 ${stamp}` });
    const second = await createShipment(admin, customer.id, { cargo: `C2 ${stamp}` });
    const vehicle = await createVehicle(admin, organizationId, {
      plate: `RAH ${String(stamp).slice(-3)} I`,
    });
    const driver = await createDriver(admin, organizationId, {
      phone: `+250787${String(stamp).slice(-6)}`,
    });
    const firstRoute = await createReadyRoute(admin, organizationId, {
      shipmentIds: [first.id],
      vehicleId: vehicle.id,
      driverId: driver.id,
    });
    await request(app)
      .post(`/api/v1/routes/${firstRoute.id}/status`)
      .set(auth(admin))
      .send({ status: 'READY' });

    const secondRoute = await createReadyRoute(admin, organizationId, {
      shipmentIds: [second.id],
      status: 'DRAFT',
    });
    const vehicleConflict = await request(app)
      .patch(`/api/v1/routes/${secondRoute.id}`)
      .set(auth(admin))
      .send({ vehicleId: vehicle.id });
    expect(vehicleConflict.status).toBe(422);
    const driverConflict = await request(app)
      .patch(`/api/v1/routes/${secondRoute.id}`)
      .set(auth(admin))
      .send({ driverId: driver.id });
    expect(driverConflict.status).toBe(422);
  });

  it('lists routes with pagination, filtering, and sorting', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();
    const customer = await createCustomer(admin, `Filter ${stamp}`);
    const first = await createShipment(admin, customer.id, { cargo: `Filter A ${stamp}` });
    const second = await createShipment(admin, customer.id, { cargo: `Filter B ${stamp}` });
    const vehicle = await createVehicle(admin, organizationId, {
      plate: `RAI ${String(stamp).slice(-3)} J`,
    });
    const driver = await createDriver(admin, organizationId, {
      phone: `+250770${String(stamp).slice(-6)}`,
    });
    await createReadyRoute(admin, organizationId, {
      shipmentIds: [first.id],
      vehicleId: vehicle.id,
      driverId: driver.id,
      status: 'DRAFT',
    });
    await createReadyRoute(admin, organizationId, {
      shipmentIds: [second.id],
      status: 'PLANNED',
    });

    const page = await request(app)
      .get('/api/v1/routes?page=1&pageSize=1&sort=reference&order=desc')
      .set(auth(admin));
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta.total).toBeGreaterThanOrEqual(2);

    const filtered = await request(app)
      .get(`/api/v1/routes?status=DRAFT&vehicleId=${vehicle.id}&driverId=${driver.id}`)
      .set(auth(admin));
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.every((row: { status: string }) => row.status === 'DRAFT')).toBe(
      true,
    );
    expect(
      filtered.body.data.every((row: { vehicleId: string }) => row.vehicleId === vehicle.id),
    ).toBe(true);

    const board = await request(app).get('/api/v1/dispatch/board').set(auth(admin));
    expect(board.status).toBe(200);
    expect(board.body.data.unassignedShipments).toBeDefined();
    expect(board.body.data.plannedRoutes).toBeDefined();
    expect(board.body.data.availableVehicles).toBeDefined();
    expect(board.body.data.availableDrivers).toBeDefined();
  });

  it('enforces permissions and organization isolation', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();
    const password = 'Route-User-2026!';
    const customer = await createCustomer(admin, `Iso ${stamp}`);
    const shipment = await createShipment(admin, customer.id, { cargo: `Iso ${stamp}` });
    const vehicle = await createVehicle(admin, organizationId, {
      plate: `RAJ ${String(stamp).slice(-3)} K`,
    });
    const driver = await createDriver(admin, organizationId, {
      phone: `+250771${String(stamp).slice(-6)}`,
    });
    const route = await createReadyRoute(admin, organizationId, {
      shipmentIds: [shipment.id],
      vehicleId: vehicle.id,
      driverId: driver.id,
    });

    const unauthenticated = await request(app).get('/api/v1/routes');
    expect(unauthenticated.status).toBe(401);

    await createOrgUser({
      email: `finance.route.${stamp}@example.com`,
      password,
      role: 'FINANCE_OFFICER',
      organizationId,
    });
    const financeToken = await login(`finance.route.${stamp}@example.com`, password);
    const financeList = await request(app).get('/api/v1/routes').set(auth(financeToken));
    expect(financeList.status).toBe(200);
    const financeCreate = await request(app)
      .post('/api/v1/routes')
      .set(auth(financeToken))
      .send({ organizationId, shipmentIds: [shipment.id] });
    expect(financeCreate.status).toBe(403);
    const financeDispatch = await request(app)
      .post(`/api/v1/routes/${route.id}/dispatch`)
      .set(auth(financeToken));
    expect(financeDispatch.status).toBe(403);

    const otherOperator = await createOperatorOrganization(`South Operator ${stamp}`);
    await createOrgUser({
      email: `south.admin.${stamp}@example.com`,
      password,
      role: 'COMPANY_ADMIN',
      organizationId: otherOperator.id,
    });
    const otherToken = await login(`south.admin.${stamp}@example.com`, password);
    const leaked = await request(app).get(`/api/v1/routes/${route.id}`).set(auth(otherToken));
    expect(leaked.status).toBe(403);
    const leakedStop = await request(app)
      .post(`/api/v1/routes/${route.id}/stops`)
      .set(auth(otherToken))
      .send({ stopType: 'WAYPOINT', formattedAddress: 'No' });
    expect(leakedStop.status).toBe(403);
    const attachForeign = await request(app)
      .post('/api/v1/routes')
      .set(auth(otherToken))
      .send({ shipmentIds: [shipment.id] });
    expect(attachForeign.status).toBe(403);

    const portal = await createCustomerUser({
      email: `portal.route.${stamp}@example.com`,
      password,
    });
    const portalToken = await login(`portal.route.${stamp}@example.com`, password);
    const portalList = await request(app).get('/api/v1/routes').set(auth(portalToken));
    expect(portalList.status).toBe(403);
    void portal;
  });

  it('writes audit records for route and dispatch actions', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();
    const customer = await createCustomer(admin, `Audit route ${stamp}`);
    const shipment = await createShipment(admin, customer.id, { cargo: `Audit ${stamp}` });
    const extra = await createShipment(admin, customer.id, { cargo: `Audit extra ${stamp}` });
    const vehicle = await createVehicle(admin, organizationId, {
      plate: `RAK ${String(stamp).slice(-3)} L`,
    });
    const driver = await createDriver(admin, organizationId, {
      phone: `+250772${String(stamp).slice(-6)}`,
    });
    const created = await request(app)
      .post('/api/v1/routes')
      .set(auth(admin))
      .send({
        organizationId,
        shipmentIds: [shipment.id],
        status: 'DRAFT',
      });
    const id = created.body.data.id as string;
    await request(app)
      .patch(`/api/v1/routes/${id}`)
      .set(auth(admin))
      .send({ vehicleId: vehicle.id, driverId: driver.id, notes: 'Audit note' });
    await request(app)
      .post(`/api/v1/routes/${id}/shipments`)
      .set(auth(admin))
      .send({ shipmentId: extra.id });
    await request(app).delete(`/api/v1/routes/${id}/shipments/${extra.id}`).set(auth(admin));
    const stop = await request(app)
      .post(`/api/v1/routes/${id}/stops`)
      .set(auth(admin))
      .send({ stopType: 'WAYPOINT', formattedAddress: 'Audit stop' });
    const stopId = stop.body.data.stops.find(
      (item: { stopType: string }) => item.stopType === 'WAYPOINT',
    ).id;
    await request(app)
      .patch(`/api/v1/routes/${id}/stops/${stopId}`)
      .set(auth(admin))
      .send({ notes: 'Hold' });
    await request(app)
      .post(`/api/v1/routes/${id}/status`)
      .set(auth(admin))
      .send({ status: 'PLANNED' });
    await request(app)
      .post(`/api/v1/routes/${id}/status`)
      .set(auth(admin))
      .send({ status: 'CANCELLED' });

    const actions = await getPool().query<{ action: string }>(
      `
        SELECT action FROM audit_logs
        WHERE entity_id = $1::text OR entity_id = $2::text
        ORDER BY created_at
      `,
      [id, stopId],
    );
    expect(actions.rows.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'ROUTE_CREATED',
        'ROUTE_UPDATED',
        'ROUTE_VEHICLE_ASSIGNED',
        'ROUTE_DRIVER_ASSIGNED',
        'ROUTE_SHIPMENT_ADDED',
        'ROUTE_SHIPMENT_REMOVED',
        'ROUTE_STOP_ADDED',
        'ROUTE_STOP_UPDATED',
        'ROUTE_STATUS_CHANGED',
        'ROUTE_CANCELLED',
      ]),
    );
  });
});
