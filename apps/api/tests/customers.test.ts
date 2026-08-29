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

describe('customer management', () => {
  beforeAll(async () => {
    const pool = getPool();
    await runMigrations(pool);
    await runSeed(pool);
  });

  afterAll(async () => {
    await closePool();
  });

  it('creates, retrieves, updates, and archives a customer with contacts and addresses', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();

    const created = await request(app)
      .post('/api/v1/customers')
      .set(auth(admin))
      .send({
        name: `Inyange Foods ${stamp}`,
        legalName: 'Inyange Foods Ltd',
        customerType: 'BUSINESS',
        registrationNumber: `REG-${stamp}`,
        taxId: `TIN-${stamp}`,
        email: `inyange.${stamp}@example.com`,
        phoneE164: '+250788111222',
        website: 'inyange.rw',
        countryCode: 'RW',
        city: 'Kigali',
        notes: 'Dairy and beverages shipper',
        primaryContact: {
          firstName: 'Aline',
          lastName: 'Uwase',
          jobTitle: 'Logistics lead',
          email: `aline.${stamp}@example.com`,
          phoneE164: '+250788111223',
          isPrimary: true,
        },
        primaryAddress: {
          addressType: 'OFFICE',
          countryCode: 'RW',
          adminArea1: 'Kigali',
          adminArea2: 'Gasabo',
          subLocality: 'Kimironko',
          locality: 'Kigali',
          streetLine1: 'KG 11 Ave',
          latitude: -1.9441,
          longitude: 30.0619,
          isDefault: true,
        },
      });

    expect(created.status).toBe(201);
    expect(created.body.data.customerReference).toMatch(/^CUS-RW-\d{4}-\d{5}$/);
    expect(created.body.data.customerType).toBe('BUSINESS');
    expect(created.body.data.status).toBe('ACTIVE');
    expect(created.body.data.website).toBe('https://inyange.rw');
    expect(created.body.data.city).toBe('Kigali');
    expect(created.body.data.createdByName).toBeTruthy();
    expect(created.body.data.contacts).toHaveLength(1);
    expect(created.body.data.contacts[0].isPrimary).toBe(true);
    expect(created.body.data.addresses[0].addressType).toBe('OFFICE');
    expect(created.body.data.addresses[0].latitude).toBeCloseTo(-1.9441);
    const customerId = created.body.data.id as string;

    const fetched = await request(app).get(`/api/v1/customers/${customerId}`).set(auth(admin));
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.customerReference).toBe(created.body.data.customerReference);

    const updated = await request(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set(auth(admin))
      .send({ notes: 'Preferred dairy customer', city: 'Musanze' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.notes).toBe('Preferred dairy customer');
    expect(updated.body.data.city).toBe('Musanze');

    const contact = await request(app)
      .post(`/api/v1/customers/${customerId}/contacts`)
      .set(auth(admin))
      .send({
        firstName: 'Eric',
        lastName: 'Niyonzima',
        jobTitle: 'Accounts',
        email: `eric.${stamp}@example.com`,
        phoneE164: '+250788111224',
        isPrimary: false,
      });
    expect(contact.status).toBe(201);
    expect(contact.body.data.lastName).toBe('Niyonzima');

    const contactUpdate = await request(app)
      .patch(`/api/v1/customers/${customerId}/contacts/${contact.body.data.id}`)
      .set(auth(admin))
      .send({ jobTitle: 'Finance officer', status: 'INACTIVE' });
    expect(contactUpdate.status).toBe(200);
    expect(contactUpdate.body.data.jobTitle).toBe('Finance officer');
    expect(contactUpdate.body.data.status).toBe('INACTIVE');

    const address = await request(app)
      .post(`/api/v1/customers/${customerId}/addresses`)
      .set(auth(admin))
      .send({
        addressType: 'WAREHOUSE',
        countryCode: 'RW',
        adminArea2: 'Musanze',
        locality: 'Musanze',
        streetLine1: 'Warehouse road',
        isDefault: false,
      });
    expect(address.status).toBe(201);
    expect(address.body.data.addressType).toBe('WAREHOUSE');

    const addressUpdate = await request(app)
      .patch(`/api/v1/customers/${customerId}/addresses/${address.body.data.id}`)
      .set(auth(admin))
      .send({ landmark: 'Near the market', isDefault: true });
    expect(addressUpdate.status).toBe(200);
    expect(addressUpdate.body.data.landmark).toBe('Near the market');
    expect(addressUpdate.body.data.isDefault).toBe(true);

    const deactivated = await request(app)
      .post(`/api/v1/customers/${customerId}/deactivate`)
      .set(auth(admin));
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data.status).toBe('INACTIVE');

    const activated = await request(app)
      .post(`/api/v1/customers/${customerId}/activate`)
      .set(auth(admin));
    expect(activated.status).toBe(200);
    expect(activated.body.data.status).toBe('ACTIVE');

    const removedContact = await request(app)
      .delete(`/api/v1/customers/${customerId}/contacts/${contact.body.data.id}`)
      .set(auth(admin));
    expect(removedContact.status).toBe(200);

    const removedAddress = await request(app)
      .delete(`/api/v1/customers/${customerId}/addresses/${address.body.data.id}`)
      .set(auth(admin));
    expect(removedAddress.status).toBe(200);

    const afterRemove = await request(app).get(`/api/v1/customers/${customerId}`).set(auth(admin));
    expect(
      afterRemove.body.data.contacts.every(
        (row: { id: string }) => row.id !== contact.body.data.id,
      ),
    ).toBe(true);
    expect(
      afterRemove.body.data.addresses.every(
        (row: { id: string }) => row.id !== address.body.data.id,
      ),
    ).toBe(true);

    const archived = await request(app).delete(`/api/v1/customers/${customerId}`).set(auth(admin));
    expect(archived.status).toBe(200);
    expect(archived.body.data.archived).toBe(true);

    const missing = await request(app).get(`/api/v1/customers/${customerId}`).set(auth(admin));
    expect(missing.status).toBe(404);
  });

  it('rejects invalid payloads and duplicate business names', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();
    const name = `Duplicate Traders ${stamp}`;

    const invalid = await request(app).post('/api/v1/customers').set(auth(admin)).send({
      name: 'A',
      email: 'not-an-email',
      phoneE164: '0788123456',
      countryCode: 'RW',
    });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    const first = await request(app)
      .post('/api/v1/customers')
      .set(auth(admin))
      .send({ name, countryCode: 'RW', taxId: `TIN-DUP-${stamp}` });
    expect(first.status).toBe(201);

    const duplicateName = await request(app)
      .post('/api/v1/customers')
      .set(auth(admin))
      .send({ name, countryCode: 'RW' });
    expect(duplicateName.status).toBe(409);

    const duplicateTax = await request(app)
      .post('/api/v1/customers')
      .set(auth(admin))
      .send({
        name: `${name} Two`,
        countryCode: 'RW',
        taxId: `TIN-DUP-${stamp}`,
      });
    expect(duplicateTax.status).toBe(409);
  });

  it('paginates, filters, and sorts the customer list', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();

    for (const city of ['Huye', 'Rubavu']) {
      const created = await request(app)
        .post('/api/v1/customers')
        .set(auth(admin))
        .send({
          name: `Filter Co ${city} ${stamp}`,
          countryCode: 'RW',
          city,
          customerType: city === 'Huye' ? 'NGO' : 'BUSINESS',
        });
      expect(created.status).toBe(201);
    }

    const page = await request(app)
      .get('/api/v1/customers?q=Filter%20Co&page=1&pageSize=1&sort=name&order=asc')
      .set(auth(admin));
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta.total).toBeGreaterThanOrEqual(2);
    expect(page.body.meta.pageSize).toBe(1);

    const filtered = await request(app)
      .get(`/api/v1/customers?q=Filter%20Co%20${stamp}&customerType=NGO`)
      .set(auth(admin));
    expect(filtered.status).toBe(200);
    expect(
      filtered.body.data.every((row: { customerType: string }) => row.customerType === 'NGO'),
    ).toBe(true);
    expect(filtered.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('enforces permissions and unauthenticated access', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const operatorId = await defaultOperatorId();
    const stamp = Date.now();
    const password = 'StaffPass!234';

    const created = await request(app)
      .post('/api/v1/customers')
      .set(auth(admin))
      .send({ name: `Perm Customer ${stamp}`, countryCode: 'RW' });
    expect(created.status).toBe(201);

    const unauthenticated = await request(app).get('/api/v1/customers');
    expect(unauthenticated.status).toBe(401);

    await createOrgUser({
      email: `finance.${stamp}@example.com`,
      password,
      role: 'FINANCE_OFFICER',
      organizationId: operatorId,
    });
    const financeToken = await login(`finance.${stamp}@example.com`, password);
    const financeList = await request(app).get('/api/v1/customers').set(auth(financeToken));
    expect(financeList.status).toBe(200);

    const financeCreate = await request(app)
      .post('/api/v1/customers')
      .set(auth(financeToken))
      .send({ name: `Should fail ${stamp}`, countryCode: 'RW' });
    expect(financeCreate.status).toBe(403);

    const financeUpdate = await request(app)
      .patch(`/api/v1/customers/${created.body.data.id}`)
      .set(auth(financeToken))
      .send({ notes: 'nope' });
    expect(financeUpdate.status).toBe(403);

    await createOrgUser({
      email: `driver.${stamp}@example.com`,
      password,
      role: 'DRIVER',
      organizationId: operatorId,
    });
    const driverToken = await login(`driver.${stamp}@example.com`, password);
    const driverList = await request(app).get('/api/v1/customers').set(auth(driverToken));
    expect(driverList.status).toBe(403);

    await createOrgUser({
      email: `logistics.${stamp}@example.com`,
      password,
      role: 'LOGISTICS_MANAGER',
      organizationId: operatorId,
    });
    const logisticsToken = await login(`logistics.${stamp}@example.com`, password);
    const logisticsCreate = await request(app)
      .post('/api/v1/customers')
      .set(auth(logisticsToken))
      .send({ name: `Logistics Customer ${stamp}`, countryCode: 'RW' });
    expect(logisticsCreate.status).toBe(201);

    const logisticsDelete = await request(app)
      .delete(`/api/v1/customers/${logisticsCreate.body.data.id}`)
      .set(auth(logisticsToken));
    expect(logisticsDelete.status).toBe(403);
  });

  it('keeps customers isolated across organizations', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();
    const password = 'OperatorPass!234';

    const otherOperator = await createOperatorOrganization(`Western Operator ${stamp}`);
    await createOrgUser({
      email: `west.admin.${stamp}@example.com`,
      password,
      role: 'COMPANY_ADMIN',
      organizationId: otherOperator.id,
    });
    const otherToken = await login(`west.admin.${stamp}@example.com`, password);

    const foreign = await request(app)
      .post('/api/v1/customers')
      .set(auth(otherToken))
      .send({ name: `Western Shipper ${stamp}`, countryCode: 'RW' });
    expect(foreign.status).toBe(201);

    const operatorId = await defaultOperatorId();
    await createOrgUser({
      email: `east.admin.${stamp}@example.com`,
      password,
      role: 'COMPANY_ADMIN',
      organizationId: operatorId,
    });
    const localToken = await login(`east.admin.${stamp}@example.com`, password);

    const leaked = await request(app)
      .get(`/api/v1/customers/${foreign.body.data.id}`)
      .set(auth(localToken));
    expect(leaked.status).toBe(404);

    const leakedUpdate = await request(app)
      .patch(`/api/v1/customers/${foreign.body.data.id}`)
      .set(auth(localToken))
      .send({ notes: 'cross tenant' });
    expect([403, 404]).toContain(leakedUpdate.status);

    const list = await request(app).get('/api/v1/customers').set(auth(localToken));
    expect(list.status).toBe(200);
    expect(list.body.data.some((row: { id: string }) => row.id === foreign.body.data.id)).toBe(
      false,
    );

    const portal = await createCustomerUser({
      email: `portal.iso.${stamp}@example.com`,
      password,
    });
    const portalToken = await login(`portal.iso.${stamp}@example.com`, password);
    const portalCreate = await request(app)
      .post('/api/v1/customers')
      .set(auth(portalToken))
      .send({ name: 'Should fail', countryCode: 'RW' });
    expect(portalCreate.status).toBe(403);

    const portalOther = await request(app)
      .get(`/api/v1/customers/${foreign.body.data.id}`)
      .set(auth(portalToken));
    expect([403, 404]).toContain(portalOther.status);

    const portalOwn = await request(app)
      .get(`/api/v1/customers/${portal.organizationId}`)
      .set(auth(portalToken));
    expect(portalOwn.status).toBe(200);
    expect(portalOwn.body.data.id).toBe(portal.organizationId);

    const listedByAdmin = await request(app).get('/api/v1/customers').set(auth(admin));
    expect(
      listedByAdmin.body.data.some((row: { id: string }) => row.id === foreign.body.data.id),
    ).toBe(true);
  });

  it('writes audit records for customer lifecycle and related records', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();

    const created = await request(app)
      .post('/api/v1/customers')
      .set(auth(admin))
      .send({
        name: `Audit Customer ${stamp}`,
        countryCode: 'RW',
        primaryContact: { firstName: 'Pat', lastName: 'Mugisha' },
      });
    expect(created.status).toBe(201);
    const customerId = created.body.data.id as string;

    await request(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set(auth(admin))
      .send({ notes: 'audited' });
    await request(app).post(`/api/v1/customers/${customerId}/deactivate`).set(auth(admin));
    const extraContact = await request(app)
      .post(`/api/v1/customers/${customerId}/contacts`)
      .set(auth(admin))
      .send({ firstName: 'Sam', lastName: 'Iradukunda' });
    await request(app)
      .patch(`/api/v1/customers/${customerId}/contacts/${extraContact.body.data.id}`)
      .set(auth(admin))
      .send({ jobTitle: 'Ops' });
    await request(app)
      .delete(`/api/v1/customers/${customerId}/contacts/${extraContact.body.data.id}`)
      .set(auth(admin));
    const extraAddress = await request(app)
      .post(`/api/v1/customers/${customerId}/addresses`)
      .set(auth(admin))
      .send({ countryCode: 'RW', streetLine1: 'Audit street', addressType: 'BILLING' });
    await request(app)
      .patch(`/api/v1/customers/${customerId}/addresses/${extraAddress.body.data.id}`)
      .set(auth(admin))
      .send({ locality: 'Kigali' });
    await request(app)
      .delete(`/api/v1/customers/${customerId}/addresses/${extraAddress.body.data.id}`)
      .set(auth(admin));

    const actions = await getPool().query<{ action: string }>(
      `
        SELECT action FROM audit_logs
        WHERE entity_id = $1 OR organization_id = $1
        ORDER BY created_at
      `,
      [customerId],
    );
    const recorded = actions.rows.map((row) => row.action);
    expect(recorded).toEqual(
      expect.arrayContaining([
        'CUSTOMER_CREATED',
        'CUSTOMER_UPDATED',
        'CUSTOMER_DEACTIVATED',
        'CUSTOMER_CONTACT_ADDED',
        'CUSTOMER_CONTACT_UPDATED',
        'CUSTOMER_CONTACT_REMOVED',
        'CUSTOMER_ADDRESS_ADDED',
        'CUSTOMER_ADDRESS_UPDATED',
        'CUSTOMER_ADDRESS_REMOVED',
      ]),
    );
  });
});
