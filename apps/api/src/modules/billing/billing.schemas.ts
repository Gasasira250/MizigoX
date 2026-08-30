import {
  ADJUSTMENT_TYPES,
  BILLING_CURRENCIES,
  INVOICE_SORT_FIELDS,
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_PROVIDERS,
  PAYMENT_SORT_FIELDS,
  PAYMENT_TERMS,
  PRICING_BASES,
  SERVICE_TYPES,
  SERVICE_UNITS,
} from '@mizigox/shared';
import { z } from 'zod';

const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, 'Enter a non-negative amount with up to 2 decimal places');

const quantityString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/, 'Enter a positive quantity with up to 3 decimal places');

export const invoiceItemInputSchema = z.object({
  serviceId: z.string().uuid().optional(),
  shipmentId: z.string().uuid().optional(),
  description: z.string().trim().min(1).max(240).optional(),
  quantity: quantityString,
  unit: z.enum(SERVICE_UNITS).optional(),
  unitPrice: moneyString.optional(),
  discountAmount: moneyString.optional(),
  taxRatePercent: moneyString.optional(),
});

export const createInvoiceSchema = z.object({
  organizationId: z.string().uuid().optional(),
  customerOrganizationId: z.string().uuid(),
  currencyCode: z.enum(BILLING_CURRENCIES).optional(),
  paymentTerms: z.enum(PAYMENT_TERMS).optional(),
  issueDate: z.string().date().optional(),
  dueDate: z.string().date().optional(),
  notes: z.string().trim().max(2000).optional(),
  billingAddress: z.string().trim().max(500).optional(),
  shipmentIds: z.array(z.string().uuid()).max(50).optional(),
  items: z.array(invoiceItemInputSchema).max(100).optional(),
  issue: z.boolean().optional(),
});

export const updateInvoiceSchema = z.object({
  paymentTerms: z.enum(PAYMENT_TERMS).optional(),
  issueDate: z.string().date().optional(),
  dueDate: z.string().date().optional(),
  notes: z.string().trim().max(2000).optional(),
  billingAddress: z.string().trim().max(500).optional(),
  shipmentIds: z.array(z.string().uuid()).max(50).optional(),
});

export const listInvoicesQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  customerId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  sort: z.enum(INVOICE_SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: moneyString,
  method: z.enum(PAYMENT_METHODS),
  provider: z.enum(PAYMENT_PROVIDERS).optional(),
  providerReference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  paidAt: z.string().datetime({ offset: true }).optional(),
  idempotencyKey: z.string().trim().min(8).max(80).optional(),
});

export const listPaymentsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  invoiceId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  sort: z.enum(PAYMENT_SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createAdjustmentSchema = z.object({
  type: z.enum(ADJUSTMENT_TYPES),
  amount: moneyString,
  reason: z.string().trim().min(3).max(240),
  paymentId: z.string().uuid().optional(),
});

export const customerPriceSchema = z.object({
  serviceId: z.string().uuid(),
  pricingBasis: z.enum(PRICING_BASES),
  unitPrice: moneyString,
  currencyCode: z.enum(BILLING_CURRENCIES).optional(),
  notes: z.string().trim().max(240).optional(),
  active: z.boolean().optional(),
});

export const createServiceSchema = z.object({
  organizationId: z.string().uuid().optional(),
  code: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  serviceType: z.enum(SERVICE_TYPES),
  unit: z.enum(SERVICE_UNITS),
  defaultPrice: moneyString.optional(),
  currencyCode: z.enum(BILLING_CURRENCIES).optional(),
  taxRateId: z.string().uuid().optional(),
  active: z.boolean().optional(),
});

export const invoiceIdParamSchema = z.object({ invoiceId: z.string().uuid() });
export const paymentIdParamSchema = z.object({ paymentId: z.string().uuid() });
export const itemIdParamSchema = z.object({
  invoiceId: z.string().uuid(),
  itemId: z.string().uuid(),
});
export const customerIdParamSchema = z.object({ customerId: z.string().uuid() });
export const serviceIdParamSchema = z.object({ serviceId: z.string().uuid() });

export const confirmPaymentSchema = z.object({
  providerTransactionId: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const refundPaymentSchema = z.object({
  reason: z.string().trim().min(3).max(240),
});

export const cancelInvoiceSchema = z.object({
  mode: z.enum(['CANCELLED', 'VOID']).optional(),
  reason: z.string().trim().max(500).optional(),
});

export const updateServiceSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  defaultPrice: moneyString.optional(),
  taxRateId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
});

export const createTaxRateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(40),
  ratePercent: moneyString,
  countryCode: z.string().trim().length(2),
  currencyCode: z.enum(BILLING_CURRENCIES).optional(),
  active: z.boolean().optional(),
});

export const providerWebhookSchema = z.object({
  eventId: z.string().trim().min(8).max(120),
  paymentReference: z.string().trim().min(3).max(80),
  status: z.enum(['SUCCESSFUL', 'FAILED', 'CANCELLED']),
  providerTransactionId: z.string().trim().min(1).max(120).optional(),
});

export const providerParamSchema = z.object({
  provider: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((value) => value.toUpperCase().replaceAll('-', '_')),
});
