import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { getEnv } from '../src/config/env.js';
import { runMigrations } from '../src/db/migrate.js';
import { closePool, getPool } from '../src/db/pool.js';
import { runSeed } from '../src/db/seed.js';
import { lineAmounts } from '../src/lib/money.js';
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

async function createCustomer(token: string, name: string, operatorOrganizationId?: string) {
  const response = await request(app)
    .post('/api/v1/customers')
    .set(auth(token))
    .send({ name, countryCode: 'RW', city: 'Kigali', operatorOrganizationId });
  expect(response.status).toBe(201);
  return response.body.data as { id: string; name: string };
}

async function createIssuedInvoice(
  token: string,
  customerId: string,
  extras?: {
    unitPrice?: string;
    taxRatePercent?: string;
    discountAmount?: string;
    quantity?: string;
  },
) {
  const response = await request(app)
    .post('/api/v1/invoices')
    .set(auth(token))
    .send({
      customerOrganizationId: customerId,
      currencyCode: 'RWF',
      items: [
        {
          description: 'Freight transport',
          quantity: extras?.quantity ?? '1',
          unitPrice: extras?.unitPrice ?? '100000.00',
          discountAmount: extras?.discountAmount ?? '0.00',
          taxRatePercent: extras?.taxRatePercent ?? '0.00',
        },
      ],
      issue: true,
    });
  expect(response.status).toBe(201);
  return response.body.data;
}

