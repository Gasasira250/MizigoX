import { Router } from 'express';
import { hasAnyPermission } from '@mizigox/shared';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { forbidden } from '../../lib/errors.js';
import { sendSuccess } from '../../lib/http.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAnyPermission } from '../../middleware/authorize.js';
import {
  cancelInvoiceSchema,
  confirmPaymentSchema,
  createAdjustmentSchema,
  createInvoiceSchema,
  createPaymentSchema,
  createServiceSchema,
  createTaxRateSchema,
  customerIdParamSchema,
  customerPriceSchema,
  invoiceIdParamSchema,
  invoiceItemInputSchema,
  itemIdParamSchema,
  listInvoicesQuerySchema,
  listPaymentsQuerySchema,
  paymentIdParamSchema,
  refundPaymentSchema,
  serviceIdParamSchema,
  updateInvoiceSchema,
  updateServiceSchema,
} from './billing.schemas.js';
import {
  addInvoiceItem,
  cancelInvoice,
  cancelPayment,
  confirmPayment,
  createAdjustment,
  createInvoice,
  createPayment,
  createService,
  createTaxRate,
  failPayment,
  getCustomerBalance,
  getFinanceSummary,
  getInvoiceDocument,
  issueInvoice,
  listCustomerPaymentHistory,
  listCustomerPrices,
  listInvoiceActivity,
  listInvoices,
  listOutstandingInvoices,
  listPayments,
  listServices,
  listTaxRates,
  loadInvoice,
  loadPayment,
  refundPayment,
  removeInvoiceItem,
  updateInvoice,
  updateInvoiceItem,
  updateService,
  upsertCustomerPrice,
} from './billing.service.js';

export const billingRouter = Router();
export const invoiceRouter = Router();
export const paymentRouter = Router();

billingRouter.use(authenticate);
invoiceRouter.use(authenticate);
paymentRouter.use(authenticate);

function invoiceIdOf(req: { params: Record<string, string | string[] | undefined> }) {
  return invoiceIdParamSchema.parse(req.params).invoiceId;
}

function paymentIdOf(req: { params: Record<string, string | string[] | undefined> }) {
  return paymentIdParamSchema.parse(req.params).paymentId;
}

function customerIdOf(req: { params: Record<string, string | string[] | undefined> }) {
  return customerIdParamSchema.parse(req.params).customerId;
}

function serviceIdOf(req: { params: Record<string, string | string[] | undefined> }) {
  return serviceIdParamSchema.parse(req.params).serviceId;
}

function itemIdsOf(req: { params: Record<string, string | string[] | undefined> }) {
  return itemIdParamSchema.parse(req.params);
}

billingRouter.get(
  '/taxes',
  requireAnyPermission('invoices.read', 'invoices.manage', 'finance.read'),
  asyncHandler(async (req, res) => {
    const countryCode =
      typeof req.query.countryCode === 'string' ? req.query.countryCode : undefined;
    sendSuccess(res, await listTaxRates(getPool(), countryCode));
  }),
);

billingRouter.post(
  '/taxes',
  requireAnyPermission('finance.manage', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    const body = createTaxRateSchema.parse(req.body);
    sendSuccess(res, await createTaxRate(getPool(), req.auth!, body), 201);
  }),
);

billingRouter.get(
  '/services',
  requireAnyPermission('invoices.read', 'invoices.create', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    const organizationId =
      typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
    sendSuccess(res, await listServices(getPool(), req.auth!, organizationId));
  }),
);

billingRouter.post(
  '/services',
  requireAnyPermission('invoices.manage', 'finance.manage'),
  asyncHandler(async (req, res) => {
    const body = createServiceSchema.parse(req.body);
    sendSuccess(res, await createService(getPool(), req.auth!, body), 201);
  }),
);

billingRouter.patch(
  '/services/:serviceId',
  requireAnyPermission('invoices.manage', 'finance.manage'),
  asyncHandler(async (req, res) => {
    const body = updateServiceSchema.parse(req.body);
    sendSuccess(res, await updateService(getPool(), req.auth!, serviceIdOf(req), body));
  }),
);

