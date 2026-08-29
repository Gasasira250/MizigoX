import { Router } from 'express';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { sendSuccess } from '../../lib/http.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAnyPermission } from '../../middleware/authorize.js';
import {
  createDriverSchema,
  driverDocumentFieldsSchema,
  driverDocumentIdParamSchema,
  driverDocumentSchema,
  driverIdParamSchema,
  listDriversQuerySchema,
  updateDriverSchema,
  updateDriverStatusSchema,
} from './driver.schemas.js';
import {
  addDriverDocument,
  archiveDriver,
  createDriver,
  listDriverActivity,
  listDrivers,
  listLinkableUsers,
  loadDriver,
  removeDriverDocument,
  updateDriver,
  updateDriverDocument,
  updateDriverStatus,
} from './driver.service.js';

export const driverRouter = Router();

driverRouter.use(authenticate);

function driverIdOf(req: { params: Record<string, string | string[] | undefined> }) {
  return driverIdParamSchema.parse(req.params).driverId;
}

driverRouter.get(
  '/linkable-users',
  requireAnyPermission(
    'drivers.manage',
    'fleet.manage',
    'drivers.read',
    'drivers.create',
    'drivers.update',
  ),
  asyncHandler(async (req, res) => {
    const organizationId =
      typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined;
    sendSuccess(res, await listLinkableUsers(getPool(), req.auth!, organizationId));
  }),
);

driverRouter.get(
  '/',
  requireAnyPermission('drivers.manage', 'fleet.manage', 'drivers.read'),
  asyncHandler(async (req, res) => {
    const query = listDriversQuerySchema.parse(req.query);
    const result = await listDrivers(getPool(), req.auth!, query);
    sendSuccess(res, result.drivers, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);

driverRouter.post(
  '/',
  requireAnyPermission('drivers.manage', 'fleet.manage', 'drivers.create'),
  asyncHandler(async (req, res) => {
    const driver = await createDriver(getPool(), req.auth!, createDriverSchema.parse(req.body));
    sendSuccess(res, driver, 201);
  }),
);

driverRouter.get(
  '/:driverId',
  requireAnyPermission('drivers.manage', 'fleet.manage', 'drivers.read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await loadDriver(getPool(), req.auth!, driverIdOf(req)));
  }),
);

driverRouter.patch(
  '/:driverId',
  requireAnyPermission('drivers.manage', 'fleet.manage', 'drivers.update'),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await updateDriver(getPool(), req.auth!, driverIdOf(req), updateDriverSchema.parse(req.body)),
    );
  }),
);

driverRouter.delete(
  '/:driverId',
  requireAnyPermission('drivers.manage', 'fleet.manage', 'drivers.delete'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await archiveDriver(getPool(), req.auth!, driverIdOf(req)));
  }),
);

driverRouter.post(
  '/:driverId/status',
  requireAnyPermission('drivers.manage', 'fleet.manage', 'drivers.status_update'),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await updateDriverStatus(
        getPool(),
        req.auth!,
        driverIdOf(req),
        updateDriverStatusSchema.parse(req.body),
      ),
    );
  }),
);

driverRouter.get(
  '/:driverId/activity',
  requireAnyPermission('drivers.manage', 'fleet.manage', 'drivers.read', 'audit.read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await listDriverActivity(getPool(), req.auth!, driverIdOf(req)));
  }),
);

driverRouter.get(
  '/:driverId/documents',
  requireAnyPermission(
    'driver_documents.manage',
    'drivers.manage',
    'fleet.manage',
    'driver_documents.read',
  ),
  asyncHandler(async (req, res) => {
    const driver = await loadDriver(getPool(), req.auth!, driverIdOf(req));
    sendSuccess(res, driver.documents);
  }),
);

driverRouter.post(
  '/:driverId/documents',
  requireAnyPermission(
    'driver_documents.manage',
    'drivers.manage',
    'fleet.manage',
    'driver_documents.create',
  ),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await addDriverDocument(
        getPool(),
        req.auth!,
        driverIdOf(req),
        driverDocumentSchema.parse(req.body),
      ),
      201,
    );
  }),
);

driverRouter.patch(
  '/:driverId/documents/:documentId',
  requireAnyPermission(
    'driver_documents.manage',
    'drivers.manage',
    'fleet.manage',
    'driver_documents.update',
  ),
  asyncHandler(async (req, res) => {
    const params = driverDocumentIdParamSchema.parse(req.params);
    sendSuccess(
      res,
      await updateDriverDocument(
        getPool(),
        req.auth!,
        params.driverId,
        params.documentId,
        driverDocumentFieldsSchema.partial().parse(req.body),
      ),
    );
  }),
);

driverRouter.delete(
  '/:driverId/documents/:documentId',
  requireAnyPermission(
    'driver_documents.manage',
    'drivers.manage',
    'fleet.manage',
    'driver_documents.delete',
  ),
  asyncHandler(async (req, res) => {
    const params = driverDocumentIdParamSchema.parse(req.params);
    sendSuccess(
      res,
      await removeDriverDocument(getPool(), req.auth!, params.driverId, params.documentId),
    );
  }),
);
