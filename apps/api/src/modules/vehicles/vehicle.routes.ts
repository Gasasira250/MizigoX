import { Router } from 'express';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { sendSuccess } from '../../lib/http.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAnyPermission } from '../../middleware/authorize.js';
import {
  createVehicleSchema,
  listVehiclesQuerySchema,
  updateVehicleSchema,
  updateVehicleStatusSchema,
  vehicleDocumentFieldsSchema,
  vehicleDocumentIdParamSchema,
  vehicleDocumentSchema,
  vehicleIdParamSchema,
} from './vehicle.schemas.js';
import {
  addVehicleDocument,
  archiveVehicle,
  createVehicle,
  listVehicleActivity,
  listVehicleTypes,
  listVehicles,
  loadVehicle,
  removeVehicleDocument,
  updateVehicle,
  updateVehicleDocument,
  updateVehicleStatus,
} from './vehicle.service.js';

export const vehicleRouter = Router();

vehicleRouter.use(authenticate);

function vehicleIdOf(req: { params: Record<string, string | string[] | undefined> }) {
  return vehicleIdParamSchema.parse(req.params).vehicleId;
}

vehicleRouter.get(
  '/types',
  requireAnyPermission('vehicles.manage', 'fleet.manage', 'vehicles.read'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await listVehicleTypes(getPool()));
  }),
);

vehicleRouter.get(
  '/',
  requireAnyPermission('vehicles.manage', 'fleet.manage', 'vehicles.read'),
  asyncHandler(async (req, res) => {
    const query = listVehiclesQuerySchema.parse(req.query);
    const result = await listVehicles(getPool(), req.auth!, query);
    sendSuccess(res, result.vehicles, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);

vehicleRouter.post(
  '/',
  requireAnyPermission('vehicles.manage', 'fleet.manage', 'vehicles.create'),
  asyncHandler(async (req, res) => {
    const vehicle = await createVehicle(getPool(), req.auth!, createVehicleSchema.parse(req.body));
    sendSuccess(res, vehicle, 201);
  }),
);

vehicleRouter.get(
  '/:vehicleId',
  requireAnyPermission('vehicles.manage', 'fleet.manage', 'vehicles.read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await loadVehicle(getPool(), req.auth!, vehicleIdOf(req)));
  }),
);

vehicleRouter.patch(
  '/:vehicleId',
  requireAnyPermission('vehicles.manage', 'fleet.manage', 'vehicles.update'),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await updateVehicle(
        getPool(),
        req.auth!,
        vehicleIdOf(req),
        updateVehicleSchema.parse(req.body),
      ),
    );
  }),
);

vehicleRouter.delete(
  '/:vehicleId',
  requireAnyPermission('vehicles.manage', 'fleet.manage', 'vehicles.delete'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await archiveVehicle(getPool(), req.auth!, vehicleIdOf(req)));
  }),
);

vehicleRouter.post(
  '/:vehicleId/status',
  requireAnyPermission('vehicles.manage', 'fleet.manage', 'vehicles.status_update'),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await updateVehicleStatus(
        getPool(),
        req.auth!,
        vehicleIdOf(req),
        updateVehicleStatusSchema.parse(req.body),
      ),
    );
  }),
);

vehicleRouter.get(
  '/:vehicleId/activity',
  requireAnyPermission('vehicles.manage', 'fleet.manage', 'vehicles.read', 'audit.read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await listVehicleActivity(getPool(), req.auth!, vehicleIdOf(req)));
  }),
);

vehicleRouter.get(
  '/:vehicleId/documents',
  requireAnyPermission(
    'vehicle_documents.manage',
    'vehicles.manage',
    'fleet.manage',
    'vehicle_documents.read',
  ),
  asyncHandler(async (req, res) => {
    const vehicle = await loadVehicle(getPool(), req.auth!, vehicleIdOf(req));
    sendSuccess(res, vehicle.documents);
  }),
);

vehicleRouter.post(
  '/:vehicleId/documents',
  requireAnyPermission(
    'vehicle_documents.manage',
    'vehicles.manage',
    'fleet.manage',
    'vehicle_documents.create',
  ),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await addVehicleDocument(
        getPool(),
        req.auth!,
        vehicleIdOf(req),
        vehicleDocumentSchema.parse(req.body),
      ),
      201,
    );
  }),
);

vehicleRouter.patch(
  '/:vehicleId/documents/:documentId',
  requireAnyPermission(
    'vehicle_documents.manage',
    'vehicles.manage',
    'fleet.manage',
    'vehicle_documents.update',
  ),
  asyncHandler(async (req, res) => {
    const params = vehicleDocumentIdParamSchema.parse(req.params);
    sendSuccess(
      res,
      await updateVehicleDocument(
        getPool(),
        req.auth!,
        params.vehicleId,
        params.documentId,
        vehicleDocumentFieldsSchema.partial().parse(req.body),
      ),
    );
  }),
);

vehicleRouter.delete(
  '/:vehicleId/documents/:documentId',
  requireAnyPermission(
    'vehicle_documents.manage',
    'vehicles.manage',
    'fleet.manage',
    'vehicle_documents.delete',
  ),
  asyncHandler(async (req, res) => {
    const params = vehicleDocumentIdParamSchema.parse(req.params);
    sendSuccess(
      res,
      await removeVehicleDocument(getPool(), req.auth!, params.vehicleId, params.documentId),
    );
  }),
);