billingRouter.get(
  '/finance/summary',
  requireAnyPermission('finance.read', 'finance.manage', 'dashboard.finance'),
  asyncHandler(async (req, res) => {
    const organizationId =
      typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
    sendSuccess(res, await getFinanceSummary(getPool(), req.auth!, organizationId));
  }),
);

billingRouter.get(
  '/customers/:customerId/prices',
  requireAnyPermission('invoices.read', 'invoices.manage', 'finance.read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await listCustomerPrices(getPool(), req.auth!, customerIdOf(req)));
  }),
);

billingRouter.put(
  '/customers/:customerId/prices',
  requireAnyPermission('invoices.manage', 'finance.manage'),
  asyncHandler(async (req, res) => {
    const body = customerPriceSchema.parse(req.body);
    sendSuccess(res, await upsertCustomerPrice(getPool(), req.auth!, customerIdOf(req), body));
  }),
);

billingRouter.get(
  '/customers/:customerId/balance',
  requireAnyPermission('invoices.read', 'payments.read', 'finance.read', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getCustomerBalance(getPool(), req.auth!, customerIdOf(req)));
  }),
);

billingRouter.get(
  '/customers/:customerId/outstanding-invoices',
  requireAnyPermission('invoices.read', 'finance.read', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await listOutstandingInvoices(getPool(), req.auth!, customerIdOf(req)));
  }),
);

billingRouter.get(
  '/customers/:customerId/payment-history',
  requireAnyPermission('payments.read', 'finance.read', 'payments.manage'),
  asyncHandler(async (req, res) => {
    const result = await listCustomerPaymentHistory(getPool(), req.auth!, customerIdOf(req));
    sendSuccess(res, result.payments, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);

invoiceRouter.get(
  '/',
  requireAnyPermission('invoices.read', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    const query = listInvoicesQuerySchema.parse(req.query);
    const result = await listInvoices(getPool(), req.auth!, query);
    sendSuccess(res, result.invoices, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);

invoiceRouter.post(
  '/',
  requireAnyPermission('invoices.create', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    const body = createInvoiceSchema.parse(req.body);
    if (
      body.issue &&
      !hasAnyPermission(req.auth!.permissions, 'invoices.issue', 'invoices.manage')
    ) {
      throw forbidden('You do not have permission to issue invoices');
    }
    sendSuccess(res, await createInvoice(getPool(), req.auth!, body), 201);
  }),
);

invoiceRouter.get(
  '/:invoiceId',
  requireAnyPermission('invoices.read', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await loadInvoice(getPool(), req.auth!, invoiceIdOf(req)));
  }),
);

invoiceRouter.get(
  '/:invoiceId/document',
  requireAnyPermission('invoices.read', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getInvoiceDocument(getPool(), req.auth!, invoiceIdOf(req)));
  }),
);

invoiceRouter.get(
  '/:invoiceId/shipments',
  requireAnyPermission('invoices.read', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(getPool(), req.auth!, invoiceIdOf(req));
    sendSuccess(res, invoice.shipments);
  }),
);

invoiceRouter.get(
  '/:invoiceId/payments',
  requireAnyPermission('invoices.read', 'payments.read', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    const invoice = await loadInvoice(getPool(), req.auth!, invoiceIdOf(req));
    sendSuccess(res, invoice.payments);
  }),
);

invoiceRouter.get(
  '/:invoiceId/activity',
  requireAnyPermission('invoices.read', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await listInvoiceActivity(getPool(), req.auth!, invoiceIdOf(req)));
  }),
);

invoiceRouter.patch(
  '/:invoiceId',
  requireAnyPermission('invoices.update', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    const body = updateInvoiceSchema.parse(req.body);
    sendSuccess(res, await updateInvoice(getPool(), req.auth!, invoiceIdOf(req), body));
  }),
);

