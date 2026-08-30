import {
  canTransitionInvoice,
  isOpenReceivable,
  type AdjustmentPayload,
  type BillableServicePayload,
  type CustomerBalancePayload,
  type CustomerPricePayload,
  type FinanceSummaryPayload,
  type InvoiceDocumentPayload,
  type InvoicePayload,
  type InvoiceStatus,
  type PaymentPayload,
  type PaymentTerms,
  type ServiceUnit,
  type TaxRatePayload,
} from '@mizigox/shared';
import type { Pool, PoolClient } from 'pg';
import { writeAudit } from '../../lib/audit.js';
import { AppError, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import {
  addMoney,
  compareMoney,
  isZeroMoney,
  lineAmounts,
  minorToMoney,
  moneyToMinor,
  normalizeMoney,
  subtractMoney,
} from '../../lib/money.js';
import type { AuthContext } from '../auth/auth.types.js';
import { assertOperatorAccess } from '../fleet/tenant.js';
import { resolvePaymentProvider } from './payment-providers.js';
import type { z } from 'zod';
import type {
  createAdjustmentSchema,
  createInvoiceSchema,
  createPaymentSchema,
  createServiceSchema,
  customerPriceSchema,
  invoiceItemInputSchema,
  listInvoicesQuerySchema,
  listPaymentsQuerySchema,
  updateInvoiceSchema,
} from './billing.schemas.js';

type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
type ItemInput = z.infer<typeof invoiceItemInputSchema>;
type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
type AdjustmentInput = z.infer<typeof createAdjustmentSchema>;
type ServiceInput = z.infer<typeof createServiceSchema>;
type PriceInput = z.infer<typeof customerPriceSchema>;

const INVOICE_SORT = {
  number: 'i.number',
  issueDate: 'i.issue_date',
  dueDate: 'i.due_date',
  total: 'i.total_amount',
  status: 'i.status',
  customerName: 'c.name',
  createdAt: 'i.created_at',
} as const;

const PAYMENT_SORT = {
  createdAt: 'p.created_at',
  paidAt: 'p.paid_at',
  amount: 'p.amount',
  status: 'p.status',
  reference: 'p.reference',
} as const;

const DEFAULT_SERVICES = [
  { code: 'FREIGHT', name: 'Freight transport', type: 'FREIGHT', unit: 'TRIP' },
  { code: 'DELIVERY', name: 'Delivery', type: 'DELIVERY', unit: 'SHIPMENT' },
  { code: 'PICKUP', name: 'Pickup', type: 'PICKUP', unit: 'SHIPMENT' },
  { code: 'STORAGE', name: 'Storage', type: 'STORAGE', unit: 'DAY' },
  { code: 'HANDLING', name: 'Handling', type: 'HANDLING', unit: 'PACKAGE' },
  { code: 'OTHER', name: 'Other logistics service', type: 'OTHER', unit: 'OTHER' },
] as const;

export async function listTaxRates(pool: Pool, countryCode?: string) {
  const params: unknown[] = [];
  const where = ['1=1'];
  if (countryCode) {
    params.push(countryCode);
    where.push(`country_code = $${params.length}`);
  }
  const result = await pool.query(
    `
      SELECT id, name, code, rate_percent::text, country_code, currency_code, active
      FROM tax_rates
      WHERE ${where.join(' AND ')}
      ORDER BY country_code, name
    `,
    params,
  );
  return result.rows.map(mapTaxRate);
}

export async function createTaxRate(
  pool: Pool,
  actor: AuthContext,
  input: {
    name: string;
    code: string;
    ratePercent: string;
    countryCode: string;
    currencyCode?: string;
    active?: boolean;
  },
) {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot configure taxes');
  }
  const rate = normalizeMoney(input.ratePercent, 'Tax rate');
  const created = await pool.query<{ id: string }>(
    `
      INSERT INTO tax_rates (name, code, rate_percent, country_code, currency_code, active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `,
    [
      input.name,
      input.code.toUpperCase(),
      rate,
      input.countryCode.toUpperCase(),
      input.currencyCode ?? null,
      input.active ?? true,
    ],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: actor.orgId,
    action: 'TAX_RATE_CREATED',
    entityType: 'tax_rate',
    entityId: created.rows[0]!.id,
    after: { code: input.code, ratePercent: rate, countryCode: input.countryCode },
  });
  const rates = await listTaxRates(pool, input.countryCode.toUpperCase());
  return (
    rates.find((tax) => tax.id === created.rows[0]!.id) ??
    (await listTaxRates(pool)).find((tax) => tax.id === created.rows[0]!.id)!
  );
}

export async function listServices(pool: Pool, actor: AuthContext, organizationId?: string) {
  const orgId = await resolveBillingOrganization(pool, actor, organizationId);
  await ensureDefaultServices(pool, orgId);
  const result = await pool.query(
    `
      SELECT s.id, s.organization_id, s.code, s.name, s.description, s.service_type, s.unit,
             s.default_price::text, s.currency_code, s.tax_rate_id, t.rate_percent::text AS tax_rate_percent,
             s.active
      FROM billable_services s
      LEFT JOIN tax_rates t ON t.id = s.tax_rate_id
      WHERE s.organization_id = $1
      ORDER BY s.name
    `,
    [orgId],
  );
  return result.rows.map(mapService);
}

export async function createService(pool: Pool, actor: AuthContext, input: ServiceInput) {
  const organizationId = await resolveBillingOrganization(pool, actor, input.organizationId);
  const created = await pool.query<{ id: string }>(
    `
      INSERT INTO billable_services (
        organization_id, code, name, description, service_type, unit,
        default_price, currency_code, tax_rate_id, active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `,
    [
      organizationId,
      input.code.toUpperCase(),
      input.name,
      input.description ?? null,
      input.serviceType,
      input.unit,
      input.defaultPrice ? normalizeMoney(input.defaultPrice, 'Default price') : null,
      input.currencyCode ?? 'RWF',
      input.taxRateId ?? null,
      input.active ?? true,
    ],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId,
    action: 'BILLABLE_SERVICE_CREATED',
    entityType: 'billable_service',
    entityId: created.rows[0]!.id,
    after: { code: input.code, name: input.name },
  });
  const services = await listServices(pool, actor, organizationId);
  return services.find((service) => service.id === created.rows[0]!.id)!;
}

export async function updateService(
  pool: Pool,
  actor: AuthContext,
  serviceId: string,
  input: {
    name?: string;
    description?: string;
    defaultPrice?: string;
    taxRateId?: string | null;
    active?: boolean;
  },
) {
  const organizationId = await resolveBillingOrganization(pool, actor);
  const existing = await pool.query<{ id: string; organization_id: string }>(
    `SELECT id, organization_id FROM billable_services WHERE id = $1`,
    [serviceId],
  );
  if (!existing.rows[0] || existing.rows[0].organization_id !== organizationId) {
    throw notFound('Billable service not found');
  }
  await pool.query(
    `
      UPDATE billable_services
      SET name = COALESCE($2, name),
          description = CASE WHEN $3::boolean THEN $4 ELSE description END,
          default_price = CASE WHEN $5::boolean THEN $6 ELSE default_price END,
          tax_rate_id = CASE WHEN $7::boolean THEN $8 ELSE tax_rate_id END,
          active = COALESCE($9, active),
          updated_at = now()
      WHERE id = $1
    `,
    [
      serviceId,
      input.name ?? null,
      input.description !== undefined,
      input.description ?? null,
      input.defaultPrice !== undefined,
      input.defaultPrice ? normalizeMoney(input.defaultPrice, 'Default price') : null,
      input.taxRateId !== undefined,
      input.taxRateId ?? null,
      input.active ?? null,
    ],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId,
    action: 'BILLABLE_SERVICE_UPDATED',
    entityType: 'billable_service',
    entityId: serviceId,
  });
  const services = await listServices(pool, actor, organizationId);
  const updated = services.find((service) => service.id === serviceId);
  if (!updated) {
    throw notFound('Billable service not found');
  }
  return updated;
}

export async function listCustomerPrices(pool: Pool, actor: AuthContext, customerId: string) {
  const customer = await loadCustomerOrg(pool, actor, customerId);
  const result = await pool.query(
    `
      SELECT id, customer_organization_id, service_id, pricing_basis, unit_price::text,
             currency_code, active, notes
      FROM customer_service_prices
      WHERE customer_organization_id = $1
      ORDER BY updated_at DESC
    `,
    [customer.id],
  );
  return result.rows.map(mapCustomerPrice);
}

