import { trackingFreshness } from '@mizigox/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getEnv } from '../src/config/env.js';
import { runMigrations } from '../src/db/migrate.js';
import { closePool, getPool } from '../src/db/pool.js';
import { runSeed } from '../src/db/seed.js';
import { publishVehicleLocation, subscribeTracking } from '../src/modules/tracking/tracking.hub.js';
import { createCustomerUser, createOperatorOrganization, createOrgUser } from './helpers.js';

const app = createApp();

const KIGALI = { latitude: -1.9441, longitude: 30.0619 };
const HUYE = { latitude: -2.5967, longitude: 29.7394 };

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
  const response = await request(app)
    .post('/api/v1/vehicles')
    .set(auth(token))
    .send({
      organizationId,
      vehicleType: 'LIGHT_TRUCK',
      registrationNumber: plate,
      payloadCapacity: 3500,
      payloadUnit: 'KG',
      status: 'AVAILABLE',
    });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; reference: string };
}

async function createDriver(
  token: string,
  organizationId: string,
  input: { phone: string; userId?: string; status?: string },
) {
  const response = await request(app)
    .post('/api/v1/drivers')
    .set(auth(token))
    .send({
      organizationId,
      firstName: 'Jean',
      lastName: 'Habimana',
      phoneE164: input.phone,
      userId: input.userId,
      status: input.status ?? 'AVAILABLE',
    });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; reference: string };
}

async function dispatchReadyRoute(
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
    reference: string;
    status: string;
    stops: Array<{ id: string; status: string }>;
  };
}

