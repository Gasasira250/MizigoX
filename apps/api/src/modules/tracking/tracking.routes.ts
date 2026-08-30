import { Router } from 'express';
import { getEnv } from '../../config/env.js';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { sendSuccess } from '../../lib/http.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAnyPermission } from '../../middleware/authorize.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { subscribeTracking } from './tracking.hub.js';
import {
  getLatestVehicleLocation,
  getLiveDashboard,
  getMyTrackingAssignment,
  getRouteTracking,
  getShipmentTracking,
  getTrackingConfig,
  issueShipmentTrackingToken,
  listLocationHistory,
  listTrackingEvents,
  revokeShipmentTrackingToken,
  submitLocation,
} from './tracking.service.js';
import {
  liveDashboardQuerySchema,
  listLocationsQuerySchema,
  routeIdParamSchema,
  shipmentIdParamSchema,
  submitLocationSchema,
  trackingEventsQuerySchema,
  vehicleIdParamSchema,
} from './tracking.schemas.js';

export const trackingRouter = Router();

trackingRouter.get(
  '/config',
  authenticate,
  requireAnyPermission('tracking.manage', 'tracking.read', 'tracking.view_live', 'tracking.submit_location', 'tracking.update_location'),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, getTrackingConfig());
  }),
);

trackingRouter.post(
  '/locations',
  authenticate,
  requireAnyPermission('tracking.manage', 'tracking.submit_location', 'tracking.update_location'),
  rateLimit({
    windowMs: getEnv().TRACKING_LOCATION_RATE_WINDOW_MS,
    max: getEnv().TRACKING_LOCATION_RATE_MAX,
    keyPrefix: 'tracking-location',
    keyFn: (req) => req.auth?.userId ?? req.ip ?? 'unknown',
  }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await submitLocation(getPool(), req.auth!, submitLocationSchema.parse(req.body)), 201);
  }),
);

trackingRouter.get(
  '/locations',
  authenticate,
  requireAnyPermission('tracking.manage', 'tracking.view_history', 'tracking.read'),
  asyncHandler(async (req, res) => {
    const query = listLocationsQuerySchema.parse(req.query);
    const result = await listLocationHistory(getPool(), req.auth!, query);
    sendSuccess(res, result.locations, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);

trackingRouter.get(
  '/vehicles/:vehicleId/location',
  authenticate,
  requireAnyPermission('tracking.manage', 'tracking.read', 'tracking.view_live'),
  asyncHandler(async (req, res) => {
    const vehicleId = vehicleIdParamSchema.parse(req.params).vehicleId;
    sendSuccess(res, await getLatestVehicleLocation(getPool(), req.auth!, vehicleId));
  }),
);

trackingRouter.get(
  '/vehicles/:vehicleId/history',
  authenticate,
  requireAnyPermission('tracking.manage', 'tracking.view_history', 'tracking.read'),
  asyncHandler(async (req, res) => {
    const vehicleId = vehicleIdParamSchema.parse(req.params).vehicleId;
    const query = listLocationsQuerySchema.parse({ ...req.query, vehicleId });
    const result = await listLocationHistory(getPool(), req.auth!, query);
    sendSuccess(res, result.locations, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);

trackingRouter.get(
  '/routes/:routeId',
  authenticate,
  requireAnyPermission('tracking.manage', 'tracking.read', 'tracking.view_live', 'routes.read'),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await getRouteTracking(getPool(), req.auth!, routeIdParamSchema.parse(req.params).routeId),
    );
  }),
);

trackingRouter.get(
  '/shipments/:shipmentId',
  authenticate,
  requireAnyPermission('tracking.manage', 'tracking.read', 'shipments.read'),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await getShipmentTracking(
        getPool(),
        req.auth!,
        shipmentIdParamSchema.parse(req.params).shipmentId,
      ),
    );
  }),
);

trackingRouter.post(
  '/shipments/:shipmentId/token',
  authenticate,
  requireAnyPermission('tracking.manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await issueShipmentTrackingToken(
        getPool(),
        req.auth!,
        shipmentIdParamSchema.parse(req.params).shipmentId,
      ),
      201,
    );
  }),
);

trackingRouter.delete(
  '/shipments/:shipmentId/token',
  authenticate,
  requireAnyPermission('tracking.manage'),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await revokeShipmentTrackingToken(
        getPool(),
        req.auth!,
        shipmentIdParamSchema.parse(req.params).shipmentId,
      ),
    );
  }),
);

trackingRouter.get(
  '/me',
  authenticate,
  requireAnyPermission(
    'tracking.manage',
    'tracking.read',
    'tracking.submit_location',
    'tracking.update_location',
  ),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getMyTrackingAssignment(getPool(), req.auth!));
  }),
);

trackingRouter.get(
  '/live',
  authenticate,
  requireAnyPermission('tracking.manage', 'tracking.view_live'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getLiveDashboard(getPool(), req.auth!, liveDashboardQuerySchema.parse(req.query)));
  }),
);

trackingRouter.get(
  '/events',
  authenticate,
  requireAnyPermission('tracking.manage', 'tracking.view_history', 'tracking.read'),
  asyncHandler(async (req, res) => {
    const query = trackingEventsQuerySchema.parse(req.query);
    const result = await listTrackingEvents(getPool(), req.auth!, query);
    sendSuccess(res, result.events, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);

trackingRouter.get(
  '/stream',
  authenticate,
  requireAnyPermission('tracking.manage', 'tracking.view_live'),
  asyncHandler(async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(': tracking stream ready\n\n');

    const actor = req.auth!;
    const unsubscribe = subscribeTracking((payload) => {
      if (actor.orgType === 'OPERATOR' && payload.organizationId !== actor.orgId) {
        return;
      }
      if (actor.role === 'DRIVER' && payload.driverId == null) {
        return;
      }
      res.write(`event: location\ndata: ${JSON.stringify(payload)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }),
);