export async function upsertCustomerPrice(
  pool: Pool,
  actor: AuthContext,
  customerId: string,
  input: PriceInput,
) {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot manage contract rates');
  }
  const customer = await loadCustomerOrg(pool, actor, customerId);
  const service = await pool.query<{ organization_id: string; currency_code: string }>(
    `SELECT organization_id, currency_code FROM billable_services WHERE id = $1`,
    [input.serviceId],
  );
  if (!service.rows[0]) {
    throw notFound('Billable service not found');
  }
  assertOperatorAccess(actor, service.rows[0].organization_id);
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO customer_service_prices (
        organization_id, customer_organization_id, service_id, pricing_basis,
        unit_price, currency_code, active, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (customer_organization_id, service_id, pricing_basis)
      DO UPDATE SET
        unit_price = EXCLUDED.unit_price,
        currency_code = EXCLUDED.currency_code,
        active = EXCLUDED.active,
        notes = EXCLUDED.notes,
        updated_at = now()
      RETURNING id
    `,
    [
      service.rows[0].organization_id,
      customer.id,
      input.serviceId,
      input.pricingBasis,
      normalizeMoney(input.unitPrice, 'Unit price'),
      input.currencyCode ?? service.rows[0].currency_code,
      input.active ?? true,
      input.notes ?? null,
    ],
  );
  const loaded = await pool.query(
    `
      SELECT id, customer_organization_id, service_id, pricing_basis, unit_price::text,
             currency_code, active, notes
      FROM customer_service_prices WHERE id = $1
    `,
    [result.rows[0]!.id],
  );
  return mapCustomerPrice(loaded.rows[0]);
}

export async function createInvoice(pool: Pool, actor: AuthContext, input: CreateInvoiceInput) {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot create invoices');
  }
  const organizationId = await resolveBillingOrganization(pool, actor, input.organizationId);
  const customer = await loadCustomerOrg(pool, actor, input.customerOrganizationId);
  assertCustomerBelongsToOperator(customer, organizationId, actor);
  await ensureDefaultServices(pool, organizationId);
  const currency = input.currencyCode ?? customer.currencyCode ?? 'RWF';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const number = await nextInvoiceNumber(client);
    const created = await client.query<{ id: string }>(
      `
        INSERT INTO invoices (
          number, organization_id, customer_organization_id, status, currency_code,
          payment_terms, issue_date, due_date, notes, billing_address, created_by_user_id
        )
        VALUES ($1, $2, $3, 'DRAFT', $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `,
      [
        number,
        organizationId,
        customer.id,
        currency,
        input.paymentTerms ?? 'NET_30',
        input.issueDate ?? null,
        input.dueDate ?? null,
        input.notes ?? null,
        input.billingAddress ?? customer.billingAddress,
        actor.userId,
      ],
    );
    const invoiceId = created.rows[0]!.id;
    for (const shipmentId of input.shipmentIds ?? []) {
      await attachShipment(client, actor, organizationId, customer.id, invoiceId, shipmentId);
    }
    for (const item of input.items ?? []) {
      await insertItem(client, organizationId, customer.id, invoiceId, currency, item);
    }
    await recalculateInvoice(client, invoiceId);
    if (input.issue) {
      const totals = await client.query<{ total_amount: string; item_count: string }>(
        `
          SELECT total_amount::text,
                 (SELECT count(*)::text FROM invoice_items WHERE invoice_id = $1) AS item_count
          FROM invoices WHERE id = $1
        `,
        [invoiceId],
      );
      if (Number(totals.rows[0]?.item_count ?? 0) === 0) {
        throw unprocessable('Add at least one invoice item before issuing');
      }
      if (isZeroMoney(totals.rows[0]?.total_amount ?? '0.00')) {
        throw unprocessable('Cannot issue an invoice with a zero total');
      }
      await markIssued(
        client,
        invoiceId,
        input.paymentTerms ?? 'NET_30',
        input.issueDate,
        input.dueDate,
      );
    }
    await client.query('COMMIT');
    await writeAudit(pool, {
      actorUserId: actor.userId,
      organizationId,
      action: input.issue ? 'INVOICE_ISSUED' : 'INVOICE_CREATED',
      entityType: 'invoice',
      entityId: invoiceId,
      after: { number, customerId: customer.id, issued: Boolean(input.issue) },
    });
    return loadInvoice(pool, actor, invoiceId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listInvoices(pool: Pool, actor: AuthContext, query: ListInvoicesQuery) {
  await markOverdue(pool);
  const params: unknown[] = [];
  const where = ['i.deleted_at IS NULL'];
  applyBillingVisibility(actor, where, params, 'i.organization_id', 'i.customer_organization_id');
  if (query.organizationId && actor.orgType === 'PLATFORM') {
    params.push(query.organizationId);
    where.push(`i.organization_id = $${params.length}`);
  }
  if (query.customerId) {
    params.push(query.customerId);
    where.push(`i.customer_organization_id = $${params.length}`);
  }
  if (query.status) {
    params.push(query.status);
    where.push(`i.status = $${params.length}`);
  }
  if (query.overdue) {
    where.push(`i.status = 'OVERDUE'`);
  }
  if (query.from) {
    params.push(query.from);
    where.push(`i.created_at >= $${params.length}`);
  }
  if (query.to) {
    params.push(query.to);
    where.push(`i.created_at <= $${params.length}`);
  }
  if (query.q) {
    params.push(`%${query.q.toLowerCase()}%`);
    where.push(`(lower(i.number) LIKE $${params.length} OR lower(c.name) LIKE $${params.length})`);
  }
  const count = await pool.query<{ total: string }>(
    `
      SELECT count(*)::text AS total
      FROM invoices i
      JOIN organizations c ON c.id = i.customer_organization_id
      WHERE ${where.join(' AND ')}
    `,
    params,
  );
  const sort = INVOICE_SORT[query.sort];
  const direction = query.order === 'asc' ? 'ASC' : 'DESC';
  params.push(query.pageSize, (query.page - 1) * query.pageSize);
  const result = await pool.query<{ id: string }>(
    `
      SELECT i.id
      FROM invoices i
      JOIN organizations c ON c.id = i.customer_organization_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${sort} ${direction} NULLS LAST, i.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );
  const invoices = await Promise.all(result.rows.map((row) => loadInvoice(pool, actor, row.id)));
  return {
    invoices,
    total: Number(count.rows[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function loadInvoice(
  pool: Pool,
  actor: AuthContext,
  invoiceId: string,
): Promise<InvoicePayload> {
  await markOverdue(pool, invoiceId);
  const result = await pool.query(
    `
      SELECT i.id, i.number, i.organization_id, o.name AS organization_name,
             i.customer_organization_id, c.name AS customer_name, i.status, i.currency_code,
             i.subtotal::text, i.discount_amount::text, i.tax_amount::text, i.total_amount::text,
             i.amount_paid::text, i.amount_due::text, i.issue_date, i.due_date, i.payment_terms,
             i.notes, i.billing_address, i.created_by_user_id, i.created_at, i.updated_at,
             NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), '') AS created_by_name
      FROM invoices i
      JOIN organizations o ON o.id = i.organization_id
      JOIN organizations c ON c.id = i.customer_organization_id
      LEFT JOIN users u ON u.id = i.created_by_user_id
      WHERE i.id = $1 AND i.deleted_at IS NULL
    `,
    [invoiceId],
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound('Invoice not found');
  }
  assertInvoiceAccess(actor, String(row.organization_id), String(row.customer_organization_id));
  const items = await pool.query(
    `
      SELECT it.id, it.service_id, s.code AS service_code, it.description, it.quantity::text,
             it.unit, it.unit_price::text, it.discount_amount::text, it.tax_rate_percent::text,
             it.tax_amount::text, it.line_subtotal::text, it.line_total::text,
             it.shipment_id, sh.reference AS shipment_reference
      FROM invoice_items it
      LEFT JOIN billable_services s ON s.id = it.service_id
      LEFT JOIN shipments sh ON sh.id = it.shipment_id
      WHERE it.invoice_id = $1
      ORDER BY it.created_at
    `,
    [invoiceId],
  );
  const shipments = await pool.query(
    `
      SELECT sh.id, sh.reference, sh.status::text AS status
      FROM invoice_shipments xs
      JOIN shipments sh ON sh.id = xs.shipment_id
      WHERE xs.invoice_id = $1
      ORDER BY sh.reference
    `,
    [invoiceId],
  );
  const payments = await pool.query(
    `
      SELECT id, reference, amount::text, currency_code, method, status, provider,
             provider_reference, paid_at, notes, created_at
      FROM payments
      WHERE invoice_id = $1
      ORDER BY created_at
    `,
    [invoiceId],
  );
  return {
    id: String(row.id),
    number: String(row.number),
    organizationId: String(row.organization_id),
    organizationName: String(row.organization_name),
    customerOrganizationId: String(row.customer_organization_id),
    customerName: String(row.customer_name),
    status: row.status as InvoiceStatus,
    currencyCode: String(row.currency_code),
    subtotal: String(row.subtotal),
    discountAmount: String(row.discount_amount),
    taxAmount: String(row.tax_amount),
    totalAmount: String(row.total_amount),
    amountPaid: String(row.amount_paid),
    amountDue: String(row.amount_due),
    issueDate: toDateOnly(row.issue_date),
    dueDate: toDateOnly(row.due_date),
    paymentTerms: row.payment_terms as PaymentTerms,
    notes: (row.notes as string | null) ?? null,
    billingAddress: (row.billing_address as string | null) ?? null,
    createdByUserId: (row.created_by_user_id as string | null) ?? null,
    createdByName: (row.created_by_name as string | null) ?? null,
    createdAt: new Date(row.created_at as Date).toISOString(),
    updatedAt: new Date(row.updated_at as Date).toISOString(),
    items: items.rows.map((item) => ({
      id: String(item.id),
      serviceId: (item.service_id as string | null) ?? null,
      serviceCode: (item.service_code as string | null) ?? null,
      description: String(item.description),
      quantity: String(item.quantity),
      unit: String(item.unit),
      unitPrice: String(item.unit_price),
      discountAmount: String(item.discount_amount),
      taxRatePercent: String(item.tax_rate_percent),
      taxAmount: String(item.tax_amount),
      lineSubtotal: String(item.line_subtotal),
      lineTotal: String(item.line_total),
      shipmentId: (item.shipment_id as string | null) ?? null,
      shipmentReference: (item.shipment_reference as string | null) ?? null,
    })),
    shipments: shipments.rows.map((shipment) => ({
      shipmentId: String(shipment.id),
      reference: String(shipment.reference),
      status: String(shipment.status),
    })),
    payments: payments.rows.map((payment) => ({
      id: String(payment.id),
      reference: String(payment.reference),
      amount: String(payment.amount),
      currencyCode: String(payment.currency_code),
      method: payment.method,
      status: payment.status,
      provider: payment.provider,
      providerReference: (payment.provider_reference as string | null) ?? null,
      paidAt: payment.paid_at ? new Date(payment.paid_at as Date).toISOString() : null,
      notes: (payment.notes as string | null) ?? null,
      createdAt: new Date(payment.created_at as Date).toISOString(),
    })),
  };
}

export async function updateInvoice(
  pool: Pool,
  actor: AuthContext,
  invoiceId: string,
  input: UpdateInvoiceInput,
) {
  const current = await loadInvoice(pool, actor, invoiceId);
  assertFinanceWrite(actor);
  if (current.status !== 'DRAFT') {
    throw unprocessable('Only draft invoices can be edited');
  }
  await pool.query(
    `
      UPDATE invoices
      SET payment_terms = COALESCE($2, payment_terms),
          issue_date = COALESCE($3, issue_date),
          due_date = COALESCE($4, due_date),
          notes = CASE WHEN $5::boolean THEN $6 ELSE notes END,
          billing_address = CASE WHEN $7::boolean THEN $8 ELSE billing_address END,
          updated_at = now()
      WHERE id = $1
    `,
    [
      invoiceId,
      input.paymentTerms ?? null,
      input.issueDate ?? null,
      input.dueDate ?? null,
      input.notes !== undefined,
      input.notes ?? null,
      input.billingAddress !== undefined,
      input.billingAddress ?? null,
    ],
  );
  if (input.shipmentIds) {
    await pool.query('DELETE FROM invoice_shipments WHERE invoice_id = $1', [invoiceId]);
    for (const shipmentId of input.shipmentIds) {
      await attachShipment(
        pool,
        actor,
        current.organizationId,
        current.customerOrganizationId,
        invoiceId,
        shipmentId,
      );
    }
  }
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'INVOICE_UPDATED',
    entityType: 'invoice',
    entityId: invoiceId,
  });
  return loadInvoice(pool, actor, invoiceId);
}

export async function addInvoiceItem(
  pool: Pool,
  actor: AuthContext,
  invoiceId: string,
  input: ItemInput,
) {
  const current = await loadInvoice(pool, actor, invoiceId);
  assertFinanceWrite(actor);
  if (current.status !== 'DRAFT') {
    throw unprocessable('Items can only be changed on draft invoices');
  }
  await insertItem(
    pool,
    current.organizationId,
    current.customerOrganizationId,
    invoiceId,
    current.currencyCode,
    input,
  );
  await recalculateInvoice(pool, invoiceId);
  return loadInvoice(pool, actor, invoiceId);
}

export async function updateInvoiceItem(
  pool: Pool,
  actor: AuthContext,
  invoiceId: string,
  itemId: string,
  input: ItemInput,
) {
  const current = await loadInvoice(pool, actor, invoiceId);
  assertFinanceWrite(actor);
  if (current.status !== 'DRAFT') {
    throw unprocessable('Items can only be changed on draft invoices');
  }
  const existing = current.items.find((item) => item.id === itemId);
  if (!existing) {
    throw notFound('Invoice item not found');
  }
  const amounts = await resolveItemAmounts(
    pool,
    current.organizationId,
    current.customerOrganizationId,
    current.currencyCode,
    input,
  );
  await pool.query(
    `
      UPDATE invoice_items
      SET service_id = $3, shipment_id = $4, description = $5, quantity = $6, unit = $7,
          unit_price = $8, discount_amount = $9, tax_rate_percent = $10, tax_amount = $11,
          line_subtotal = $12, line_total = $13, updated_at = now()
      WHERE id = $1 AND invoice_id = $2
    `,
    [
      itemId,
      invoiceId,
      amounts.serviceId,
      input.shipmentId ?? existing.shipmentId,
      amounts.description,
      amounts.quantity,
      amounts.unit,
      amounts.unitPrice,
      amounts.discountAmount,
      amounts.taxRatePercent,
      amounts.taxAmount,
      amounts.lineSubtotal,
      amounts.lineTotal,
    ],
  );
  await recalculateInvoice(pool, invoiceId);
  return loadInvoice(pool, actor, invoiceId);
}

export async function removeInvoiceItem(
  pool: Pool,
  actor: AuthContext,
  invoiceId: string,
  itemId: string,
) {
  const current = await loadInvoice(pool, actor, invoiceId);
  assertFinanceWrite(actor);
  if (current.status !== 'DRAFT') {
    throw unprocessable('Items can only be changed on draft invoices');
  }
  const deleted = await pool.query(
    'DELETE FROM invoice_items WHERE id = $1 AND invoice_id = $2 RETURNING id',
    [itemId, invoiceId],
  );
  if (!deleted.rows[0]) {
    throw notFound('Invoice item not found');
  }
  await recalculateInvoice(pool, invoiceId);
  return loadInvoice(pool, actor, invoiceId);
}

export async function issueInvoice(pool: Pool, actor: AuthContext, invoiceId: string) {
  const current = await loadInvoice(pool, actor, invoiceId);
  assertFinanceWrite(actor);
  if (!canTransitionInvoice(current.status, 'ISSUED')) {
    throw new AppError(
      422,
      'INVOICE_INVALID_TRANSITION',
      `Cannot issue a ${current.status} invoice.`,
    );
  }
  if (current.items.length === 0) {
    throw unprocessable('Add at least one invoice item before issuing');
  }
  if (isZeroMoney(current.totalAmount)) {
    throw unprocessable('Cannot issue an invoice with a zero total');
  }
  await markIssued(pool, invoiceId, current.paymentTerms, current.issueDate, current.dueDate);
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: 'INVOICE_ISSUED',
    entityType: 'invoice',
    entityId: invoiceId,
    before: { status: current.status },
    after: { status: 'ISSUED' },
  });
  return loadInvoice(pool, actor, invoiceId);
}