describe('real-time tracking', () => {
  beforeAll(async () => {
    const pool = getPool();
    await runMigrations(pool);
    await runSeed(pool);
  });

  afterAll(async () => {
    await closePool();
  });

  it('accepts an authorized location update and exposes latest location, freshness, and history', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();
    const customer = await createCustomer(admin, `Track Shipper ${stamp}`);
    const shipment = await createShipment(admin, customer.id, `Coffee ${stamp}`);
    const vehicle = await createVehicle(admin, organizationId, `RAA ${String(stamp).slice(-3)} A`);
    const driverUser = await createOrgUser({
      email: `driver.track.${stamp}@mizigox.test`,
      password: 'Driver-Track-2026!',
      role: 'DRIVER',
      organizationId,
      firstName: 'Jean',
      lastName: 'Driver',
    });
    const driver = await createDriver(admin, organizationId, {
      phone: `+250788${String(stamp).slice(-6)}`,
      userId: driverUser.userId,
    });
    const route = await dispatchReadyRoute(admin, organizationId, {
      shipmentId: shipment.id,
      vehicleId: vehicle.id,
      driverId: driver.id,
    });

    const driverToken = await login(`driver.track.${stamp}@mizigox.test`, 'Driver-Track-2026!');
    const submitted = await request(app)
      .post('/api/v1/tracking/locations')
      .set(auth(driverToken))
      .send({
        latitude: KIGALI.latitude,
        longitude: KIGALI.longitude,
        accuracyMeters: 12,
        speedKph: 38,
        headingDegrees: 180,
        source: 'DRIVER_WEB',
      });
    expect(submitted.status).toBe(201);
    expect(submitted.body.data.vehicleId).toBe(vehicle.id);
    expect(submitted.body.data.latitude).toBeCloseTo(KIGALI.latitude, 4);
    expect(submitted.body.data.longitude).toBeCloseTo(KIGALI.longitude, 4);
    expect(['LIVE', 'RECENT']).toContain(submitted.body.data.freshness);
    expect(submitted.body.data.ageSeconds).toBeGreaterThanOrEqual(0);

    const latest = await request(app)
      .get(`/api/v1/tracking/vehicles/${vehicle.id}/location`)
      .set(auth(admin));
    expect(latest.status).toBe(200);
    expect(latest.body.data.routeId).toBe(route.id);
    expect(latest.body.data.driverId).toBe(driver.id);

    const history = await request(app)
      .get(`/api/v1/tracking/vehicles/${vehicle.id}/history?page=1&pageSize=10`)
      .set(auth(admin));
    expect(history.status).toBe(200);
    expect(history.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(history.body.data[0].latitude).toBeCloseTo(KIGALI.latitude, 4);

    const ranged = await request(app)
      .get(
        `/api/v1/tracking/locations?vehicleId=${vehicle.id}&from=${encodeURIComponent(
          new Date(Date.now() - 60_000).toISOString(),
        )}&to=${encodeURIComponent(new Date().toISOString())}`,
      )
      .set(auth(admin));
    expect(ranged.status).toBe(200);
    expect(ranged.body.data.length).toBeGreaterThanOrEqual(1);

    const emptyRange = await request(app)
      .get(
        `/api/v1/tracking/locations?vehicleId=${vehicle.id}&from=2020-01-01T00:00:00.000Z&to=2020-01-02T00:00:00.000Z`,
      )
      .set(auth(admin));
    expect(emptyRange.status).toBe(200);
    expect(emptyRange.body.data).toHaveLength(0);

    const audit = await getPool().query(
      `SELECT action FROM audit_logs WHERE action = 'TRACKING_LOCATION_SUBMITTED' AND entity_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    );
    expect(audit.rows[0]?.action).toBe('TRACKING_LOCATION_SUBMITTED');
  });

  it('rejects invalid coordinates, timestamps, unauthorized updates, and cross-vehicle driver submissions', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now() + 1;
    const customer = await createCustomer(admin, `Reject Shipper ${stamp}`);
    const shipment = await createShipment(admin, customer.id, `Tea ${stamp}`);
    const vehicle = await createVehicle(admin, organizationId, `RAB ${String(stamp).slice(-3)} B`);
    const otherVehicle = await createVehicle(admin, organizationId, `RAC ${String(stamp).slice(-3)} C`);
    const driverUser = await createOrgUser({
      email: `driver.reject.${stamp}@mizigox.test`,
      password: 'Driver-Track-2026!',
      role: 'DRIVER',
      organizationId,
    });
    const otherDriverUser = await createOrgUser({
      email: `driver.other.${stamp}@mizigox.test`,
      password: 'Driver-Track-2026!',
      role: 'DRIVER',
      organizationId,
    });
    const driver = await createDriver(admin, organizationId, {
      phone: `+250789${String(stamp).slice(-6)}`,
      userId: driverUser.userId,
    });
    await createDriver(admin, organizationId, {
      phone: `+250787${String(stamp).slice(-6)}`,
      userId: otherDriverUser.userId,
    });
    await dispatchReadyRoute(admin, organizationId, {
      shipmentId: shipment.id,
      vehicleId: vehicle.id,
      driverId: driver.id,
    });
    const driverToken = await login(`driver.reject.${stamp}@mizigox.test`, 'Driver-Track-2026!');
    const otherDriverToken = await login(`driver.other.${stamp}@mizigox.test`, 'Driver-Track-2026!');

    const badLat = await request(app)
      .post('/api/v1/tracking/locations')
      .set(auth(driverToken))
      .send({ latitude: 91, longitude: KIGALI.longitude });
    expect(badLat.status).toBe(422);

    const badLng = await request(app)
      .post('/api/v1/tracking/locations')
      .set(auth(driverToken))
      .send({ latitude: KIGALI.latitude, longitude: 181 });
    expect(badLng.status).toBe(422);

    const future = await request(app)
      .post('/api/v1/tracking/locations')
      .set(auth(driverToken))
      .send({
        latitude: KIGALI.latitude,
        longitude: KIGALI.longitude,
        deviceTimestamp: new Date(Date.now() + 3_600_000).toISOString(),
      });
    expect(future.status).toBe(422);

    const stale = await request(app)
      .post('/api/v1/tracking/locations')
      .set(auth(driverToken))
      .send({
        latitude: KIGALI.latitude,
        longitude: KIGALI.longitude,
        deviceTimestamp: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      });
    expect(stale.status).toBe(422);

    const unauthenticated = await request(app)
      .post('/api/v1/tracking/locations')
      .send({ latitude: KIGALI.latitude, longitude: KIGALI.longitude });
    expect(unauthenticated.status).toBe(401);

    const otherVehicleSubmit = await request(app)
      .post('/api/v1/tracking/locations')
      .set(auth(driverToken))
      .send({
        latitude: KIGALI.latitude,
        longitude: KIGALI.longitude,
        vehicleId: otherVehicle.id,
      });
    expect(otherVehicleSubmit.status).toBe(403);

    const otherDriverSubmit = await request(app)
      .post('/api/v1/tracking/locations')
      .set(auth(otherDriverToken))
      .send({
        latitude: HUYE.latitude,
        longitude: HUYE.longitude,
        vehicleId: vehicle.id,
      });
    expect(otherDriverSubmit.status).toBe(422);

    const finance = await createOrgUser({
      email: `finance.track.${stamp}@mizigox.test`,
      password: 'Finance-Track-2026!',
      role: 'FINANCE_OFFICER',
      organizationId,
    });
    const financeToken = await login(`finance.track.${stamp}@mizigox.test`, 'Finance-Track-2026!');
    expect(finance.userId).toBeTruthy();
    const financeSubmit = await request(app)
      .post('/api/v1/tracking/locations')
      .set(auth(financeToken))
      .send({
        latitude: KIGALI.latitude,
        longitude: KIGALI.longitude,
        vehicleId: vehicle.id,
      });
    expect(financeSubmit.status).toBe(403);
  });

  it('isolates organizations, enforces token security, and records tracking events', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now() + 2;
    const customer = await createCustomer(admin, `Token Shipper ${stamp}`);
    const shipment = await createShipment(admin, customer.id, `Beans ${stamp}`);
    const vehicle = await createVehicle(admin, organizationId, `RAD ${String(stamp).slice(-3)} D`);
    const driver = await createDriver(admin, organizationId, {
      phone: `+250786${String(stamp).slice(-6)}`,
    });
    const route = await dispatchReadyRoute(admin, organizationId, {
      shipmentId: shipment.id,
      vehicleId: vehicle.id,
      driverId: driver.id,
    });

    const opsLocation = await request(app)
      .post('/api/v1/tracking/locations')
      .set(auth(admin))
      .send({
        latitude: HUYE.latitude,
        longitude: HUYE.longitude,
        vehicleId: vehicle.id,
        source: 'OPERATIONS',
      });
    expect(opsLocation.status).toBe(201);

    const inTransit = await request(app)
      .post(`/api/v1/routes/${route.id}/status`)
      .set(auth(admin))
      .send({ status: 'IN_TRANSIT' });
    expect(inTransit.status).toBe(200);

    const pickup = await request(app)
      .post(`/api/v1/shipments/${shipment.id}/status`)
      .set(auth(admin))
      .send({ status: 'ASSIGNED' });
    expect([200, 422]).toContain(pickup.status);
    const picked = await request(app)
      .post(`/api/v1/shipments/${shipment.id}/status`)
      .set(auth(admin))
      .send({ status: 'PICKED_UP' });
    expect([200, 422]).toContain(picked.status);

    const routeTracking = await request(app)
      .get(`/api/v1/tracking/routes/${route.id}`)
      .set(auth(admin));
    expect(routeTracking.status).toBe(200);
    expect(routeTracking.body.data.currentLocation.latitude).toBeCloseTo(HUYE.latitude, 4);
    expect(routeTracking.body.data.freshness).toBeTruthy();

    const shipmentTracking = await request(app)
      .get(`/api/v1/tracking/shipments/${shipment.id}`)
      .set(auth(admin));
    expect(shipmentTracking.status).toBe(200);
    expect(shipmentTracking.body.data.reference).toBe(shipment.reference);
    expect(shipmentTracking.body.data.shipmentId).toBe(shipment.id);

    const events = await request(app)
      .get(`/api/v1/tracking/events?routeId=${route.id}&page=1&pageSize=20`)
      .set(auth(admin));
    expect(events.status).toBe(200);
    const types = events.body.data.map((event: { type: string }) => event.type);
    expect(types).toEqual(expect.arrayContaining(['TRIP_STARTED', 'VEHICLE_DEPARTED']));

    const issued = await request(app)
      .post(`/api/v1/tracking/shipments/${shipment.id}/token`)
      .set(auth(admin))
      .send();
    expect(issued.status).toBe(201);
    expect(issued.body.data.token).toMatch(/^mxt_/);
    expect(issued.body.data.publicPath).toBe(`/track/${issued.body.data.token}`);

    const publicOk = await request(app).get(`/api/v1/public/track/${issued.body.data.token}`);
    expect(publicOk.status).toBe(200);
    expect(publicOk.body.data.reference).toBe(shipment.reference);
    expect(publicOk.body.data).not.toHaveProperty('shipmentId');
    expect(publicOk.body.data).not.toHaveProperty('driverName');

    const guessed = await request(app).get(`/api/v1/public/track/mxt_${'a'.repeat(48)}`);
    expect(guessed.status).toBe(404);

    const enumerated = await request(app).get(`/api/v1/public/track/${shipment.id}`);
    expect(enumerated.status).toBe(422);

    const revoked = await request(app)
      .delete(`/api/v1/tracking/shipments/${shipment.id}/token`)
      .set(auth(admin));
    expect(revoked.status).toBe(200);
    const afterRevoke = await request(app).get(`/api/v1/public/track/${issued.body.data.token}`);
    expect(afterRevoke.status).toBe(404);

    const otherOrg = await createOperatorOrganization(`Other Fleet ${stamp}`);
    const otherAdmin = await createOrgUser({
      email: `other.admin.${stamp}@mizigox.test`,
      password: 'Other-Admin-2026!',
      role: 'COMPANY_ADMIN',
      organizationId: otherOrg.id,
    });
    const otherToken = await login(`other.admin.${stamp}@mizigox.test`, 'Other-Admin-2026!');
    const cross = await request(app)
      .get(`/api/v1/tracking/vehicles/${vehicle.id}/location`)
      .set(auth(otherToken));
    expect(cross.status).toBe(403);

    const otherHistory = await request(app)
      .get(`/api/v1/tracking/locations?vehicleId=${vehicle.id}`)
      .set(auth(otherToken));
    expect(otherHistory.status).toBe(200);
    expect(otherHistory.body.data).toHaveLength(0);

    const customerUser = await createCustomerUser({
      email: `customer.track.${stamp}@mizigox.test`,
      password: 'Customer-Track-2026!',
    });
    const customerToken = await login(`customer.track.${stamp}@mizigox.test`, 'Customer-Track-2026!');
    const customerLive = await request(app).get('/api/v1/tracking/live').set(auth(customerToken));
    expect(customerLive.status).toBe(403);
    expect(customerUser.userId).toBeTruthy();

    const live = await request(app).get('/api/v1/tracking/live').set(auth(admin));
    expect(live.status).toBe(200);
    expect(live.body.data.thresholds.liveSeconds).toBeGreaterThan(0);
    expect(live.body.data.map.provider).toBeTruthy();

    const page2 = await request(app)
      .get(`/api/v1/tracking/locations?vehicleId=${vehicle.id}&page=2&pageSize=1`)
      .set(auth(admin));
    expect(page2.status).toBe(200);
    expect(page2.body.meta.page).toBe(2);
  });

  it('computes freshness from configurable thresholds and publishes in-process location events', () => {
    const now = new Date();
    expect(trackingFreshness(now, { liveSeconds: 60, recentSeconds: 300, staleSeconds: 900 })).toBe(
      'LIVE',
    );
    expect(
      trackingFreshness(new Date(now.getTime() - 120_000), {
        liveSeconds: 60,
        recentSeconds: 300,
        staleSeconds: 900,
      }),
    ).toBe('RECENT');
    expect(
      trackingFreshness(new Date(now.getTime() - 600_000), {
        liveSeconds: 60,
        recentSeconds: 300,
        staleSeconds: 900,
      }),
    ).toBe('STALE');
    expect(
      trackingFreshness(new Date(now.getTime() - 2_000_000), {
        liveSeconds: 60,
        recentSeconds: 300,
        staleSeconds: 900,
      }),
    ).toBe('OFFLINE');
    expect(trackingFreshness(null)).toBe('OFFLINE');

    let received: { vehicleId: string } | null = null;
    const unsubscribe = subscribeTracking((payload) => {
      received = payload;
    });
    publishVehicleLocation({
      vehicleId: '11111111-1111-4111-8111-111111111111',
      organizationId: '22222222-2222-4222-8222-222222222222',
      vehicleReference: 'MX-VH-000001',
      vehicleRegistration: 'RAA 001 A',
      driverId: null,
      driverName: null,
      routeId: null,
      routeReference: null,
      routeStatus: null,
      latitude: KIGALI.latitude,
      longitude: KIGALI.longitude,
      accuracyMeters: 8,
      speedKph: 20,
      headingDegrees: 90,
      lastUpdatedAt: now.toISOString(),
      ageSeconds: 1,
      freshness: 'LIVE',
      source: 'DRIVER_WEB',
    });
    unsubscribe();
    expect(received?.vehicleId).toBe('11111111-1111-4111-8111-111111111111');
  });
});
