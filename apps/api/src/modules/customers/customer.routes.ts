import { Router } from 'express';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { sendSuccess } from '../../lib/http.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import {
  addressInputSchema,
  contactInputSchema,
  createCustomerSchema,
  listCustomersQuerySchema,
} from './customer.schemas.js';
import {
  addCustomerAddress,
  addCustomerContact,
  createCustomer,
  getCustomer,
  listCustomers,
} from './customer.service.js';

export const customerRouter = Router();

customerRouter.use(authenticate);

customerRouter.get(
  '/',
  requirePermission('customers.manage'),
  asyncHandler(async (req, res) => {
    const query = listCustomersQuerySchema.parse(req.query);
    const result = await listCustomers(getPool(), req.auth!, query);
    sendSuccess(res, result.customers, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);

customerRouter.post(
  '/',
  requirePermission('customers.manage'),
  asyncHandler(async (req, res) => {
    const body = createCustomerSchema.parse(req.body);
    const customer = await createCustomer(getPool(), req.auth!, body);
    sendSuccess(res, customer, 201);
  }),
);

customerRouter.get(
  '/:customerId',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const customerId = String(req.params.customerId);
    const canManage = auth.permissions.includes('customers.manage');
    const isOwnOrg = auth.orgId === customerId;
    if (!canManage && !isOwnOrg) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action',
          details: [],
          requestId: req.requestId,
        },
      });
      return;
    }
    const customer = await getCustomer(getPool(), auth, customerId);
    sendSuccess(res, customer);
  }),
);

customerRouter.post(
  '/:customerId/contacts',
  requirePermission('customers.manage'),
  asyncHandler(async (req, res) => {
    const body = contactInputSchema.parse(req.body);
    const id = await addCustomerContact(getPool(), req.auth!, String(req.params.customerId), body);
    sendSuccess(res, { id }, 201);
  }),
);

customerRouter.post(
  '/:customerId/addresses',
  requirePermission('customers.manage'),
  asyncHandler(async (req, res) => {
    const body = addressInputSchema.parse(req.body);
    const id = await addCustomerAddress(getPool(), req.auth!, String(req.params.customerId), body);
    sendSuccess(res, { id }, 201);
  }),
);