export async function cancelInvoice(
  pool: Pool,
  actor: AuthContext,
  invoiceId: string,
  mode: 'CANCELLED' | 'VOID' = 'CANCELLED',
) {
  const current = await loadInvoice(pool, actor, invoiceId);
  assertFinanceWrite(actor);
  if (!canTransitionInvoice(current.status, mode)) {
    throw new AppError(
      422,
      'INVOICE_INVALID_TRANSITION',
      `Cannot ${mode.toLowerCase()} a ${current.status} invoice.`,
    );
  }
  if (current.payments.some((payment) => payment.status === 'SUCCESSFUL')) {
    throw unprocessable('Refund successful payments before cancelling or voiding this invoice');
  }
  await pool.query(`UPDATE invoices SET status = $2, updated_at = now() WHERE id = $1`, [
    invoiceId,
    mode,
  ]);
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: mode === 'VOID' ? 'INVOICE_VOIDED' : 'INVOICE_CANCELLED',
    entityType: 'invoice',
    entityId: invoiceId,
    before: { status: current.status },
    after: { status: mode },
  });
  return loadInvoice(pool, actor, invoiceId);
}

export async function createPayment(pool: Pool, actor: AuthContext, input: CreatePaymentInput) {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot record payments');
  }
  const invoice = await loadInvoice(pool, actor, input.invoiceId);
  if (!isOpenReceivable(invoice.status)) {
    throw unprocessable('Payments can only be recorded against issued receivables');
  }
  if (
    (input.method === 'BANK_TRANSFER' || input.method === 'MOBILE_MONEY') &&
    !input.providerReference
  ) {
    throw unprocessable('Bank transfer and mobile money payments require a transaction reference');
  }
  const amount = normalizeMoney(input.amount, 'Payment amount');
  if (compareMoney(amount, invoice.amountDue) > 0) {
    throw unprocessable('Payment amount cannot exceed the amount due');
  }
  if (invoice.currencyCode !== 'RWF' && input.amount) {
    // currency must match the invoice; supported currencies remain extensible
  }
  if (input.idempotencyKey) {
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM payments WHERE organization_id = $1 AND idempotency_key = $2`,
      [invoice.organizationId, input.idempotencyKey],
    );
    if (existing.rows[0]) {
      return loadPayment(pool, actor, existing.rows[0].id);
    }
  }
  const provider = resolvePaymentProvider(input.provider);
  const initiation = provider.initiate({
    amount,
    currencyCode: invoice.currencyCode,
    reference: invoice.number,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reference = await nextPaymentNumber(client);
    const created = await client.query<{ id: string }>(
      `
        INSERT INTO payments (
          reference, invoice_id, organization_id, customer_organization_id, amount,
          currency_code, method, status, provider, provider_reference, paid_at,
          notes, idempotency_key, created_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
      `,
      [
        reference,
        invoice.id,
        invoice.organizationId,
        invoice.customerOrganizationId,
        amount,
        invoice.currencyCode,
        input.method,
        initiation.status,
        initiation.provider,
        input.providerReference ?? initiation.providerReference,
        null,
        input.notes ?? null,
        input.idempotencyKey ?? null,
        actor.userId,
      ],
    );
    await client.query('COMMIT');
    await writeAudit(pool, {
      actorUserId: actor.userId,
      organizationId: invoice.organizationId,
      action: 'PAYMENT_CREATED',
      entityType: 'payment',
      entityId: created.rows[0]!.id,
      after: { invoiceId: invoice.id, amount, status: initiation.status, method: input.method },
    });
    return loadPayment(pool, actor, created.rows[0]!.id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function confirmPayment(
  pool: Pool,
  actor: AuthContext,
  paymentId: string,
  input: { providerTransactionId?: string; notes?: string } = {},
) {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot confirm payments');
  }
  const payment = await loadPayment(pool, actor, paymentId);
  if (payment.status === 'SUCCESSFUL') {
    return payment;
  }
  if (payment.status !== 'PENDING' && payment.status !== 'PROCESSING') {
    throw unprocessable(`A ${payment.status.toLowerCase()} payment cannot be confirmed`);
  }
  const invoice = await loadInvoice(pool, actor, payment.invoiceId);
  if (compareMoney(payment.amount, invoice.amountDue) > 0) {
    throw unprocessable('Confirming this payment would overpay the invoice');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await markPaymentSuccessful(client, paymentId, invoice.id, {
      providerReference: input.providerTransactionId,
      notes: input.notes,
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: payment.organizationId,
    action: 'PAYMENT_CONFIRMED',
    entityType: 'payment',
    entityId: paymentId,
    before: { status: payment.status },
    after: { status: 'SUCCESSFUL', providerTransactionId: input.providerTransactionId ?? null },
  });
  return loadPayment(pool, actor, paymentId);
}

export async function applyProviderWebhook(
  pool: Pool,
  provider: string,
  payload: {
    eventId: string;
    paymentReference: string;
    status: 'SUCCESSFUL' | 'FAILED' | 'CANCELLED';
    providerTransactionId?: string;
  },
) {
  const existingEvent = await pool.query<{ id: string }>(
    `SELECT id FROM payments WHERE provider = $1 AND provider_event_id = $2`,
    [provider, payload.eventId],
  );
  if (existingEvent.rows[0]) {
    return loadPaymentAsSystem(pool, existingEvent.rows[0].id);
  }
  const found = await pool.query<{ id: string; status: string; organization_id: string }>(
    `SELECT id, status, organization_id FROM payments WHERE reference = $1`,
    [payload.paymentReference],
  );
  const row = found.rows[0];
  if (!row) {
    throw notFound('Payment not found for webhook reference');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE payments SET provider_event_id = $2, provider_reference = COALESCE($3, provider_reference), updated_at = now() WHERE id = $1`,
      [row.id, payload.eventId, payload.providerTransactionId ?? null],
    );
    if (payload.status === 'SUCCESSFUL') {
      const invoice = await client.query<{ id: string }>(
        `SELECT invoice_id AS id FROM payments WHERE id = $1`,
        [row.id],
      );
      await markPaymentSuccessful(client, row.id, String(invoice.rows[0]!.id), {
        providerReference: payload.providerTransactionId,
        eventId: payload.eventId,
      });
    } else {
      await client.query(`UPDATE payments SET status = $2, updated_at = now() WHERE id = $1`, [
        row.id,
        payload.status,
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await writeAudit(pool, {
    organizationId: row.organization_id,
    action: payload.status === 'SUCCESSFUL' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_STATUS_CHANGED',
    entityType: 'payment',
    entityId: row.id,
    before: { status: row.status },
    after: { status: payload.status, provider, eventId: payload.eventId },
  });
  return loadPaymentAsSystem(pool, row.id);
}

export async function failPayment(pool: Pool, actor: AuthContext, paymentId: string) {
  const payment = await loadPayment(pool, actor, paymentId);
  if (payment.status === 'SUCCESSFUL' || payment.status === 'REFUNDED') {
    throw unprocessable('Successful financial records cannot be marked failed');
  }
  await pool.query(`UPDATE payments SET status = 'FAILED', updated_at = now() WHERE id = $1`, [
    paymentId,
  ]);
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: payment.organizationId,
    action: 'PAYMENT_STATUS_CHANGED',
    entityType: 'payment',
    entityId: paymentId,
    before: { status: payment.status },
    after: { status: 'FAILED' },
  });
  return loadPayment(pool, actor, paymentId);
}

export async function cancelPayment(pool: Pool, actor: AuthContext, paymentId: string) {
  const payment = await loadPayment(pool, actor, paymentId);
  if (payment.status === 'SUCCESSFUL' || payment.status === 'REFUNDED') {
    throw unprocessable('Successful payments must be refunded, not cancelled');
  }
  await pool.query(`UPDATE payments SET status = 'CANCELLED', updated_at = now() WHERE id = $1`, [
    paymentId,
  ]);
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: payment.organizationId,
    action: 'PAYMENT_STATUS_CHANGED',
    entityType: 'payment',
    entityId: paymentId,
    before: { status: payment.status },
    after: { status: 'CANCELLED' },
  });
  return loadPayment(pool, actor, paymentId);
}

