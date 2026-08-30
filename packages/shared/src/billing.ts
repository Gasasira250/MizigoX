import { hasAnyPermission } from './customers.js';

export const BILLING_CURRENCIES = ['RWF', 'UGX', 'KES', 'TZS', 'BIF', 'SSP', 'USD'] as const;
export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

export const SERVICE_TYPES = [
  'FREIGHT',
  'DELIVERY',
  'PICKUP',
  'STORAGE',
  'HANDLING',
  'OTHER',
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_UNITS = ['TRIP', 'SHIPMENT', 'KG', 'KM', 'PACKAGE', 'HOUR', 'DAY', 'OTHER'] as const;
export type ServiceUnit = (typeof SERVICE_UNITS)[number];

export const PRICING_BASES = ['FLAT', 'PER_KG', 'PER_KM', 'PER_PACKAGE', 'CONTRACT'] as const;
export type PricingBasis = (typeof PRICING_BASES)[number];

export const INVOICE_STATUSES = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'VOID',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  DRAFT: ['ISSUED', 'CANCELLED', 'VOID'],
  ISSUED: ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID'],
  PARTIALLY_PAID: ['PAID', 'OVERDUE', 'CANCELLED'],
  PAID: [],
  OVERDUE: ['PARTIALLY_PAID', 'PAID', 'CANCELLED'],
  CANCELLED: [],
  VOID: [],
};

export const PAYMENT_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SUCCESSFUL',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CARD', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_PROVIDERS = ['MANUAL', 'MOBILE_MONEY', 'BANK', 'CARD_GATEWAY', 'OTHER'] as const;
export type PaymentProviderCode = (typeof PAYMENT_PROVIDERS)[number];

export const ADJUSTMENT_TYPES = ['CREDIT', 'DEBIT', 'REFUND'] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

export const PAYMENT_TERMS = [
  'DUE_ON_RECEIPT',
  'NET_7',
  'NET_15',
  'NET_30',
  'CUSTOM',
] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];

export const INVOICE_SORT_FIELDS = [
  'number',
  'issueDate',
  'dueDate',
  'total',
  'status',
  'customerName',
  'createdAt',
] as const;
export type InvoiceSortField = (typeof INVOICE_SORT_FIELDS)[number];

export const PAYMENT_SORT_FIELDS = ['createdAt', 'paidAt', 'amount', 'status', 'reference'] as const;
export type PaymentSortField = (typeof PAYMENT_SORT_FIELDS)[number];

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus) {
  return INVOICE_TRANSITIONS[from].includes(to);
}

export function isOpenReceivable(status: string) {
  return status === 'ISSUED' || status === 'PARTIALLY_PAID' || status === 'OVERDUE';
}

export function invoiceStatusLabel(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function paymentStatusLabel(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function paymentMethodLabel(method: string) {
  return method.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function canReadInvoices(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'invoices.manage', 'invoices.read');
}

export function canCreateInvoices(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'invoices.manage', 'invoices.create');
}

export function canUpdateInvoices(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'invoices.manage', 'invoices.update');
}

export function canIssueInvoices(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'invoices.manage', 'invoices.issue');
}

export function canCancelInvoices(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'invoices.manage', 'invoices.cancel');
}

export function canReadPayments(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'payments.manage', 'payments.read', 'payments.record');
}

export function canCreatePayments(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'payments.manage', 'payments.create', 'payments.record');
}

export function canConfirmPayments(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'payments.manage', 'payments.record');
}

export function canRefundPayments(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'payments.manage', 'payments.refund');
}

export function canReadFinance(granted: readonly string[] | undefined) {
  return hasAnyPermission(granted, 'finance.manage', 'finance.read', 'dashboard.finance');
}

export interface TaxRatePayload {
  id: string;
  name: string;
  code: string;
  ratePercent: string;
  countryCode: string;
  currencyCode: string | null;
  active: boolean;
}

export interface BillableServicePayload {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description: string | null;
  serviceType: ServiceType;
  unit: ServiceUnit;
  defaultPrice: string | null;
  currencyCode: string;
  taxRateId: string | null;
  taxRatePercent: string | null;
  active: boolean;
}

export interface CustomerPricePayload {
  id: string;
  customerOrganizationId: string;
  serviceId: string;
  pricingBasis: PricingBasis;
  unitPrice: string;
  currencyCode: string;
  active: boolean;
  notes: string | null;
}

export interface InvoiceItemPayload {
  id: string;
  serviceId: string | null;
  serviceCode: string | null;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountAmount: string;
  taxRatePercent: string;
  taxAmount: string;
  lineSubtotal: string;
  lineTotal: string;
  shipmentId: string | null;
  shipmentReference: string | null;
}

export interface InvoiceShipmentPayload {
  shipmentId: string;
  reference: string;
  status: string;
}

export interface InvoicePaymentPayload {
  id: string;
  reference: string;
  amount: string;
  currencyCode: string;
  method: PaymentMethod;
  status: PaymentStatus;
  provider: PaymentProviderCode;
  providerReference: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface InvoicePayload {
  id: string;
  number: string;
  organizationId: string;
  organizationName: string;
  customerOrganizationId: string;
  customerName: string;
  status: InvoiceStatus;
  currencyCode: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  amountDue: string;
  issueDate: string | null;
  dueDate: string | null;
  paymentTerms: PaymentTerms;
  notes: string | null;
  billingAddress: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  items: InvoiceItemPayload[];
  shipments: InvoiceShipmentPayload[];
  payments: InvoicePaymentPayload[];
}

export interface PaymentPayload {
  id: string;
  reference: string;
  invoiceId: string;
  invoiceNumber: string;
  organizationId: string;
  customerOrganizationId: string;
  customerName: string;
  amount: string;
  currencyCode: string;
  method: PaymentMethod;
  status: PaymentStatus;
  provider: PaymentProviderCode;
  providerReference: string | null;
  paidAt: string | null;
  notes: string | null;
  idempotencyKey: string | null;
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerBalancePayload {
  customerOrganizationId: string;
  customerName: string;
  currencyCode: string;
  totalInvoiced: string;
  totalPaid: string;
  outstandingBalance: string;
  overdueAmount: string;
  openInvoiceCount: number;
}

export interface FinanceSummaryPayload {
  currencyCode: string;
  totalRevenue: string;
  amountPaid: string;
  amountDue: string;
  outstandingInvoiceCount: number;
  overdueInvoiceCount: number;
  overdueAmount: string;
}

export interface InvoiceDocumentPayload {
  invoiceNumber: string;
  status: InvoiceStatus;
  currencyCode: string;
  issueDate: string | null;
  dueDate: string | null;
  paymentTerms: string;
  notes: string | null;
  seller: {
    name: string;
    legalName: string | null;
    taxId: string | null;
    countryCode: string;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  buyer: {
    name: string;
    legalName: string | null;
    taxId: string | null;
    countryCode: string;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  items: Array<{
    description: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    discountAmount: string;
    taxRatePercent: string;
    taxAmount: string;
    lineTotal: string;
    shipmentReference: string | null;
  }>;
  totals: {
    subtotal: string;
    discountAmount: string;
    taxAmount: string;
    totalAmount: string;
    amountPaid: string;
    amountDue: string;
  };
  payments: Array<{
    reference: string;
    method: string;
    status: string;
    amount: string;
    paidAt: string | null;
  }>;
}

export interface AdjustmentPayload {
  id: string;
  type: AdjustmentType;
  invoiceId: string;
  paymentId: string | null;
  amount: string;
  currencyCode: string;
  reason: string;
  createdAt: string;
}
