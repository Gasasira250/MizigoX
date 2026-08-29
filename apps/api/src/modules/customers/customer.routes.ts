import { Router } from 'express';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { sendSuccess } from '../../lib/http.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAnyPermission } from '../../middleware/authorize.js';
import {
  addressInputSchema,
  contactInputSchema,
  updateAddressSchema,
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from './customer.schemas.js';
import {
  addCustomerAddress,
  addCustomerContact,
  archiveCustomer,
  createCustomer,
  getCustomer,
  listCustomers,
  removeCustomerAddress,
  removeCustomerContact,
  setCustomerActive,
  updateCustomer,
  updateCustomerAddress,
  updateCustomerContact,
} from './customer.service.js';

export const customerRouter = Router();

customerRouter.use(authenticate);

customerRouter.get(
  '/',
  requireAnyPermission('customers.manage', 'customers.read'),
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
  requireAnyPermission('customers.manage', 'customers.create'),
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
    const canRead =
      auth.permissions.includes('customers.manage') || auth.permissions.includes('customers.read');
    const isOwnOrg = auth.orgId === customerId;
    if (!canRead && !isOwnOrg) {
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

customerRouter.patch(
  '/:customerId',
  requireAnyPermission('customers.manage', 'customers.update'),
  asyncHandler(async (req, res) => {
    const body = updateCustomerSchema.parse(req.body);
    const customer = await updateCustomer(
      getPool(),
      req.auth!,
      String(req.params.customerId),
      body,
    );
    sendSuccess(res, customer);
  }),
);

customerRouter.post(
  '/:customerId/activate',
  requireAnyPermission('customers.manage', 'customers.update'),
  asyncHandler(async (req, res) => {
    const customer = await setCustomerActive(
      getPool(),
      req.auth!,
      String(req.params.customerId),
      true,
    );
    sendSuccess(res, customer);
  }),
);

customerRouter.post(
  '/:customerId/deactivate',
  requireAnyPermission('customers.manage', 'customers.update'),
  asyncHandler(async (req, res) => {
    const customer = await setCustomerActive(
      getPool(),
      req.auth!,
      String(req.params.customerId),
      false,
    );
    sendSuccess(res, customer);
  }),
);

customerRouter.delete(
  '/:customerId',
  requireAnyPermission('customers.manage', 'customers.delete'),
  asyncHandler(async (req, res) => {
    const result = await archiveCustomer(getPool(), req.auth!, String(req.params.customerId));
    sendSuccess(res, result);
  }),
);

customerRouter.post(
  '/:customerId/contacts',
  requireAnyPermission('customers.manage', 'customers.update'),
  asyncHandler(async (req, res) => {
    const body = contactInputSchema.parse(req.body);
    const contact = await addCustomerContact(
      getPool(),
      req.auth!,
      String(req.params.customerId),
      body,
    );
    sendSuccess(res, contact, 201);
  }),
);

customerRouter.patch(
  '/:customerId/contacts/:contactId',
  requireAnyPermission('customers.manage', 'customers.update'),
  asyncHandler(async (req, res) => {
    const body = contactInputSchema.partial().parse(req.body);
    const contact = await updateCustomerContact(
      getPool(),
      req.auth!,
      String(req.params.customerId),
      String(req.params.contactId),
      body,
    );
    sendSuccess(res, contact);
  }),
);

customerRouter.delete(
  '/:customerId/contacts/:contactId',
  requireAnyPermission('customers.manage', 'customers.update'),
  asyncHandler(async (req, res) => {
    const result = await removeCustomerContact(
      getPool(),
      req.auth!,
      String(req.params.customerId),
      String(req.params.contactId),
    );
    sendSuccess(res, result);
  }),
);

customerRouter.post(
  '/:customerId/addresses',
  requireAnyPermission('customers.manage', 'customers.update'),
  asyncHandler(async (req, res) => {
    const body = addressInputSchema.parse(req.body);
    const address = await addCustomerAddress(
      getPool(),
      req.auth!,
      String(req.params.customerId),
      body,
    );
    sendSuccess(res, address, 201);
  }),
);

customerRouter.patch(
  '/:customerId/addresses/:addressId',
  requireAnyPermission('customers.manage', 'customers.update'),
  asyncHandler(async (req, res) => {
    const body = updateAddressSchema.parse(req.body);
    const address = await updateCustomerAddress(
      getPool(),
      req.auth!,
      String(req.params.customerId),
      String(req.params.addressId),
      body,
    );
    sendSuccess(res, address);
  }),
);

customerRouter.delete(
  '/:customerId/addresses/:addressId',
  requireAnyPermission('customers.manage', 'customers.update'),
  asyncHandler(async (req, res) => {
    const result = await removeCustomerAddress(
      getPool(),
      req.auth!,
      String(req.params.customerId),
      String(req.params.addressId),
    );
    sendSuccess(res, result);
  }),
);