export async function refundPayment(
  pool: Pool,
  actor: AuthContext,
  paymentId: string,
  reason: string,
) {
  const payment = await loadPayment(pool, actor, paymentId);
  if (payment.status !== 'SUCCESSFUL') {
    throw unprocessable('Only successful payments can be refunded');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE payments SET status = 'REFUNDED', updated_at = now() WHERE id = $1`,
      [paymentId],
    );
    await client.query(
      `
        INSERT INTO financial_adjustments (
          organization_id, invoice_id, payment_id, adjustment_type, amount, currency_code, reason, created_by_user_id
        )
        VALUES ($1, $2, $3, 'REFUND', $4, $5, $6, $7)
      `,
      [
        payment.organizationId,
        payment.invoiceId,
        paymentId,
        payment.amount,
        payment.currencyCode,
        reason,
        actor.userId,
      ],
    );
    await applySuccessfulPayments(client, payment.invoiceId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: payment.organizationId,
    action: 'REFUND_CREATED',
    entityType: 'payment',
    entityId: paymentId,
    after: { reason, amount: payment.amount },
  });
  return loadPayment(pool, actor, paymentId);
}

export async function createAdjustment(
  pool: Pool,
  actor: AuthContext,
  invoiceId: string,
  input: AdjustmentInput,
) {
  const invoice = await loadInvoice(pool, actor, invoiceId);
  assertFinanceWrite(actor);
  if (input.type === 'REFUND') {
    throw unprocessable('Use the payment refund endpoint for refunds');
  }
  const amount = normalizeMoney(input.amount, 'Adjustment amount');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO financial_adjustments (
          organization_id, invoice_id, payment_id, adjustment_type, amount, currency_code, reason, created_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        invoice.organizationId,
        invoiceId,
        input.paymentId ?? null,
        input.type,
        amount,
        invoice.currencyCode,
        input.reason,
        actor.userId,
      ],
    );
    if (input.type === 'CREDIT') {
      await client.query(
        `
          UPDATE invoices
          SET discount_amount = discount_amount + $2,
              total_amount = GREATEST(total_amount - $2, 0),
              updated_at = now()
          WHERE id = $1
        `,
        [invoiceId, amount],
      );
    } else {
      await client.query(
        `
          UPDATE invoices
          SET total_amount = total_amount + $2, updated_at = now()
          WHERE id = $1
        `,
        [invoiceId, amount],
      );
    }
    await applySuccessfulPayments(client, invoiceId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: invoice.organizationId,
    action: 'FINANCIAL_ADJUSTMENT_CREATED',
    entityType: 'invoice',
    entityId: invoiceId,
    after: { type: input.type, amount, reason: input.reason },
  });
  const created = await pool.query(
    `
      SELECT id, adjustment_type, invoice_id, payment_id, amount::text, currency_code, reason, created_at
      FROM financial_adjustments WHERE invoice_id = $1 ORDER BY created_at DESC LIMIT 1
    `,
    [invoiceId],
  );
  return mapAdjustment(created.rows[0]);
}

export async function listPayments(pool: Pool, actor: AuthContext, query: ListPaymentsQuery) {
  const params: unknown[] = [];
  const where = ['1=1'];
  applyBillingVisibility(actor, where, params, 'p.organization_id', 'p.customer_organization_id');
  if (query.invoiceId) {
    params.push(query.invoiceId);
    where.push(`p.invoice_id = $${params.length}`);
  }
  if (query.customerId) {
    params.push(query.customerId);
    where.push(`p.customer_organization_id = $${params.length}`);
  }
  if (query.status) {
    params.push(query.status);
    where.push(`p.status = $${params.length}`);
  }
  if (query.method) {
    params.push(query.method);
    where.push(`p.method = $${params.length}`);
  }
  if (query.from) {
    params.push(query.from);
    where.push(`p.created_at >= $${params.length}`);
  }
  if (query.to) {
    params.push(query.to);
    where.push(`p.created_at <= $${params.length}`);
  }
  if (query.q) {
    params.push(`%${query.q.toLowerCase()}%`);
    where.push(
      `(lower(p.reference) LIKE $${params.length} OR lower(i.number) LIKE $${params.length})`,
    );
  }
  const count = await pool.query<{ total: string }>(
    `
      SELECT count(*)::text AS total
      FROM payments p
      JOIN invoices i ON i.id = p.invoice_id
      WHERE ${where.join(' AND ')}
    `,
    params,
  );
  const sort = PAYMENT_SORT[query.sort];
  const direction = query.order === 'asc' ? 'ASC' : 'DESC';
  params.push(query.pageSize, (query.page - 1) * query.pageSize);
  const result = await pool.query<{ id: string }>(
    `
      SELECT p.id
      FROM payments p
      JOIN invoices i ON i.id = p.invoice_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${sort} ${direction} NULLS LAST, p.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );
  const payments = await Promise.all(result.rows.map((row) => loadPayment(pool, actor, row.id)));
  return {
    payments,
    total: Number(count.rows[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function loadPayment(
  pool: Pool,
  actor: AuthContext,
  paymentId: string,
): Promise<PaymentPayload> {
  const result = await pool.query(
    `
      SELECT p.id, p.reference, p.invoice_id, i.number AS invoice_number, p.organization_id,
             p.customer_organization_id, c.name AS customer_name, p.amount::text, p.currency_code,
             p.method, p.status, p.provider, p.provider_reference, p.paid_at, p.notes,
             p.idempotency_key, p.created_by_user_id, p.created_at, p.updated_at,
             NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), '') AS created_by_name
      FROM payments p
      JOIN invoices i ON i.id = p.invoice_id
      JOIN organizations c ON c.id = p.customer_organization_id
      LEFT JOIN users u ON u.id = p.created_by_user_id
      WHERE p.id = $1
    `,
    [paymentId],
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound('Payment not found');
  }
  assertInvoiceAccess(actor, String(row.organization_id), String(row.customer_organization_id));
  return {
    id: String(row.id),
    reference: String(row.reference),
    invoiceId: String(row.invoice_id),
    invoiceNumber: String(row.invoice_number),
    organizationId: String(row.organization_id),
    customerOrganizationId: String(row.customer_organization_id),
    customerName: String(row.customer_name),
    amount: String(row.amount),
    currencyCode: String(row.currency_code),
    method: row.method,
    status: row.status,
    provider: row.provider,
    providerReference: (row.provider_reference as string | null) ?? null,
    paidAt: row.paid_at ? new Date(row.paid_at as Date).toISOString() : null,
    notes: (row.notes as string | null) ?? null,
    idempotencyKey: (row.idempotency_key as string | null) ?? null,
    createdByUserId: (row.created_by_user_id as string | null) ?? null,
    createdByName: (row.created_by_name as string | null) ?? null,
    createdAt: new Date(row.created_at as Date).toISOString(),
    updatedAt: new Date(row.updated_at as Date).toISOString(),
  };
}

async function loadPaymentAsSystem(pool: Pool, paymentId: string): Promise<PaymentPayload> {
  const platformActor: AuthContext = {
    userId: '00000000-0000-0000-0000-000000000000',
    email: 'system@mizigox.local',
    firstName: 'System',
    lastName: 'Webhook',
    orgId: '00000000-0000-0000-0000-000000000000',
    orgName: 'MizigoX',
    orgType: 'PLATFORM',
    role: 'SUPER_ADMIN',
    permissions: ['payments.manage'],
    countryCode: 'RW',
    currencyCode: 'RWF',
  };
  return loadPayment(pool, platformActor, paymentId);
}

export async function listOutstandingInvoices(pool: Pool, actor: AuthContext, customerId: string) {
  const customer = await loadCustomerOrg(pool, actor, customerId);
  await markOverdue(pool);
  const result = await pool.query<{ id: string }>(
    `
      SELECT i.id
      FROM invoices i
      WHERE i.customer_organization_id = $1
        AND i.deleted_at IS NULL
        AND i.status IN ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE')
      ORDER BY i.due_date NULLS LAST, i.created_at DESC
    `,
    [customer.id],
  );
  const invoices = [];
  for (const row of result.rows) {
    try {
      invoices.push(await loadInvoice(pool, actor, row.id));
    } catch {
      // Skip records the actor cannot access.
    }
  }
  return invoices;
}

export async function listCustomerPaymentHistory(
  pool: Pool,
  actor: AuthContext,
  customerId: string,
) {
  return listPayments(pool, actor, {
    customerId,
    page: 1,
    pageSize: 50,
    sort: 'createdAt',
    order: 'desc',
  });
}

export async function getCustomerBalance(
  pool: Pool,
  actor: AuthContext,
  customerId: string,
): Promise<CustomerBalancePayload> {
  const customer = await loadCustomerOrg(pool, actor, customerId);
  await markOverdue(pool);
  const params: unknown[] = [customer.id];
  const where = [
    `i.customer_organization_id = $1`,
    `i.deleted_at IS NULL`,
    `i.status NOT IN ('DRAFT', 'CANCELLED', 'VOID')`,
  ];
  applyBillingVisibility(actor, where, params, 'i.organization_id', 'i.customer_organization_id');
  const result = await pool.query(
    `
      SELECT
        coalesce(sum(i.total_amount), 0)::text AS total_invoiced,
        coalesce(sum(i.amount_paid), 0)::text AS total_paid,
        coalesce(sum(CASE WHEN i.status IN ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE') THEN i.amount_due ELSE 0 END), 0)::text AS outstanding,
        coalesce(sum(CASE WHEN i.status = 'OVERDUE' THEN i.amount_due ELSE 0 END), 0)::text AS overdue,
        count(*) FILTER (WHERE i.status IN ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE'))::int AS open_count,
        coalesce(max(i.currency_code), $2) AS currency_code
      FROM invoices i
      WHERE ${where.join(' AND ')}
    `,
    [...params, customer.currencyCode],
  );
  const row = result.rows[0];
  return {
    customerOrganizationId: customer.id,
    customerName: customer.name,
    currencyCode: String(row.currency_code ?? customer.currencyCode),
    totalInvoiced: String(row.total_invoiced),
    totalPaid: String(row.total_paid),
    outstandingBalance: String(row.outstanding),
    overdueAmount: String(row.overdue),
    openInvoiceCount: Number(row.open_count ?? 0),
  };
}

export async function getFinanceSummary(
  pool: Pool,
  actor: AuthContext,
  organizationId?: string,
): Promise<FinanceSummaryPayload> {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot access the finance dashboard');
  }
  await markOverdue(pool);
  const params: unknown[] = [];
  const where = [`i.deleted_at IS NULL`, `i.status NOT IN ('DRAFT', 'CANCELLED', 'VOID')`];
  applyBillingVisibility(actor, where, params, 'i.organization_id', 'i.customer_organization_id');
  if (organizationId && actor.orgType === 'PLATFORM') {
    params.push(organizationId);
    where.push(`i.organization_id = $${params.length}`);
  }
  const result = await pool.query(
    `
      SELECT
        coalesce(sum(i.total_amount), 0)::text AS revenue,
        coalesce(sum(i.amount_paid), 0)::text AS paid,
        coalesce(sum(CASE WHEN i.status IN ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE') THEN i.amount_due ELSE 0 END), 0)::text AS due,
        count(*) FILTER (WHERE i.status IN ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE'))::int AS outstanding_count,
        count(*) FILTER (WHERE i.status = 'OVERDUE')::int AS overdue_count,
        coalesce(sum(CASE WHEN i.status = 'OVERDUE' THEN i.amount_due ELSE 0 END), 0)::text AS overdue_amount,
        coalesce(max(i.currency_code), 'RWF') AS currency_code
      FROM invoices i
      WHERE ${where.join(' AND ')}
    `,
    params,
  );
  const row = result.rows[0];
  return {
    currencyCode: String(row.currency_code ?? 'RWF'),
    totalRevenue: String(row.revenue),
    amountPaid: String(row.paid),
    amountDue: String(row.due),
    outstandingInvoiceCount: Number(row.outstanding_count ?? 0),
    overdueInvoiceCount: Number(row.overdue_count ?? 0),
    overdueAmount: String(row.overdue_amount),
  };
}

export async function getInvoiceDocument(
  pool: Pool,
  actor: AuthContext,
  invoiceId: string,
): Promise<InvoiceDocumentPayload> {
  const invoice = await loadInvoice(pool, actor, invoiceId);
  const orgs = await pool.query(
    `
      SELECT o.id, o.name, o.legal_name, o.tax_id, o.country_code, o.email, o.phone_e164
      FROM organizations o
      WHERE o.id IN ($1, $2)
    `,
    [invoice.organizationId, invoice.customerOrganizationId],
  );
  const seller = orgs.rows.find((row) => String(row.id) === invoice.organizationId);
  const buyer = orgs.rows.find((row) => String(row.id) === invoice.customerOrganizationId);
  return {
    invoiceNumber: invoice.number,
    status: invoice.status,
    currencyCode: invoice.currencyCode,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    paymentTerms: invoice.paymentTerms,
    notes: invoice.notes,
    seller: {
      name: seller ? String(seller.name) : invoice.organizationName,
      legalName: (seller?.legal_name as string | null) ?? null,
      taxId: (seller?.tax_id as string | null) ?? null,
      countryCode: seller ? String(seller.country_code) : 'RW',
      email: (seller?.email as string | null) ?? null,
      phone: (seller?.phone_e164 as string | null) ?? null,
      address: null,
    },
    buyer: {
      name: buyer ? String(buyer.name) : invoice.customerName,
      legalName: (buyer?.legal_name as string | null) ?? null,
      taxId: (buyer?.tax_id as string | null) ?? null,
      countryCode: buyer ? String(buyer.country_code) : 'RW',
      email: (buyer?.email as string | null) ?? null,
      phone: (buyer?.phone_e164 as string | null) ?? null,
      address: invoice.billingAddress,
    },
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount,
      taxRatePercent: item.taxRatePercent,
      taxAmount: item.taxAmount,
      lineTotal: item.lineTotal,
      shipmentReference: item.shipmentReference,
    })),
    totals: {
      subtotal: invoice.subtotal,
      discountAmount: invoice.discountAmount,
      taxAmount: invoice.taxAmount,
      totalAmount: invoice.totalAmount,
      amountPaid: invoice.amountPaid,
      amountDue: invoice.amountDue,
    },
    payments: invoice.payments.map((payment) => ({
      reference: payment.reference,
      method: payment.method,
      status: payment.status,
      amount: payment.amount,
      paidAt: payment.paidAt,
    })),
  };
}

