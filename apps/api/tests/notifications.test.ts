import { renderNotificationTemplate } from '@mizigox/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getEnv } from '../src/config/env.js';
import { runMigrations } from '../src/db/migrate.js';
import { closePool, getPool } from '../src/db/pool.js';
import { runSeed } from '../src/db/seed.js';
import { emitNotificationNow } from '../src/modules/notifications/notify.js';
import { overrideEmailProviderForTests } from '../src/modules/notifications/notification.providers.js';
import { processDueDeliveries } from '../src/modules/notifications/notification.queue.js';
import { runNotificationScans } from '../src/modules/notifications/notification.scans.js';
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

async function createShipment(token: string, customerId: string, cargo = 'Notification cargo') {
  const response = await request(app)
    .post('/api/v1/shipments')
    .set(auth(token))
    .send({
      customerOrganizationId: customerId,
      cargoDescription: cargo,
      origin: { countryCode: 'RW', streetLine1: 'Kigali origin' },
      destination: { countryCode: 'RW', streetLine1: 'Musanze destination' },
    });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; reference: string; status: string };
}

describe('notifications and communications', () => {
  beforeAll(async () => {
    const pool = getPool();
    await runMigrations(pool);
    await runSeed(pool);
  });

  afterEach(() => {
    overrideEmailProviderForTests(null);
  });

  afterAll(async () => {
    await closePool();
  });

  it('renders templates with allowlisted variables only', () => {
    const rendered = renderNotificationTemplate(
      'Hello {{customer_name}} {{constructor}} {{shipment_reference}}',
      { customer_name: 'Ada', shipment_reference: 'MX-RW-2026-00001' },
    );
    expect(rendered).toBe('Hello Ada  MX-RW-2026-00001');
  });

  it('creates in-app notifications, counts unread, and marks read/unread/all', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();
    const customer = await createCustomerUser({
      email: `notify.customer.${stamp}@example.com`,
      password: 'Customer-Pass-2026!',
    });
    const shipment = await createShipment(admin, customer.organizationId, `Inbox ${stamp}`);
    const customerToken = await login(
      `notify.customer.${stamp}@example.com`,
      'Customer-Pass-2026!',
    );

    const list = await request(app).get('/api/v1/notifications').set(auth(customerToken));
    expect(list.status).toBe(200);
    const match = (
      list.body.data as Array<{
        id: string;
        title: string;
        relatedReference: string;
        readAt: string | null;
      }>
    ).find((item) => item.relatedReference === shipment.reference);
    expect(match).toBeTruthy();
    expect(match?.readAt).toBeNull();

    const count = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set(auth(customerToken));
    expect(count.status).toBe(200);
    expect(count.body.data.unreadCount).toBeGreaterThan(0);

    const read = await request(app)
      .post(`/api/v1/notifications/${match!.id}/read`)
      .set(auth(customerToken));
    expect(read.status).toBe(200);
    expect(read.body.data.readAt).toBeTruthy();

    const unread = await request(app)
      .post(`/api/v1/notifications/${match!.id}/unread`)
      .set(auth(customerToken));
    expect(unread.status).toBe(200);
    expect(unread.body.data.readAt).toBeNull();

    const all = await request(app).post('/api/v1/notifications/read-all').set(auth(customerToken));
    expect(all.status).toBe(200);
    const after = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set(auth(customerToken));
    expect(after.body.data.unreadCount).toBe(0);
  });

  it('does not send every notification to every user and isolates organizations', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();
    const customer = await createCustomerUser({
      email: `notify.iso.customer.${stamp}@example.com`,
      password: 'Customer-Pass-2026!',
    });
    const otherOrg = await createOperatorOrganization(`Notify Iso ${stamp}`);
    const otherAdmin = await createOrgUser({
      email: `notify.iso.ops.${stamp}@example.com`,
      password: 'Operator-Pass-2026!',
      role: 'COMPANY_ADMIN',
      organizationId: otherOrg.id,
    });
    const shipment = await createShipment(admin, customer.organizationId, `Iso ${stamp}`);
    const customerToken = await login(
      `notify.iso.customer.${stamp}@example.com`,
      'Customer-Pass-2026!',
    );
    const otherToken = await login(`notify.iso.ops.${stamp}@example.com`, 'Operator-Pass-2026!');

    const mine = await request(app).get('/api/v1/notifications').set(auth(customerToken));
    expect(
      (mine.body.data as Array<{ relatedReference: string }>).some(
        (item) => item.relatedReference === shipment.reference,
      ),
    ).toBe(true);

    const theirs = await request(app).get('/api/v1/notifications').set(auth(otherToken));
    expect(
      (theirs.body.data as Array<{ relatedReference: string }>).some(
        (item) => item.relatedReference === shipment.reference,
      ),
    ).toBe(false);

    const otherDeliveries = await request(app)
      .get('/api/v1/notifications/deliveries')
      .set(auth(otherToken));
    expect(otherDeliveries.status).toBe(200);
    expect(
      (otherDeliveries.body.data as Array<{ type: string }>).some(
        (item) => item.type === 'SHIPMENT_CONFIRMED',
      ),
    ).toBe(false);
    void otherAdmin;
  });

  it('enforces notification preferences and keeps account alerts mandatory', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();
    const customer = await createCustomerUser({
      email: `notify.pref.${stamp}@example.com`,
      password: 'Customer-Pass-2026!',
    });
    const token = await login(`notify.pref.${stamp}@example.com`, 'Customer-Pass-2026!');
    const forbiddenPref = await request(app)
      .patch('/api/v1/notifications/preferences')
      .set(auth(token))
      .send({
        preferences: [{ category: 'ACCOUNT', channel: 'EMAIL', enabled: false }],
      });
    expect(forbiddenPref.status).toBe(422);

    const updated = await request(app)
      .patch('/api/v1/notifications/preferences')
      .set(auth(token))
      .send({
        preferences: [{ category: 'SHIPMENT', channel: 'EMAIL', enabled: false }],
      });
    expect(updated.status).toBe(200);
    const shipment = await createShipment(admin, customer.organizationId, `Pref ${stamp}`);
    const deliveries = await getPool().query<{ channel: string }>(
      `
        SELECT d.channel
        FROM notification_deliveries d
        JOIN notifications n ON n.id = d.notification_id
        WHERE n.related_entity_id = $1 AND n.recipient_user_id = $2
      `,
      [shipment.id, customer.userId],
    );
    expect(deliveries.rows.some((row) => row.channel === 'EMAIL')).toBe(false);
    expect(deliveries.rows.some((row) => row.channel === 'IN_APP')).toBe(true);
  });

  it('notifies on shipment status, invoice issue, payment confirmation, and route assignment', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();
    const customer = await createCustomerUser({
      email: `notify.events.${stamp}@example.com`,
      password: 'Customer-Pass-2026!',
    });
    await getPool().query(`UPDATE users SET phone_e164 = $2 WHERE id = $1`, [
      customer.userId,
      `+250788${String(stamp).slice(-6)}`,
    ]);
    const operatorId = (
      await getPool().query<{ id: string }>(
        `SELECT id FROM organizations WHERE type = 'OPERATOR' AND deleted_at IS NULL ORDER BY created_at LIMIT 1`,
      )
    ).rows[0]!.id;
    const shipment = await createShipment(admin, customer.organizationId, `Events ${stamp}`);
    const vehicle = await request(app)
      .post('/api/v1/vehicles')
      .set(auth(admin))
      .send({
        organizationId: operatorId,
        vehicleType: 'VAN',
        registrationNumber: `RAD ${String(stamp).slice(-3)} N`,
        payloadCapacity: 1000,
        status: 'AVAILABLE',
      });
    expect(vehicle.status).toBe(201);
    const driver = await request(app)
      .post('/api/v1/drivers')
      .set(auth(admin))
      .send({
        organizationId: operatorId,
        firstName: 'Jean',
        lastName: `Notify${stamp}`,
        phoneE164: `+250789${String(stamp).slice(-6)}`,
        licenseNumber: `LIC-${stamp}`,
        status: 'AVAILABLE',
      });
    expect(driver.status).toBe(201);
    const route = await request(app)
      .post('/api/v1/routes')
      .set(auth(admin))
      .send({
        organizationId: operatorId,
        shipmentIds: [shipment.id],
        vehicleId: vehicle.body.data.id,
        driverId: driver.body.data.id,
        status: 'PLANNED',
      });
    expect(route.status).toBe(201);

    const ready = await request(app)
      .post(`/api/v1/shipments/${shipment.id}/status`)
      .set(auth(admin))
      .send({ status: 'READY_FOR_PICKUP' });
    expect(ready.status).toBe(200);
    const picked = await request(app)
      .post(`/api/v1/shipments/${shipment.id}/status`)
      .set(auth(admin))
      .send({ status: 'PICKED_UP' });
    expect(picked.status).toBe(200);

    const invoice = await request(app)
      .post('/api/v1/invoices')
      .set(auth(admin))
      .send({
        customerOrganizationId: customer.organizationId,
        items: [{ description: 'Freight', quantity: '1', unitPrice: '10000.00' }],
        issue: true,
      });
    expect(invoice.status).toBe(201);
    const payment = await request(app).post('/api/v1/payments').set(auth(admin)).send({
      invoiceId: invoice.body.data.id,
      amount: invoice.body.data.totalAmount,
      method: 'CASH',
    });
    expect(payment.status).toBe(201);
    const confirmed = await request(app)
      .post(`/api/v1/payments/${payment.body.data.id}/confirm`)
      .set(auth(admin));
    expect(confirmed.status).toBe(200);

    const types = await getPool().query<{ type: string }>(
      `SELECT DISTINCT type FROM notifications WHERE recipient_user_id = $1`,
      [customer.userId],
    );
    const set = new Set(types.rows.map((row) => row.type));
    expect(set.has('SHIPMENT_CONFIRMED')).toBe(true);
    expect(set.has('SHIPMENT_PICKED_UP')).toBe(true);
    expect(set.has('INVOICE_ISSUED')).toBe(true);
    expect(set.has('PAYMENT_RECEIVED') || set.has('INVOICE_PAID')).toBe(true);
  });

  it('delivers email and SMS through log providers and records failures without faking success', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();
    const customer = await createCustomerUser({
      email: `notify.deliver.${stamp}@example.com`,
      password: 'Customer-Pass-2026!',
    });
    await getPool().query(`UPDATE users SET phone_e164 = $2 WHERE id = $1`, [
      customer.userId,
      `+250787${String(stamp).slice(-6)}`,
    ]);
    const shipment = await createShipment(admin, customer.organizationId, `Deliver ${stamp}`);
    await request(app)
      .post(`/api/v1/shipments/${shipment.id}/status`)
      .set(auth(admin))
      .send({ status: 'READY_FOR_PICKUP' });
    await request(app)
      .post(`/api/v1/shipments/${shipment.id}/status`)
      .set(auth(admin))
      .send({ status: 'PICKED_UP' });

    await processDueDeliveries(getPool(), 200);
    const sent = await getPool().query<{
      channel: string;
      status: string;
      provider: string | null;
    }>(
      `
        SELECT d.channel, d.status, d.provider
        FROM notification_deliveries d
        JOIN notifications n ON n.id = d.notification_id
        WHERE n.related_entity_id = $1 AND n.recipient_user_id = $2
      `,
      [shipment.id, customer.userId],
    );
    expect(sent.rows.some((row) => row.channel === 'IN_APP' && row.status === 'SENT')).toBe(true);
    expect(
      sent.rows.some(
        (row) => row.channel === 'EMAIL' && row.status === 'SENT' && row.provider === 'log',
      ),
    ).toBe(true);
    expect(
      sent.rows.some(
        (row) => row.channel === 'SMS' && row.status === 'SENT' && row.provider === 'log',
      ),
    ).toBe(true);

    overrideEmailProviderForTests({
      name: 'fail',
      async send() {
        throw new Error('gateway rejected');
      },
    });
    await emitNotificationNow(getPool(), {
      type: 'INVOICE_ISSUED',
      organizationId: (
        await getPool().query<{ id: string }>(
          `SELECT id FROM organizations WHERE type = 'OPERATOR' ORDER BY created_at LIMIT 1`,
        )
      ).rows[0]!.id,
      customerOrganizationId: customer.organizationId,
      relatedEntityType: 'invoice',
      relatedReference: `MX-INV-FAIL-${stamp}`,
      idempotencySuffix: `fail-${stamp}`,
      variables: { invoice_number: `MX-INV-FAIL-${stamp}`, amount: '1.00', currency: 'RWF' },
    });
    await processDueDeliveries(getPool(), 50);
    const failed = await getPool().query<{
      status: string;
      last_error: string | null;
      provider: string | null;
    }>(
      `
        SELECT d.status, d.last_error, d.provider
        FROM notification_deliveries d
        JOIN notifications n ON n.id = d.notification_id
        WHERE n.related_reference = $1 AND d.channel = 'EMAIL'
      `,
      [`MX-INV-FAIL-${stamp}`],
    );
    expect(failed.rows[0]?.status).toBe('FAILED');
    expect(failed.rows[0]?.last_error).toContain('gateway rejected');
    expect(failed.rows[0]?.provider).not.toBe('fake');
  });

  it('prevents duplicate notifications and stores push device tokens without sending live push', async () => {
    const env = getEnv();
    const adminToken = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();
    const customer = await createCustomerUser({
      email: `notify.dup.${stamp}@example.com`,
      password: 'Customer-Pass-2026!',
    });
    const operatorId = (
      await getPool().query<{ id: string }>(
        `SELECT id FROM organizations WHERE type = 'OPERATOR' ORDER BY created_at LIMIT 1`,
      )
    ).rows[0]!.id;
    const event = {
      type: 'SHIPMENT_DELIVERED' as const,
      organizationId: operatorId,
      customerOrganizationId: customer.organizationId,
      relatedEntityType: 'shipment',
      relatedEntityId: '11111111-1111-4111-8111-111111111111',
      relatedReference: `MX-RW-DUP-${stamp}`,
      variables: { shipment_reference: `MX-RW-DUP-${stamp}`, customer_name: 'Ada' },
    };
    const first = await emitNotificationNow(getPool(), event);
    const second = await emitNotificationNow(getPool(), event);
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);

    const token = await login(`notify.dup.${stamp}@example.com`, 'Customer-Pass-2026!');
    const device = await request(app)
      .post('/api/v1/notifications/devices')
      .set(auth(token))
      .send({ platform: 'ANDROID', token: `push-token-${stamp}-abcdef`, deviceName: 'Test phone' });
    expect(device.status).toBe(201);
    await request(app)
      .patch('/api/v1/notifications/preferences')
      .set(auth(token))
      .send({ preferences: [{ category: 'TRACKING', channel: 'PUSH', enabled: true }] });
    await emitNotificationNow(getPool(), {
      type: 'TRACKING_STARTED',
      organizationId: operatorId,
      customerOrganizationId: customer.organizationId,
      relatedEntityType: 'shipment',
      relatedEntityId: '22222222-2222-4222-8222-222222222222',
      relatedReference: `MX-RW-PUSH-${stamp}`,
      idempotencySuffix: `push-${stamp}`,
      variables: { shipment_reference: `MX-RW-PUSH-${stamp}` },
    });
    await processDueDeliveries(getPool(), 50);
    const push = await getPool().query<{ status: string; last_error: string | null }>(
      `
        SELECT d.status, d.last_error
        FROM notification_deliveries d
        JOIN notifications n ON n.id = d.notification_id
        WHERE n.related_reference = $1 AND d.channel = 'PUSH'
      `,
      [`MX-RW-PUSH-${stamp}`],
    );
    expect(push.rows[0]?.status).toBe('FAILED');
    expect(push.rows[0]?.last_error?.toLowerCase()).toContain('not configured');
    void adminToken;
  });

  it('scans document expiry, enforces delivery permissions, and rate-limits retries', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const stamp = Date.now();
    const operatorId = (
      await getPool().query<{ id: string }>(
        `SELECT id FROM organizations WHERE type = 'OPERATOR' ORDER BY created_at LIMIT 1`,
      )
    ).rows[0]!.id;
    await createOrgUser({
      email: `notify.ops.${stamp}@example.com`,
      password: 'Operator-Pass-2026!',
      role: 'LOGISTICS_MANAGER',
      organizationId: operatorId,
    });
    const vehicle = await request(app)
      .post('/api/v1/vehicles')
      .set(auth(admin))
      .send({
        organizationId: operatorId,
        vehicleType: 'VAN',
        registrationNumber: `RAE ${String(stamp).slice(-3)} X`,
        payloadCapacity: 800,
        status: 'AVAILABLE',
      });
    expect(vehicle.status).toBe(201);
    const expiry = new Date();
    expiry.setUTCDate(expiry.getUTCDate() + 5);
    const doc = await request(app)
      .post(`/api/v1/vehicles/${vehicle.body.data.id}/documents`)
      .set(auth(admin))
      .send({
        documentType: 'INSURANCE',
        documentNumber: `INS-${stamp}`,
        expiresAt: expiry.toISOString().slice(0, 10),
      });
    expect(doc.status).toBe(201);
    await runNotificationScans(getPool());
    const expiryNotes = await getPool().query<{ type: string }>(
      `SELECT type FROM notifications WHERE related_entity_id = $1 AND type = 'VEHICLE_DOCUMENT_EXPIRING'`,
      [vehicle.body.data.id],
    );
    expect(expiryNotes.rows.length).toBeGreaterThan(0);

    const customer = await createCustomerUser({
      email: `notify.perm.${stamp}@example.com`,
      password: 'Customer-Pass-2026!',
    });
    const customerToken = await login(`notify.perm.${stamp}@example.com`, 'Customer-Pass-2026!');
    const denied = await request(app)
      .get('/api/v1/notifications/deliveries')
      .set(auth(customerToken));
    expect(denied.status).toBe(403);

    const delivery = await getPool().query<{ id: string }>(
      `SELECT id FROM notification_deliveries ORDER BY created_at DESC LIMIT 1`,
    );
    let lastStatus = 200;
    for (let index = 0; index < 12; index += 1) {
      const retry = await request(app)
        .post(`/api/v1/notifications/deliveries/${delivery.rows[0]!.id}/retry`)
        .set(auth(admin));
      lastStatus = retry.status;
    }
    expect(lastStatus).toBe(429);
    void customer;
  });
});
