import { Router } from 'express';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { sendSuccess } from '../../lib/http.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import {
  createShipmentSchema,
  listShipmentsQuerySchema,
  updateShipmentStatusSchema,
} from './shipment.schemas.js';
import {
  createShipment,
  listShipments,
  loadShipment,
  updateShipmentStatus,
} from './shipment.service.js';

export const shipmentRouter = Router();

shipmentRouter.use(authenticate);

shipmentRouter.get(
  '/',
  requirePermission('shipments.read'),
  asyncHandler(async (req, res) => {
    const query = listShipmentsQuerySchema.parse(req.query);
    const result = await listShipments(getPool(), req.auth!, query);
    sendSuccess(res, result.shipments, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);

shipmentRouter.post(
  '/',
  requirePermission('shipments.create'),
  asyncHandler(async (req, res) => {
    const body = createShipmentSchema.parse(req.body);
    const shipment = await createShipment(getPool(), req.auth!, body);
    sendSuccess(res, shipment, 201);
  }),
);

shipmentRouter.get(
  '/:shipmentId',
  requirePermission('shipments.read'),
  asyncHandler(async (req, res) => {
    const shipment = await loadShipment(getPool(), req.auth!, String(req.params.shipmentId));
    sendSuccess(res, shipment);
  }),
);

shipmentRouter.get(
  '/:shipmentId/events',
  requirePermission('shipments.read'),
  asyncHandler(async (req, res) => {
    const shipment = await loadShipment(getPool(), req.auth!, String(req.params.shipmentId));
    sendSuccess(res, shipment.events);
  }),
);

shipmentRouter.post(
  '/:shipmentId/status',
  requirePermission('shipments.update_status'),
  asyncHandler(async (req, res) => {
    const body = updateShipmentStatusSchema.parse(req.body);
    const shipment = await updateShipmentStatus(
      getPool(),
      req.auth!,
      String(req.params.shipmentId),
      body,
    );
    sendSuccess(res, shipment);
  }),
);