export async function listInvoiceActivity(pool: Pool, actor: AuthContext, invoiceId: string) {
  const invoice = await loadInvoice(pool, actor, invoiceId);
  if (!actor.permissions.includes('audit.read') && actor.orgType === 'CUSTOMER') {
    return [];
  }
  const result = await pool.query(
    `
      SELECT a.action, a.entity_type, a.actor_user_id, a.created_at,
             NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), '') AS actor_name
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE (a.entity_type = 'invoice' AND a.entity_id = $1::text)
         OR (
           a.entity_type = 'payment'
           AND a.entity_id IN (SELECT id::text FROM payments WHERE invoice_id = $1::uuid)
         )
      ORDER BY a.created_at DESC
      LIMIT 50
    `,
    [invoice.id],
  );
  return result.rows.map((row) => ({
    action: String(row.action),
    entityType: String(row.entity_type),
    actorName: (row.actor_name as string | null) ?? null,
    createdAt: new Date(row.created_at as Date).toISOString(),
  }));
}

async function insertItem(
  client: Pool | PoolClient,
  organizationId: string,
  customerId: string,
  invoiceId: string,
  currencyCode: string,
  input: ItemInput,
) {
  const amounts = await resolveItemAmounts(client, organizationId, customerId, currencyCode, input);
  await client.query(
    `
      INSERT INTO invoice_items (
        invoice_id, organization_id, service_id, shipment_id, description, quantity, unit,
        unit_price, discount_amount, tax_rate_percent, tax_amount, line_subtotal, line_total
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `,
    [
      invoiceId,
      organizationId,
      amounts.serviceId,
      input.shipmentId ?? null,
      amounts.description,
      amounts.quantity,
      amounts.unit,
      amounts.unitPrice,
      amounts.discountAmount,
      amounts.taxRatePercent,
      amounts.taxAmount,
      amounts.lineSubtotal,
      amounts.lineTotal,
    ],
  );
}