describe('billing invoices and payments', () => {
  beforeAll(async () => {
    const pool = getPool();
    await runMigrations(pool);
    await runSeed(pool);
  });

  afterAll(async () => {
    await closePool();
  });

  it('computes line amounts with integer minor units', () => {
    expect(
      lineAmounts({
        quantity: '1',
        unitPrice: '100000.00',
        discountAmount: '0.00',
        taxRatePercent: '18.00',
      }),
    ).toEqual({
      quantity: '1',
      unitPrice: '100000.00',
      discountAmount: '0.00',
      taxRatePercent: '18.00',
      taxAmount: '18000.00',
      lineSubtotal: '100000.00',
      lineTotal: '118000.00',
    });
    expect(
      lineAmounts({
        quantity: '10.125',
        unitPrice: '100.00',
        discountAmount: '12.50',
        taxRatePercent: '18.00',
      }).lineTotal,
    ).toBe('1180.00');
  });

  it('creates invoices with backend numbers, tax, discounts, and issue', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const customer = await createCustomer(admin, `Billing ${Date.now()}`);
    const draft = await request(app)
      .post('/api/v1/invoices')
      .set(auth(admin))
      .send({
        customerOrganizationId: customer.id,
        items: [
          {
            description: 'Delivery',
            quantity: '2',
            unitPrice: '50000.00',
            discountAmount: '5000.00',
            taxRatePercent: '18.00',
          },
        ],
      });
    expect(draft.status).toBe(201);
    expect(draft.body.data.number).toMatch(/^MX-INV-\d{6}$/);
    expect(draft.body.data.status).toBe('DRAFT');
    expect(draft.body.data.subtotal).toBe('95000.00');
    expect(draft.body.data.discountAmount).toBe('5000.00');
    expect(draft.body.data.taxAmount).toBe('17100.00');
    expect(draft.body.data.totalAmount).toBe('112100.00');
    expect(draft.body.data.amountDue).toBe('112100.00');

    const issued = await request(app)
      .post(`/api/v1/invoices/${draft.body.data.id}/issue`)
      .set(auth(admin));
    expect(issued.status).toBe(200);
    expect(issued.body.data.status).toBe('ISSUED');
    expect(issued.body.data.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(issued.body.data.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const second = await request(app)
      .post('/api/v1/invoices')
      .set(auth(admin))
      .send({
        customerOrganizationId: customer.id,
        items: [{ description: 'Handling', quantity: '1', unitPrice: '1000.00' }],
        issue: true,
      });
    expect(second.status).toBe(201);
    expect(second.body.data.number).not.toBe(draft.body.data.number);
    expect(second.body.data.status).toBe('ISSUED');
  });

  it('rejects client-supplied totals and invalid status transitions', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const customer = await createCustomer(admin, `Totals ${Date.now()}`);
    const created = await request(app)
      .post('/api/v1/invoices')
      .set(auth(admin))
      .send({
        customerOrganizationId: customer.id,
        totalAmount: '1.00',
        amountDue: '1.00',
        status: 'PAID',
        number: 'FAKE-1',
        items: [{ description: 'Pickup', quantity: '1', unitPrice: '25000.00' }],
      });
    expect(created.status).toBe(201);
    expect(created.body.data.number).toMatch(/^MX-INV-\d{6}$/);
    expect(created.body.data.status).toBe('DRAFT');
    expect(created.body.data.totalAmount).toBe('25000.00');

    await request(app).post(`/api/v1/invoices/${created.body.data.id}/issue`).set(auth(admin));
    const reissue = await request(app)
      .post(`/api/v1/invoices/${created.body.data.id}/issue`)
      .set(auth(admin));
    expect(reissue.status).toBe(422);
    expect(reissue.body.error.code).toBe('INVOICE_INVALID_TRANSITION');
  });

  it('applies partial and full confirmed payments to invoice balances', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const customer = await createCustomer(admin, `Pay ${Date.now()}`);
    const invoice = await createIssuedInvoice(admin, customer.id);
    expect(invoice.totalAmount).toBe('100000.00');

    const pending = await request(app)
      .post('/api/v1/payments')
      .set(auth(admin))
      .send({
        invoiceId: invoice.id,
        amount: '60000.00',
        method: 'CASH',
        notes: 'Cash received at counter',
        status: 'SUCCESSFUL',
        idempotencyKey: `pay-${invoice.id}-partial`,
      });
    expect(pending.status).toBe(201);
    expect(pending.body.data.reference).toMatch(/^MX-PAY-\d{6}$/);
    expect(pending.body.data.status).toBe('PENDING');

    const stillOpen = await request(app).get(`/api/v1/invoices/${invoice.id}`).set(auth(admin));
    expect(stillOpen.body.data.amountPaid).toBe('0.00');
    expect(stillOpen.body.data.status).toBe('ISSUED');

    const confirmed = await request(app)
      .post(`/api/v1/payments/${pending.body.data.id}/confirm`)
      .set(auth(admin))
      .send({});
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe('SUCCESSFUL');

    const partial = await request(app).get(`/api/v1/invoices/${invoice.id}`).set(auth(admin));
    expect(partial.body.data.amountPaid).toBe('60000.00');
    expect(partial.body.data.amountDue).toBe('40000.00');
    expect(partial.body.data.status).toBe('PARTIALLY_PAID');

    const rest = await request(app)
      .post('/api/v1/payments')
      .set(auth(admin))
      .send({
        invoiceId: invoice.id,
        amount: '40000.00',
        method: 'BANK_TRANSFER',
        providerReference: 'BNR-TEST-40000',
        idempotencyKey: `pay-${invoice.id}-rest`,
      });
    expect(rest.status).toBe(201);
    await request(app).post(`/api/v1/payments/${rest.body.data.id}/confirm`).set(auth(admin));

    const paid = await request(app).get(`/api/v1/invoices/${invoice.id}`).set(auth(admin));
    expect(paid.body.data.amountPaid).toBe('100000.00');
    expect(paid.body.data.amountDue).toBe('0.00');
    expect(paid.body.data.status).toBe('PAID');
  });

  it('protects against duplicate payments, overpayment, and failed payments', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const customer = await createCustomer(admin, `Dup ${Date.now()}`);
    const invoice = await createIssuedInvoice(admin, customer.id, { unitPrice: '80000.00' });
    const key = `dup-${invoice.id}`;
    const first = await request(app)
      .post('/api/v1/payments')
      .set(auth(admin))
      .send({ invoiceId: invoice.id, amount: '20000.00', method: 'CASH', idempotencyKey: key });
    const second = await request(app)
      .post('/api/v1/payments')
      .set(auth(admin))
      .send({ invoiceId: invoice.id, amount: '20000.00', method: 'CASH', idempotencyKey: key });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);

    const overpay = await request(app)
      .post('/api/v1/payments')
      .set(auth(admin))
      .send({ invoiceId: invoice.id, amount: '90000.00', method: 'CASH' });
    expect(overpay.status).toBe(422);

    const failed = await request(app).post('/api/v1/payments').set(auth(admin)).send({
      invoiceId: invoice.id,
      amount: '10000.00',
      method: 'MOBILE_MONEY',
      providerReference: 'MOMO-FAIL',
    });
    expect(failed.status).toBe(201);
    const marked = await request(app)
      .post(`/api/v1/payments/${failed.body.data.id}/fail`)
      .set(auth(admin));
    expect(marked.body.data.status).toBe('FAILED');
    const invoiceAfterFail = await request(app)
      .get(`/api/v1/invoices/${invoice.id}`)
      .set(auth(admin));
    expect(invoiceAfterFail.body.data.amountPaid).toBe('0.00');
    expect(invoiceAfterFail.body.data.status).toBe('ISSUED');
  });

  it('cancels invoices, records refunds, and keeps financial history', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const customer = await createCustomer(admin, `Cancel ${Date.now()}`);
    const invoice = await createIssuedInvoice(admin, customer.id, { unitPrice: '15000.00' });
    const payment = await request(app)
      .post('/api/v1/payments')
      .set(auth(admin))
      .send({ invoiceId: invoice.id, amount: '15000.00', method: 'CASH' });
    await request(app).post(`/api/v1/payments/${payment.body.data.id}/confirm`).set(auth(admin));

    const blocked = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/cancel`)
      .set(auth(admin))
      .send({});
    expect(blocked.status).toBe(422);

    const refunded = await request(app)
      .post(`/api/v1/payments/${payment.body.data.id}/refund`)
      .set(auth(admin))
      .send({ reason: 'Customer cancelled the shipment' });
    expect(refunded.status).toBe(200);
    expect(refunded.body.data.status).toBe('REFUNDED');

    const afterRefund = await request(app).get(`/api/v1/invoices/${invoice.id}`).set(auth(admin));
    expect(afterRefund.body.data.status).toBe('ISSUED');
    expect(afterRefund.body.data.amountPaid).toBe('0.00');

    const cancelled = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/cancel`)
      .set(auth(admin))
      .send({});
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');

    const stillThere = await request(app)
      .get(`/api/v1/payments/${payment.body.data.id}`)
      .set(auth(admin));
    expect(stillThere.body.data.status).toBe('REFUNDED');
  });

  it('lists, filters, sorts, paginates, and audits invoices', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const customer = await createCustomer(admin, `List ${Date.now()}`);
    await createIssuedInvoice(admin, customer.id, { unitPrice: '3000.00' });
    await createIssuedInvoice(admin, customer.id, { unitPrice: '7000.00' });

    const listed = await request(app)
      .get(
        `/api/v1/invoices?customerId=${customer.id}&status=ISSUED&sort=total&order=asc&page=1&pageSize=1`,
      )
      .set(auth(admin));
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.meta.total).toBeGreaterThanOrEqual(2);
    expect(listed.body.data[0].totalAmount).toBe('3000.00');

    const document = await request(app)
      .get(`/api/v1/invoices/${listed.body.data[0].id}/document`)
      .set(auth(admin));
    expect(document.status).toBe(200);
    expect(document.body.data.invoiceNumber).toMatch(/^MX-INV-\d{6}$/);
    expect(JSON.stringify(document.body.data)).not.toContain(listed.body.data[0].id);

    const activity = await request(app)
      .get(`/api/v1/invoices/${listed.body.data[0].id}/activity`)
      .set(auth(admin));
    expect(activity.status).toBe(200);
    expect(
      activity.body.data.some((row: { action: string }) => row.action === 'INVOICE_ISSUED'),
    ).toBe(true);

    const balance = await request(app)
      .get(`/api/v1/customers/${customer.id}/balance`)
      .set(auth(admin));
    expect(balance.status).toBe(200);
    expect(Number(balance.body.data.totalInvoiced)).toBeGreaterThan(0);
  });

  it('enforces permissions and organization isolation', async () => {
    const env = getEnv();
    const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
    const customer = await createCustomer(admin, `Iso ${Date.now()}`);
    const invoice = await createIssuedInvoice(admin, customer.id, { unitPrice: '5000.00' });

    const otherOrg = await createOperatorOrganization(`Other ${Date.now()}`);
    const otherEmail = `finance-${Date.now()}@example.com`;
    await createOrgUser({
      email: otherEmail,
      password: 'ValidPassword123',
      role: 'COMPANY_ADMIN',
      organizationId: otherOrg.id,
    });
    const otherLogin = await login(otherEmail, 'ValidPassword123');

    const isolated = await request(app).get(`/api/v1/invoices/${invoice.id}`).set(auth(otherLogin));
    expect([403, 404]).toContain(isolated.status);

    const isolatedPay = await request(app)
      .post('/api/v1/payments')
      .set(auth(otherLogin))
      .send({ invoiceId: invoice.id, amount: '1000.00', method: 'CASH' });
    expect([403, 404, 422]).toContain(isolatedPay.status);

    const driverOrg = await createOperatorOrganization(`Driver org ${Date.now()}`);
    const driverEmail = `driver-${Date.now()}@example.com`;
    await createOrgUser({
      email: driverEmail,
      password: 'ValidPassword123',
      role: 'DRIVER',
      organizationId: driverOrg.id,
    });
    const driverToken = await login(driverEmail, 'ValidPassword123');
    const driverDenied = await request(app).get('/api/v1/invoices').set(auth(driverToken));
    expect(driverDenied.status).toBe(403);

    const portalEmail = `cust-${Date.now()}@example.com`;
    await createCustomerUser({
      email: portalEmail,
      password: 'ValidPassword123',
    });
    const portalToken = await login(portalEmail, 'ValidPassword123');
    const portalCreate = await request(app)
      .post('/api/v1/invoices')
      .set(auth(portalToken))
      .send({
        customerOrganizationId: customer.id,
        items: [{ description: 'Nope', quantity: '1', unitPrice: '10.00' }],
      });
    expect(portalCreate.status).toBe(403);

    const otherInvoice = await request(app)
      .get(`/api/v1/invoices/${invoice.id}`)
      .set(auth(portalToken));
    expect([403, 404]).toContain(otherInvoice.status);

    const webhook = await request(app).post('/api/v1/webhooks/payments/MANUAL').send({
      eventId: 'evt-not-signed-123',
      paymentReference: 'MX-PAY-000001',
      status: 'SUCCESSFUL',
    });
    expect(webhook.status).toBe(422);
  });
});
