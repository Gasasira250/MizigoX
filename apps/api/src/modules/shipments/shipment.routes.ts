import { Router } from 'express';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { sendSuccess } from '../../lib/http.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAnyPermission } from '../../middleware/authorize.js';
import {
  createShipmentSchema,
  listShipmentsQuerySchema,
  shipmentIdParamSchema,
  shipmentItemSchema,
  updateShipmentSchema,
  updateShipmentStatusSchema,
} from './shipment.schemas.js';
import {
  addShipmentItem,
  archiveShipment,
  cancelShipment,
  createShipment,
  listShipments,
  loadShipment,
  removeShipmentItem,
  updateShipment,
  updateShipmentItem,
  updateShipmentStatus,
} from './shipment.service.js';

export const shipmentRouter = Router();

shipmentRouter.use(authenticate);

function shipmentIdOf(req: { params: Record<string, string | string[] | undefined> }) {
  return shipmentIdParamSchema.parse(req.params).shipmentId;
}

shipmentRouter.get(
  '/',
  requireAnyPermission('shipments.manage', 'shipments.read'),
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
  requireAnyPermission('shipments.manage', 'shipments.create'),
  asyncHandler(async (req, res) => {
    const body = createShipmentSchema.parse(req.body);
    const shipment = await createShipment(getPool(), req.auth!, body);
    sendSuccess(res, shipment, 201);
  }),
);

shipmentRouter.get(
  '/:shipmentId',
  requireAnyPermission('shipments.manage', 'shipments.read'),
  asyncHandler(async (req, res) => {
    const shipment = await loadShipment(getPool(), req.auth!, shipmentIdOf(req));
    sendSuccess(res, shipment);
  }),
);

shipmentRouter.patch(
  '/:shipmentId',
  requireAnyPermission('shipments.manage', 'shipments.update'),
  asyncHandler(async (req, res) => {
    const body = updateShipmentSchema.parse(req.body);
    const shipment = await updateShipment(getPool(), req.auth!, shipmentIdOf(req), body);
    sendSuccess(res, shipment);
  }),
);

shipmentRouter.delete(
  '/:shipmentId',
  requireAnyPermission('shipments.manage', 'shipments.delete'),
  asyncHandler(async (req, res) => {
    const result = await archiveShipment(getPool(), req.auth!, shipmentIdOf(req));
    sendSuccess(res, result);
  }),
);

shipmentRouter.get(
  '/:shipmentId/events',
  requireAnyPermission('shipments.manage', 'shipments.view_history', 'shipments.read'),
  asyncHandler(async (req, res) => {
    const shipment = await loadShipment(getPool(), req.auth!, shipmentIdOf(req));
    sendSuccess(res, shipment.events);
  }),
);

shipmentRouter.post(
  '/:shipmentId/status',
  requireAnyPermission('shipments.manage', 'shipments.update_status'),
  asyncHandler(async (req, res) => {
    const body = updateShipmentStatusSchema.parse(req.body);
    const shipment = await updateShipmentStatus(getPool(), req.auth!, shipmentIdOf(req), body);
    sendSuccess(res, shipment);
  }),
);

shipmentRouter.post(
  '/:shipmentId/cancel',
  requireAnyPermission('shipments.manage', 'shipments.update_status', 'shipments.update'),
  asyncHandler(async (req, res) => {
    const shipment = await cancelShipment(getPool(), req.auth!, shipmentIdOf(req));
    sendSuccess(res, shipment);
  }),
);

shipmentRouter.post(
  '/:shipmentId/items',
  requireAnyPermission('shipments.manage', 'shipments.update'),
  asyncHandler(async (req, res) => {
    const body = shipmentItemSchema.parse(req.body);
    const shipment = await addShipmentItem(getPool(), req.auth!, shipmentIdOf(req), body);
    sendSuccess(res, shipment, 201);
  }),
);

shipmentRouter.patch(
  '/:shipmentId/items/:itemId',
  requireAnyPermission('shipments.manage', 'shipments.update'),
  asyncHandler(async (req, res) => {
    const body = shipmentItemSchema.partial().parse(req.body);
    const shipment = await updateShipmentItem(
      getPool(),
      req.auth!,
      shipmentIdOf(req),
      String(req.params.itemId),
      body,
    );
    sendSuccess(res, shipment);
  }),
);

shipmentRouter.delete(
  '/:shipmentId/items/:itemId',
  requireAnyPermission('shipments.manage', 'shipments.update'),
  asyncHandler(async (req, res) => {
    const shipment = await removeShipmentItem(
      getPool(),
      req.auth!,
      shipmentIdOf(req),
      String(req.params.itemId),
    );
    sendSuccess(res, shipment);
  }),
);