async function resolveItemAmounts(
  client: Pool | PoolClient,
  organizationId: string,
  customerId: string,
  currencyCode: string,
  input: ItemInput,
) {
  let description = input.description ?? 'Logistics service';
  let unit = input.unit ?? 'OTHER';
  let unitPrice = input.unitPrice ?? '';
  let taxRate = input.taxRatePercent ?? '0.00';
  let serviceId: string | null = input.serviceId ?? null;
  if (input.serviceId) {
    const service = await client.query<{
      name: string;
      unit: ServiceUnit;
      default_price: string | null;
      tax_rate_percent: string | null;
      organization_id: string;
      currency_code: string;
    }>(
      `
        SELECT s.name, s.unit, s.default_price::text, t.rate_percent::text AS tax_rate_percent,
               s.organization_id, s.currency_code
        FROM billable_services s
        LEFT JOIN tax_rates t ON t.id = s.tax_rate_id AND t.active = true
        WHERE s.id = $1 AND s.active = true
      `,
      [input.serviceId],
    );
    const row = service.rows[0];
    if (!row || row.organization_id !== organizationId) {
      throw notFound('Billable service not found');
    }
    if (row.currency_code !== currencyCode) {
      throw unprocessable('Service currency must match the invoice currency');
    }
    description = input.description ?? row.name;
    unit = input.unit ?? row.unit;
    if (!input.unitPrice && row.default_price) {
      unitPrice = row.default_price;
    }
    const customerPrice = await client.query<{ unit_price: string }>(
      `
        SELECT unit_price::text
        FROM customer_service_prices
        WHERE customer_organization_id = $1 AND service_id = $2 AND active = true
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [customerId, input.serviceId],
    );
    if (customerPrice.rows[0] && !input.unitPrice) {
      unitPrice = customerPrice.rows[0].unit_price;
    }
    if (!input.taxRatePercent && row.tax_rate_percent) {
      taxRate = row.tax_rate_percent;
    }
    serviceId = input.serviceId;
  }
  if (!unitPrice) {
    throw unprocessable('Unit price is required when the service has no default or customer price');
  }
  const amounts = lineAmounts({
    quantity: input.quantity,
    unitPrice,
    discountAmount: input.discountAmount ?? '0.00',
    taxRatePercent: taxRate,
  });
  return { ...amounts, description, unit, serviceId };
}

async function recalculateInvoice(client: Pool | PoolClient, invoiceId: string) {
  const items = await client.query<{
    line_subtotal: string;
    discount_amount: string;
    tax_amount: string;
    line_total: string;
  }>(
    `SELECT line_subtotal::text, discount_amount::text, tax_amount::text, line_total::text FROM invoice_items WHERE invoice_id = $1`,
    [invoiceId],
  );
  const subtotal = addMoney(items.rows.map((row) => row.line_subtotal));
  const discountAmount = addMoney(items.rows.map((row) => row.discount_amount));
  const taxAmount = addMoney(items.rows.map((row) => row.tax_amount));
  const totalAmount = addMoney(items.rows.map((row) => row.line_total));
  const paid = await client.query<{ amount: string }>(
    `SELECT coalesce(sum(amount), 0)::text AS amount FROM payments WHERE invoice_id = $1 AND status = 'SUCCESSFUL'`,
    [invoiceId],
  );
  const amountPaid = normalizeMoney(paid.rows[0]?.amount ?? '0.00');
  const amountDue = subtractMoney(totalAmount, amountPaid);
  if (moneyToMinor(amountDue) < 0n) {
    throw unprocessable('Invoice payments cannot exceed the invoice total');
  }
  await client.query(
    `
      UPDATE invoices
      SET subtotal = $2, discount_amount = $3, tax_amount = $4, total_amount = $5,
          amount_paid = $6, amount_due = $7, updated_at = now()
      WHERE id = $1
    `,
    [invoiceId, subtotal, discountAmount, taxAmount, totalAmount, amountPaid, amountDue],
  );
}

async function markPaymentSuccessful(
  client: PoolClient,
  paymentId: string,
  invoiceId: string,
  input: { providerReference?: string; notes?: string; eventId?: string } = {},
) {
  const locked = await client.query<{ status: string; amount: string }>(
    `SELECT status, amount::text FROM payments WHERE id = $1 FOR UPDATE`,
    [paymentId],
  );
  if (!locked.rows[0]) {
    throw notFound('Payment not found');
  }
  if (locked.rows[0].status === 'SUCCESSFUL') {
    return;
  }
  if (locked.rows[0].status !== 'PENDING' && locked.rows[0].status !== 'PROCESSING') {
    throw unprocessable(`A ${locked.rows[0].status.toLowerCase()} payment cannot be confirmed`);
  }
  const invoice = await client.query<{ amount_due: string; status: InvoiceStatus }>(
    `SELECT amount_due::text, status FROM invoices WHERE id = $1 FOR UPDATE`,
    [invoiceId],
  );
  if (!invoice.rows[0] || !isOpenReceivable(invoice.rows[0].status)) {
    throw unprocessable('Payments can only be confirmed against issued receivables');
  }
  if (compareMoney(locked.rows[0].amount, invoice.rows[0].amount_due) > 0) {
    throw unprocessable('Confirming this payment would overpay the invoice');
  }
  await client.query(
    `
      UPDATE payments
      SET status = 'SUCCESSFUL',
          paid_at = COALESCE(paid_at, now()),
          provider_reference = COALESCE($2, provider_reference),
          notes = COALESCE($3, notes),
          provider_event_id = COALESCE($4, provider_event_id),
          updated_at = now()
      WHERE id = $1
    `,
    [paymentId, input.providerReference ?? null, input.notes ?? null, input.eventId ?? null],
  );
  await applySuccessfulPayments(client, invoiceId);
}

async function applySuccessfulPayments(client: PoolClient, invoiceId: string) {
  const paid = await client.query<{ amount: string }>(
    `SELECT coalesce(sum(amount), 0)::text AS amount FROM payments WHERE invoice_id = $1 AND status = 'SUCCESSFUL'`,
    [invoiceId],
  );
  const current = await client.query<{
    status: InvoiceStatus;
    total_amount: string;
    due_date: string | null;
  }>(`SELECT status, total_amount::text, due_date FROM invoices WHERE id = $1 FOR UPDATE`, [
    invoiceId,
  ]);
  const row = current.rows[0]!;
  const amountPaid = normalizeMoney(paid.rows[0]?.amount ?? '0.00');
  const amountDue = subtractMoney(row.total_amount, amountPaid);
  if (moneyToMinor(amountDue) < 0n) {
    throw unprocessable('Invoice payments cannot exceed the invoice total');
  }
  let next = row.status;
  if (row.status !== 'CANCELLED' && row.status !== 'VOID' && row.status !== 'DRAFT') {
    if (isZeroMoney(amountDue) && !isZeroMoney(amountPaid)) {
      next = 'PAID';
    } else if (!isZeroMoney(amountPaid) && !isZeroMoney(amountDue)) {
      next = 'PARTIALLY_PAID';
    } else if (
      row.due_date &&
      new Date(row.due_date) < new Date(new Date().toISOString().slice(0, 10))
    ) {
      next = 'OVERDUE';
    } else {
      next = 'ISSUED';
    }
  }
  await client.query(
    `
      UPDATE invoices
      SET amount_paid = $2, amount_due = $3, status = $4, updated_at = now()
      WHERE id = $1
    `,
    [invoiceId, amountPaid, amountDue, next],
  );
}

async function markIssued(
  client: Pool | PoolClient,
  invoiceId: string,
  terms: PaymentTerms,
  issueDate?: string | null,
  dueDate?: string | null,
) {
  const issued = issueDate ?? new Date().toISOString().slice(0, 10);
  const due = dueDate ?? dueDateFromTerms(issued, terms);
  await client.query(
    `
      UPDATE invoices
      SET status = 'ISSUED', issue_date = $2, due_date = $3, updated_at = now()
      WHERE id = $1
    `,
    [invoiceId, issued, due],
  );
}

async function markOverdue(pool: Pool, invoiceId?: string) {
  if (invoiceId) {
    await pool.query(
      `
        UPDATE invoices
        SET status = 'OVERDUE', updated_at = now()
        WHERE id = $1
          AND status IN ('ISSUED', 'PARTIALLY_PAID')
          AND due_date IS NOT NULL
          AND due_date < CURRENT_DATE
      `,
      [invoiceId],
    );
    return;
  }
  await pool.query(
    `
      UPDATE invoices
      SET status = 'OVERDUE', updated_at = now()
      WHERE status IN ('ISSUED', 'PARTIALLY_PAID')
        AND due_date IS NOT NULL
        AND due_date < CURRENT_DATE
        AND deleted_at IS NULL
    `,
  );
}

async function attachShipment(
  client: Pool | PoolClient,
  actor: AuthContext,
  organizationId: string,
  customerId: string,
  invoiceId: string,
  shipmentId: string,
) {
  const shipment = await client.query<{
    customer_organization_id: string;
    operator_organization_id: string;
  }>(
    `SELECT customer_organization_id, operator_organization_id FROM shipments WHERE id = $1 AND deleted_at IS NULL`,
    [shipmentId],
  );
  const row = shipment.rows[0];
  if (!row) {
    throw notFound('Shipment not found');
  }
  if (
    row.customer_organization_id !== customerId ||
    row.operator_organization_id !== organizationId
  ) {
    throw forbidden('Shipment does not belong to this customer and transporter');
  }
  await client.query(
    `
      INSERT INTO invoice_shipments (invoice_id, shipment_id, organization_id)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
    `,
    [invoiceId, shipmentId, organizationId],
  );
}

async function ensureDefaultServices(pool: Pool, organizationId: string) {
  const tax = await pool.query<{ id: string }>(
    `SELECT id FROM tax_rates WHERE country_code = 'RW' AND active = true ORDER BY created_at LIMIT 1`,
  );
  const org = await pool.query<{ default_currency_code: string }>(
    `SELECT default_currency_code FROM organizations WHERE id = $1`,
    [organizationId],
  );
  const currency = org.rows[0]?.default_currency_code ?? 'RWF';
  for (const service of DEFAULT_SERVICES) {
    await pool.query(
      `
        INSERT INTO billable_services (
          organization_id, code, name, description, service_type, unit, default_price, currency_code, tax_rate_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8)
        ON CONFLICT (organization_id, code) DO NOTHING
      `,
      [
        organizationId,
        service.code,
        service.name,
        service.name,
        service.type,
        service.unit,
        currency,
        tax.rows[0]?.id ?? null,
      ],
    );
  }
}

async function nextInvoiceNumber(client: PoolClient) {
  const result = await client.query<{ last_value: number }>(
    `UPDATE invoice_reference_counters SET last_value = last_value + 1 WHERE id = 1 RETURNING last_value`,
  );
  return `MX-INV-${String(result.rows[0]?.last_value ?? 1).padStart(6, '0')}`;
}

async function nextPaymentNumber(client: PoolClient) {
  const result = await client.query<{ last_value: number }>(
    `UPDATE payment_reference_counters SET last_value = last_value + 1 WHERE id = 1 RETURNING last_value`,
  );
  return `MX-PAY-${String(result.rows[0]?.last_value ?? 1).padStart(6, '0')}`;
}

function toDateOnly(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return value.toISOString().slice(0, 10);
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

function dueDateFromTerms(issueDate: string, terms: PaymentTerms) {
  const date = new Date(`${issueDate}T00:00:00.000Z`);
  const days = terms === 'NET_7' ? 7 : terms === 'NET_15' ? 15 : terms === 'NET_30' ? 30 : 0;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function resolveBillingOrganization(pool: Pool, actor: AuthContext, requested?: string) {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot manage billing configuration');
  }
  if (actor.orgType === 'OPERATOR') {
    return actor.orgId;
  }
  if (requested) {
    const found = await pool.query<{ type: string }>(
      `SELECT type::text AS type FROM organizations WHERE id = $1 AND deleted_at IS NULL`,
      [requested],
    );
    if (!found.rows[0] || found.rows[0].type !== 'OPERATOR') {
      throw notFound('Transporter organization not found');
    }
    return requested;
  }
  const fallback = await pool.query<{ id: string }>(
    `SELECT id FROM organizations WHERE type = 'OPERATOR' AND deleted_at IS NULL ORDER BY created_at LIMIT 1`,
  );
  if (!fallback.rows[0]) {
    throw unprocessable('No transporter organization is available');
  }
  return fallback.rows[0].id;
}

async function loadCustomerOrg(pool: Pool, actor: AuthContext, customerId: string) {
  const result = await pool.query<{
    id: string;
    name: string;
    type: string;
    parent_organization_id: string | null;
    default_currency_code: string;
  }>(
    `
      SELECT o.id, o.name, o.type::text AS type, o.parent_organization_id, o.default_currency_code
      FROM organizations o
      WHERE o.id = $1 AND o.deleted_at IS NULL
    `,
    [customerId],
  );
  const row = result.rows[0];
  if (!row || row.type !== 'CUSTOMER') {
    throw notFound('Customer not found');
  }
  if (actor.orgType === 'CUSTOMER' && actor.orgId !== row.id) {
    throw forbidden('You do not have access to this customer');
  }
  if (actor.orgType === 'OPERATOR' && row.parent_organization_id !== actor.orgId) {
    throw forbidden('Customer belongs to another organization');
  }
  const address = await pool.query<{ formatted_address: string }>(
    `
      SELECT formatted_address FROM addresses
      WHERE organization_id = $1 AND address_type = 'BILLING' AND deleted_at IS NULL
      ORDER BY is_default DESC, created_at
      LIMIT 1
    `,
    [customerId],
  );
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_organization_id,
    currencyCode: row.default_currency_code,
    billingAddress: address.rows[0]?.formatted_address ?? null,
  };
}

function assertCustomerBelongsToOperator(
  customer: { parentId: string | null },
  organizationId: string,
  actor: AuthContext,
) {
  if (actor.orgType === 'PLATFORM') {
    return;
  }
  if (customer.parentId && customer.parentId !== organizationId) {
    throw forbidden('Customer belongs to another transporter');
  }
}

function applyBillingVisibility(
  actor: AuthContext,
  where: string[],
  params: unknown[],
  orgColumn: string,
  customerColumn: string,
) {
  if (actor.orgType === 'PLATFORM') {
    return;
  }
  if (actor.orgType === 'OPERATOR') {
    params.push(actor.orgId);
    where.push(`${orgColumn} = $${params.length}`);
    return;
  }
  params.push(actor.orgId);
  where.push(`${customerColumn} = $${params.length}`);
}

function assertInvoiceAccess(actor: AuthContext, organizationId: string, customerId: string) {
  if (actor.orgType === 'PLATFORM') {
    return;
  }
  if (actor.orgType === 'OPERATOR' && actor.orgId === organizationId) {
    return;
  }
  if (actor.orgType === 'CUSTOMER' && actor.orgId === customerId) {
    return;
  }
  throw forbidden('You do not have access to this financial record');
}

function assertFinanceWrite(actor: AuthContext) {
  if (actor.orgType === 'CUSTOMER') {
    throw forbidden('Customer accounts cannot change invoices');
  }
}

function mapTaxRate(row: Record<string, unknown>): TaxRatePayload {
  return {
    id: String(row.id),
    name: String(row.name),
    code: String(row.code),
    ratePercent: String(row.rate_percent),
    countryCode: String(row.country_code),
    currencyCode: (row.currency_code as string | null) ?? null,
    active: Boolean(row.active),
  };
}

function mapService(row: Record<string, unknown>): BillableServicePayload {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    code: String(row.code),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    serviceType: row.service_type as BillableServicePayload['serviceType'],
    unit: row.unit as BillableServicePayload['unit'],
    defaultPrice: (row.default_price as string | null) ?? null,
    currencyCode: String(row.currency_code),
    taxRateId: (row.tax_rate_id as string | null) ?? null,
    taxRatePercent: (row.tax_rate_percent as string | null) ?? null,
    active: Boolean(row.active),
  };
}

function mapCustomerPrice(row: Record<string, unknown>): CustomerPricePayload {
  return {
    id: String(row.id),
    customerOrganizationId: String(row.customer_organization_id),
    serviceId: String(row.service_id),
    pricingBasis: row.pricing_basis as CustomerPricePayload['pricingBasis'],
    unitPrice: String(row.unit_price),
    currencyCode: String(row.currency_code),
    active: Boolean(row.active),
    notes: (row.notes as string | null) ?? null,
  };
}

function mapAdjustment(row: Record<string, unknown>): AdjustmentPayload {
  return {
    id: String(row.id),
    type: row.adjustment_type as AdjustmentPayload['type'],
    invoiceId: String(row.invoice_id),
    paymentId: (row.payment_id as string | null) ?? null,
    amount: String(row.amount),
    currencyCode: String(row.currency_code),
    reason: String(row.reason),
    createdAt: new Date(row.created_at as Date).toISOString(),
  };
}

export { minorToMoney };