invoiceRouter.post(
  '/:invoiceId/items',
  requireAnyPermission('invoices.update', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    const body = invoiceItemInputSchema.parse(req.body);
    sendSuccess(res, await addInvoiceItem(getPool(), req.auth!, invoiceIdOf(req), body), 201);
  }),
);

invoiceRouter.patch(
  '/:invoiceId/items/:itemId',
  requireAnyPermission('invoices.update', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    const ids = itemIdsOf(req);
    const body = invoiceItemInputSchema.parse(req.body);
    sendSuccess(res, await updateInvoiceItem(getPool(), req.auth!, ids.invoiceId, ids.itemId, body));
  }),
);

invoiceRouter.delete(
  '/:invoiceId/items/:itemId',
  requireAnyPermission('invoices.update', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    const ids = itemIdsOf(req);
    sendSuccess(res, await removeInvoiceItem(getPool(), req.auth!, ids.invoiceId, ids.itemId));
  }),
);

invoiceRouter.post(
  '/:invoiceId/issue',
  requireAnyPermission('invoices.issue', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await issueInvoice(getPool(), req.auth!, invoiceIdOf(req)));
  }),
);

invoiceRouter.post(
  '/:invoiceId/cancel',
  requireAnyPermission('invoices.cancel', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    const body = cancelInvoiceSchema.parse(req.body ?? {});
    sendSuccess(
      res,
      await cancelInvoice(getPool(), req.auth!, invoiceIdOf(req), body.mode ?? 'CANCELLED'),
    );
  }),
);

invoiceRouter.post(
  '/:invoiceId/void',
  requireAnyPermission('invoices.cancel', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await cancelInvoice(getPool(), req.auth!, invoiceIdOf(req), 'VOID'));
  }),
);

invoiceRouter.post(
  '/:invoiceId/adjustments',
  requireAnyPermission('finance.manage', 'invoices.manage'),
  asyncHandler(async (req, res) => {
    const body = createAdjustmentSchema.parse(req.body);
    sendSuccess(res, await createAdjustment(getPool(), req.auth!, invoiceIdOf(req), body), 201);
  }),
);

paymentRouter.get(
  '/',
  requireAnyPermission('payments.read', 'payments.manage', 'payments.record'),
  asyncHandler(async (req, res) => {
    const query = listPaymentsQuerySchema.parse(req.query);
    const result = await listPayments(getPool(), req.auth!, query);
    sendSuccess(res, result.payments, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);

paymentRouter.post(
  '/',
  requireAnyPermission('payments.create', 'payments.record', 'payments.manage'),
  asyncHandler(async (req, res) => {
    const body = createPaymentSchema.parse(req.body);
    sendSuccess(res, await createPayment(getPool(), req.auth!, body), 201);
  }),
);

paymentRouter.get(
  '/:paymentId',
  requireAnyPermission('payments.read', 'payments.manage', 'payments.record'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await loadPayment(getPool(), req.auth!, paymentIdOf(req)));
  }),
);

paymentRouter.post(
  '/:paymentId/confirm',
  requireAnyPermission('payments.manage', 'payments.record'),
  asyncHandler(async (req, res) => {
    const body = confirmPaymentSchema.parse(req.body ?? {});
    sendSuccess(res, await confirmPayment(getPool(), req.auth!, paymentIdOf(req), body));
  }),
);

paymentRouter.post(
  '/:paymentId/fail',
  requireAnyPermission('payments.manage', 'payments.update'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await failPayment(getPool(), req.auth!, paymentIdOf(req)));
  }),
);

paymentRouter.post(
  '/:paymentId/cancel',
  requireAnyPermission('payments.manage', 'payments.update'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await cancelPayment(getPool(), req.auth!, paymentIdOf(req)));
  }),
);

paymentRouter.post(
  '/:paymentId/refund',
  requireAnyPermission('payments.refund', 'payments.manage'),
  asyncHandler(async (req, res) => {
    const body = refundPaymentSchema.parse(req.body);
    sendSuccess(res, await refundPayment(getPool(), req.auth!, paymentIdOf(req), body.reason));
  }),
);
