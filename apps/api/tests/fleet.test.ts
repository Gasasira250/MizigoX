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

function dateOffset(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe('fleet management', () => {
  beforeAll(async () => {
    const pool = getPool();
    await runMigrations(pool);
    await runSeed(pool);
  });

  afterAll(async () => {
    await closePool();
  });

  it('creates, retrieves, and updates a vehicle with a unique reference', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();

    const created = await request(app)
      .post('/api/v1/vehicles')
      .set(auth(admin))
      .send({
        organizationId,
        vehicleType: 'LIGHT_TRUCK',
        registrationNumber: `RAA ${stamp.toString().slice(-3)} A`,
        make: 'Isuzu',
        model: 'NQR',
        year: 2022,
        color: 'White',
        payloadCapacity: 3500,
        payloadUnit: 'KG',
        fuelType: 'DIESEL',
        ownershipType: 'OWNED',
        status: 'AVAILABLE',
        notes: 'Kigali city fleet',
      });

    expect(created.status).toBe(201);
    expect(created.body.data.reference).toMatch(/^VEH-RW-\d{4}-\d{5}$/);
    expect(created.body.data.registrationNumber).toContain('RAA');
    expect(created.body.data.status).toBe('AVAILABLE');
    expect(created.body.data.availability).toBe('AVAILABLE');
    expect(created.body.data.payloadCapacity).toBe(3500);
    expect(created.body.data.organizationId).toBe(organizationId);

    const vehicleId = created.body.data.id as string;
    const fetched = await request(app).get(`/api/v1/vehicles/${vehicleId}`).set(auth(admin));
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.reference).toBe(created.body.data.reference);

    const updated = await request(app)
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .set(auth(admin))
      .send({ notes: 'Serviced', color: 'Blue', payloadCapacity: 3600 });
    expect(updated.status).toBe(200);
    expect(updated.body.data.notes).toBe('Serviced');
    expect(updated.body.data.color).toBe('Blue');
    expect(updated.body.data.payloadCapacity).toBe(3600);
  });

  it('rejects duplicate active registration numbers and invalid status jumps', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const plate = `RAB ${Date.now().toString().slice(-3)} B`;

    const first = await request(app).post('/api/v1/vehicles').set(auth(admin)).send({
      organizationId,
      vehicleType: 'VAN',
      registrationNumber: plate,
      status: 'ACTIVE',
    });
    expect(first.status).toBe(201);

    const duplicate = await request(app)
      .post('/api/v1/vehicles')
      .set(auth(admin))
      .send({
        organizationId,
        vehicleType: 'VAN',
        registrationNumber: plate.toLowerCase().replace(/\s+/g, '-'),
      });
    expect(duplicate.status).toBe(409);

    const jump = await request(app)
      .post(`/api/v1/vehicles/${first.body.data.id}/status`)
      .set(auth(admin))
      .send({ status: 'IN_TRANSIT' });
    expect(jump.status).toBe(422);
    expect(jump.body.error.code).toBe('VEHICLE_INVALID_TRANSITION');

    const available = await request(app)
      .post(`/api/v1/vehicles/${first.body.data.id}/status`)
      .set(auth(admin))
      .send({ status: 'AVAILABLE' });
    expect(available.status).toBe(200);
    expect(available.body.data.availability).toBe('AVAILABLE');

    const assigned = await request(app)
      .post(`/api/v1/vehicles/${first.body.data.id}/status`)
      .set(auth(admin))
      .send({ status: 'ASSIGNED' });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.availability).toBe('ASSIGNED');

    const transit = await request(app)
      .post(`/api/v1/vehicles/${first.body.data.id}/status`)
      .set(auth(admin))
      .send({ status: 'IN_TRANSIT' });
    expect(transit.status).toBe(200);
    expect(transit.body.data.availability).toBe('ON_TRIP');
  });

  it('creates, retrieves, and updates a driver with license validation', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();

    const invalidLicense = await request(app)
      .post('/api/v1/drivers')
      .set(auth(admin))
      .send({
        organizationId,
        firstName: 'Jean',
        lastName: 'Habimana',
        phoneE164: `+250788${String(stamp).slice(-6)}`,
        licenseIssuedAt: '2026-01-01',
        licenseExpiresAt: '2025-01-01',
      });
    expect(invalidLicense.status).toBe(422);

    const underage = await request(app)
      .post('/api/v1/drivers')
      .set(auth(admin))
      .send({
        organizationId,
        firstName: 'Young',
        lastName: 'Driver',
        phoneE164: `+250787${String(stamp).slice(-6)}`,
        dateOfBirth: dateOffset(-365 * 16),
      });
    expect(underage.status).toBe(422);

    const created = await request(app)
      .post('/api/v1/drivers')
      .set(auth(admin))
      .send({
        organizationId,
        firstName: 'Jean',
        lastName: 'Habimana',
        phoneE164: `+250786${String(stamp).slice(-6)}`,
        email: `jean.${stamp}@example.com`,
        licenseNumber: `DL-${stamp}`,
        licenseCategory: 'C',
        licenseIssuedAt: '2022-01-15',
        licenseExpiresAt: dateOffset(20),
        nationalityCountryCode: 'RW',
        status: 'AVAILABLE',
      });
    expect(created.status).toBe(201);
    expect(created.body.data.reference).toMatch(/^DRV-RW-\d{4}-\d{5}$/);
    expect(created.body.data.status).toBe('AVAILABLE');
    expect(created.body.data.availability).toBe('AVAILABLE');
    expect(created.body.data.documentAlert).toBe('month');

    const driverId = created.body.data.id as string;
    const fetched = await request(app).get(`/api/v1/drivers/${driverId}`).set(auth(admin));
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.licenseCategory).toBe('C');

    const updated = await request(app)
      .patch(`/api/v1/drivers/${driverId}`)
      .set(auth(admin))
      .send({ licenseCategory: 'CE', notes: 'Long-haul certified' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.licenseCategory).toBe('CE');
    expect(updated.body.data.notes).toBe('Long-haul certified');

    const invalidJump = await request(app)
      .post(`/api/v1/drivers/${driverId}/status`)
      .set(auth(admin))
      .send({ status: 'ON_TRIP' });
    expect(invalidJump.status).toBe(422);

    const assigned = await request(app)
      .post(`/api/v1/drivers/${driverId}/status`)
      .set(auth(admin))
      .send({ status: 'ASSIGNED' });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.availability).toBe('ASSIGNED');
  });

  it('links a driver to an existing organization user and rejects foreign users', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();
    const member = await createOrgUser({
      email: `driver.user.${stamp}@example.com`,
      password: 'Driver-User-2026!',
      role: 'DRIVER',
      organizationId,
      firstName: 'Patrick',
      lastName: 'Mugisha',
    });
    const otherOrg = await createOperatorOrganization(`Other fleet ${stamp}`);
    const foreignUser = await createOrgUser({
      email: `foreign.driver.${stamp}@example.com`,
      password: 'Foreign-User-2026!',
      role: 'DRIVER',
      organizationId: otherOrg.id,
    });

    const linked = await request(app)
      .post('/api/v1/drivers')
      .set(auth(admin))
      .send({
        organizationId,
        userId: member.userId,
        firstName: 'Patrick',
        lastName: 'Mugisha',
        phoneE164: `+250785${String(stamp).slice(-6)}`,
      });
    expect(linked.status).toBe(201);
    expect(linked.body.data.userId).toBe(member.userId);
    expect(linked.body.data.userEmail).toBe(`driver.user.${stamp}@example.com`);

    const duplicateLink = await request(app)
      .post('/api/v1/drivers')
      .set(auth(admin))
      .send({
        organizationId,
        userId: member.userId,
        firstName: 'Second',
        lastName: 'Link',
        phoneE164: `+250784${String(stamp).slice(-6)}`,
      });
    expect(duplicateLink.status).toBe(409);

    const foreign = await request(app)
      .post('/api/v1/drivers')
      .set(auth(admin))
      .send({
        organizationId,
        userId: foreignUser.userId,
        firstName: 'Foreign',
        lastName: 'Driver',
        phoneE164: `+250783${String(stamp).slice(-6)}`,
      });
    expect(foreign.status).toBe(403);
  });

  it('manages vehicle and driver documents and detects expiry windows', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();

    const vehicle = await request(app)
      .post('/api/v1/vehicles')
      .set(auth(admin))
      .send({
        organizationId,
        vehicleType: 'MEDIUM_TRUCK',
        registrationNumber: `RAC ${stamp.toString().slice(-3)} C`,
      });
    expect(vehicle.status).toBe(201);

    const driver = await request(app)
      .post('/api/v1/drivers')
      .set(auth(admin))
      .send({
        organizationId,
        firstName: 'Aline',
        lastName: 'Uwase',
        phoneE164: `+250782${String(stamp).slice(-6)}`,
      });
    expect(driver.status).toBe(201);

    const expired = await request(app)
      .post(`/api/v1/vehicles/${vehicle.body.data.id}/documents`)
      .set(auth(admin))
      .send({
        documentType: 'INSURANCE',
        documentNumber: `INS-${stamp}`,
        issuedAt: '2024-01-01',
        expiresAt: dateOffset(-2),
        storageKey: `vehicles/${vehicle.body.data.id}/insurance`,
      });
    expect(expired.status).toBe(201);
    expect(expired.body.data.documents[0].alert).toBe('expired');
    expect(expired.body.data.documents[0].storageProvider).toBe('external');
    expect(expired.body.data.documentAlert).toBe('expired');

    const week = await request(app)
      .post(`/api/v1/drivers/${driver.body.data.id}/documents`)
      .set(auth(admin))
      .send({
        documentType: 'LICENSE',
        documentNumber: `LIC-${stamp}`,
        issuedAt: '2023-01-01',
        expiresAt: dateOffset(5),
      });
    expect(week.status).toBe(201);
    expect(week.body.data.documents[0].alert).toBe('week');
    expect(week.body.data.documents[0].storageProvider).toBe('pending');

    const today = await request(app)
      .post(`/api/v1/vehicles/${vehicle.body.data.id}/documents`)
      .set(auth(admin))
      .send({
        documentType: 'INSPECTION',
        expiresAt: dateOffset(0),
      });
    expect(today.status).toBe(201);

    const month = await request(app)
      .post(`/api/v1/drivers/${driver.body.data.id}/documents`)
      .set(auth(admin))
      .send({
        documentType: 'MEDICAL',
        expiresAt: dateOffset(20),
      });
    expect(month.status).toBe(201);

    const expiredWindow = await request(app)
      .get('/api/v1/fleet/document-expiry?window=expired')
      .set(auth(admin));
    expect(expiredWindow.status).toBe(200);
    expect(
      expiredWindow.body.data.some(
        (item: { documentNumber: string | null }) => item.documentNumber === `INS-${stamp}`,
      ),
    ).toBe(true);

    const weekWindow = await request(app)
      .get('/api/v1/fleet/document-expiry?window=7')
      .set(auth(admin));
    expect(weekWindow.status).toBe(200);
    expect(
      weekWindow.body.data.some(
        (item: { documentNumber: string | null }) => item.documentNumber === `LIC-${stamp}`,
      ),
    ).toBe(true);

    const todayWindow = await request(app)
      .get('/api/v1/fleet/document-expiry?window=today')
      .set(auth(admin));
    expect(todayWindow.status).toBe(200);
    expect(
      todayWindow.body.data.some(
        (item: { documentType: string }) => item.documentType === 'INSPECTION',
      ),
    ).toBe(true);

    const monthWindow = await request(app)
      .get('/api/v1/fleet/document-expiry?window=30')
      .set(auth(admin));
    expect(monthWindow.status).toBe(200);
    expect(
      monthWindow.body.data.some(
        (item: { documentType: string }) => item.documentType === 'MEDICAL',
      ),
    ).toBe(true);

    const updatedDoc = await request(app)
      .patch(
        `/api/v1/vehicles/${vehicle.body.data.id}/documents/${expired.body.data.documents[0].id}`,
      )
      .set(auth(admin))
      .send({ notes: 'Renewal booked' });
    expect(updatedDoc.status).toBe(200);

    const removed = await request(app)
      .delete(`/api/v1/drivers/${driver.body.data.id}/documents/${week.body.data.documents[0].id}`)
      .set(auth(admin));
    expect(removed.status).toBe(200);
    expect(
      removed.body.data.documents.some(
        (doc: { documentType: string }) => doc.documentType === 'LICENSE',
      ),
    ).toBe(false);
  });

  it('supports pagination, filtering, sorting, and records audit events', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();

    for (const type of ['MOTORCYCLE', 'SEDAN', 'PICKUP'] as const) {
      const created = await request(app)
        .post('/api/v1/vehicles')
        .set(auth(admin))
        .send({
          organizationId,
          vehicleType: type,
          registrationNumber: `RAD ${stamp.toString().slice(-2)}${type.slice(0, 1)} Z`,
          make: type === 'SEDAN' ? 'Toyota' : 'Fleet',
          status: type === 'SEDAN' ? 'AVAILABLE' : 'ACTIVE',
        });
      expect(created.status).toBe(201);
    }

    const filtered = await request(app)
      .get(
        '/api/v1/vehicles?vehicleType=SEDAN&status=AVAILABLE&sort=registrationNumber&order=asc&page=1&pageSize=1',
      )
      .set(auth(admin));
    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].vehicleType).toBe('SEDAN');
    expect(filtered.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(filtered.body.meta.pageSize).toBe(1);

    const searched = await request(app).get('/api/v1/vehicles?q=toyota').set(auth(admin));
    expect(searched.status).toBe(200);
    expect(searched.body.data.some((item: { make: string | null }) => item.make === 'Toyota')).toBe(
      true,
    );

    const driverA = await request(app)
      .post('/api/v1/drivers')
      .set(auth(admin))
      .send({
        organizationId,
        firstName: 'Sort',
        lastName: 'Alpha',
        phoneE164: `+250781${String(stamp).slice(-6)}`,
        status: 'AVAILABLE',
      });
    const driverB = await request(app)
      .post('/api/v1/drivers')
      .set(auth(admin))
      .send({
        organizationId,
        firstName: 'Sort',
        lastName: 'Zulu',
        phoneE164: `+250780${String(stamp).slice(-6)}`,
        status: 'OFF_DUTY',
      });
    expect(driverA.status).toBe(201);
    expect(driverB.status).toBe(201);

    const driverPage = await request(app)
      .get('/api/v1/drivers?status=AVAILABLE&sort=name&order=asc&pageSize=1')
      .set(auth(admin));
    expect(driverPage.status).toBe(200);
    expect(driverPage.body.data).toHaveLength(1);
    expect(driverPage.body.meta.pageSize).toBe(1);

    const vehicleAudits = await getPool().query<{ action: string }>(
      `SELECT action FROM audit_logs WHERE entity_type = 'vehicle' AND entity_id = $1`,
      [filtered.body.data[0].id],
    );
    expect(vehicleAudits.rows.map((row) => row.action)).toContain('VEHICLE_CREATED');

    const driverAudits = await getPool().query<{ action: string }>(
      `SELECT action FROM audit_logs WHERE entity_type = 'driver' AND entity_id = $1`,
      [driverA.body.data.id],
    );
    expect(driverAudits.rows.map((row) => row.action)).toContain('DRIVER_CREATED');
  });

  it('enforces permissions and organization isolation', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const organizationId = await defaultOperatorId();
    const stamp = Date.now();
    const otherOrg = await createOperatorOrganization(`Isolation fleet ${stamp}`);
    await createOrgUser({
      email: `finance.officer.${stamp}@example.com`,
      password: 'Finance-Officer-2026!',
      role: 'FINANCE_OFFICER',
      organizationId,
    });
    await createOrgUser({
      email: `other.admin.${stamp}@example.com`,
      password: 'Other-Admin-2026!',
      role: 'COMPANY_ADMIN',
      organizationId: otherOrg.id,
    });
    await createCustomerUser({
      email: `customer.fleet.${stamp}@example.com`,
      password: 'Customer-Fleet-2026!',
    });

    const vehicle = await request(app)
      .post('/api/v1/vehicles')
      .set(auth(admin))
      .send({
        organizationId,
        vehicleType: 'TRAILER',
        registrationNumber: `RAE ${stamp.toString().slice(-3)} E`,
      });
    expect(vehicle.status).toBe(201);
    const driver = await request(app)
      .post('/api/v1/drivers')
      .set(auth(admin))
      .send({
        organizationId,
        firstName: 'Isolated',
        lastName: 'Driver',
        phoneE164: `+250779${String(stamp).slice(-6)}`,
      });
    expect(driver.status).toBe(201);

    const officerToken = await login(
      `finance.officer.${stamp}@example.com`,
      'Finance-Officer-2026!',
    );
    const officerList = await request(app).get('/api/v1/vehicles').set(auth(officerToken));
    expect(officerList.status).toBe(200);
    const officerCreate = await request(app)
      .post('/api/v1/vehicles')
      .set(auth(officerToken))
      .send({
        vehicleType: 'VAN',
        registrationNumber: `RAF ${stamp.toString().slice(-3)} F`,
      });
    expect(officerCreate.status).toBe(403);

    const otherToken = await login(`other.admin.${stamp}@example.com`, 'Other-Admin-2026!');
    const otherVehicle = await request(app)
      .get(`/api/v1/vehicles/${vehicle.body.data.id}`)
      .set(auth(otherToken));
    expect(otherVehicle.status).toBe(403);
    const otherDriver = await request(app)
      .patch(`/api/v1/drivers/${driver.body.data.id}`)
      .set(auth(otherToken))
      .send({ notes: 'should fail' });
    expect(otherDriver.status).toBe(403);
    const otherDocs = await request(app)
      .get(`/api/v1/vehicles/${vehicle.body.data.id}/documents`)
      .set(auth(otherToken));
    expect(otherDocs.status).toBe(403);

    const customerToken = await login(
      `customer.fleet.${stamp}@example.com`,
      'Customer-Fleet-2026!',
    );
    const customerList = await request(app).get('/api/v1/vehicles').set(auth(customerToken));
    expect(customerList.status).toBe(403);

    const types = await request(app).get('/api/v1/vehicles/types').set(auth(admin));
    expect(types.status).toBe(200);
    expect(
      types.body.data.some((item: { code: string }) => item.code === 'REFRIGERATED_TRUCK'),
    ).toBe(true);
  });
});
