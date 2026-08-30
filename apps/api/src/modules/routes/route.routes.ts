import { Router } from 'express';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { sendSuccess } from '../../lib/http.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAnyPermission } from '../../middleware/authorize.js';
import {
  addRouteShipmentSchema,
  createRouteSchema,
  listRoutesQuerySchema,
  reorderStopsSchema,
  routeIdParamSchema,
  routeShipmentParamSchema,
  routeStopIdParamSchema,
  routeStopInputSchema,
  updateRouteSchema,
  updateRouteStatusSchema,
} from './route.schemas.js';
import {
  addRouteShipment,
  addRouteStop,
  archiveRoute,
  createRoute,
  dispatchRoute,
  listRoutes,
  loadRoute,
  removeRouteShipment,
  removeRouteStop,
  reorderRouteStops,
  updateRoute,
  updateRouteStatus,
  updateRouteStop,
  validateDispatch,
} from './route.service.js';

export const routeRouter = Router();

routeRouter.use(authenticate);

function routeIdOf(req: { params: Record<string, string | string[] | undefined> }) {
  return routeIdParamSchema.parse(req.params).routeId;
}

routeRouter.get(
  '/',
  requireAnyPermission('routes.manage', 'routes.read'),
  asyncHandler(async (req, res) => {
    const query = listRoutesQuerySchema.parse(req.query);
    const result = await listRoutes(getPool(), req.auth!, query);
    sendSuccess(res, result.routes, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);

routeRouter.post(
  '/',
  requireAnyPermission('routes.manage', 'routes.create'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await createRoute(getPool(), req.auth!, createRouteSchema.parse(req.body)), 201);
  }),
);

routeRouter.get(
  '/:routeId',
  requireAnyPermission('routes.manage', 'routes.read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await loadRoute(getPool(), req.auth!, routeIdOf(req)));
  }),
);

routeRouter.patch(
  '/:routeId',
  requireAnyPermission('routes.manage', 'routes.update'),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await updateRoute(getPool(), req.auth!, routeIdOf(req), updateRouteSchema.parse(req.body)),
    );
  }),
);

routeRouter.delete(
  '/:routeId',
  requireAnyPermission('routes.manage', 'routes.delete'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await archiveRoute(getPool(), req.auth!, routeIdOf(req)));
  }),
);

routeRouter.post(
  '/:routeId/status',
  requireAnyPermission('routes.manage', 'routes.status_update', 'routes.dispatch'),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await updateRouteStatus(
        getPool(),
        req.auth!,
        routeIdOf(req),
        updateRouteStatusSchema.parse(req.body),
      ),
    );
  }),
);

routeRouter.get(
  '/:routeId/history',
  requireAnyPermission('routes.manage', 'routes.view_history', 'routes.read'),
  asyncHandler(async (req, res) => {
    const route = await loadRoute(getPool(), req.auth!, routeIdOf(req));
    sendSuccess(res, route.events);
  }),
);

routeRouter.get(
  '/:routeId/shipments',
  requireAnyPermission('routes.manage', 'routes.read'),
  asyncHandler(async (req, res) => {
    const route = await loadRoute(getPool(), req.auth!, routeIdOf(req));
    sendSuccess(res, route.shipments);
  }),
);

routeRouter.post(
  '/:routeId/shipments',
  requireAnyPermission('routes.manage', 'routes.update'),
  asyncHandler(async (req, res) => {
    const body = addRouteShipmentSchema.parse(req.body);
    sendSuccess(res, await addRouteShipment(getPool(), req.auth!, routeIdOf(req), body.shipmentId), 201);
  }),
);

routeRouter.delete(
  '/:routeId/shipments/:shipmentId',
  requireAnyPermission('routes.manage', 'routes.update'),
  asyncHandler(async (req, res) => {
    const params = routeShipmentParamSchema.parse(req.params);
    sendSuccess(res, await removeRouteShipment(getPool(), req.auth!, params.routeId, params.shipmentId));
  }),
);

routeRouter.post(
  '/:routeId/stops',
  requireAnyPermission('routes.manage', 'routes.update'),
  asyncHandler(async (req, res) => {
    sendSuccess(
      res,
      await addRouteStop(getPool(), req.auth!, routeIdOf(req), routeStopInputSchema.parse(req.body)),
      201,
    );
  }),
);

routeRouter.patch(
  '/:routeId/stops/:stopId',
  requireAnyPermission('routes.manage', 'routes.update'),
  asyncHandler(async (req, res) => {
    const params = routeStopIdParamSchema.parse(req.params);
    sendSuccess(
      res,
      await updateRouteStop(
        getPool(),
        req.auth!,
        params.routeId,
        params.stopId,
        routeStopInputSchema.partial().parse(req.body),
      ),
    );
  }),
);

routeRouter.delete(
  '/:routeId/stops/:stopId',
  requireAnyPermission('routes.manage', 'routes.update'),
  asyncHandler(async (req, res) => {
    const params = routeStopIdParamSchema.parse(req.params);
    sendSuccess(res, await removeRouteStop(getPool(), req.auth!, params.routeId, params.stopId));
  }),
);

routeRouter.post(
  '/:routeId/stops/reorder',
  requireAnyPermission('routes.manage', 'routes.update'),
  asyncHandler(async (req, res) => {
    const body = reorderStopsSchema.parse(req.body);
    sendSuccess(res, await reorderRouteStops(getPool(), req.auth!, routeIdOf(req), body.stopIds));
  }),
);

routeRouter.get(
  '/:routeId/dispatch-check',
  requireAnyPermission('routes.manage', 'routes.dispatch', 'dispatch.manage', 'dispatch.dispatch'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await validateDispatch(getPool(), req.auth!, routeIdOf(req)));
  }),
);

routeRouter.post(
  '/:routeId/dispatch',
  requireAnyPermission('routes.manage', 'routes.dispatch', 'dispatch.manage', 'dispatch.dispatch'),
  asyncHandler(async (req, res) => {
    const note =
      typeof req.body?.note === 'string' && req.body.note.trim() ? req.body.note.trim() : undefined;
    sendSuccess(res, await dispatchRoute(getPool(), req.auth!, routeIdOf(req), note));
  }),
);
