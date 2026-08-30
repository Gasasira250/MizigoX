import { Router } from 'express';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { sendSuccess } from '../../lib/http.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAnyPermission } from '../../middleware/authorize.js';
import { dispatchRoute, getDispatchBoard, validateDispatch } from '../routes/route.service.js';
import { routeIdParamSchema } from '../routes/route.schemas.js';

export const dispatchRouter = Router();

dispatchRouter.use(authenticate);

dispatchRouter.get(
  '/board',
  requireAnyPermission('dispatch.manage', 'dispatch.read', 'routes.manage', 'routes.read'),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await getDispatchBoard(getPool(), req.auth!));
  }),
);

dispatchRouter.get(
  '/routes/:routeId/validate',
  requireAnyPermission('dispatch.manage', 'dispatch.dispatch', 'routes.manage', 'routes.dispatch'),
  asyncHandler(async (req, res) => {
    const routeId = routeIdParamSchema.parse(req.params).routeId;
    sendSuccess(res, await validateDispatch(getPool(), req.auth!, routeId));
  }),
);

dispatchRouter.post(
  '/routes/:routeId',
  requireAnyPermission('dispatch.manage', 'dispatch.dispatch', 'routes.manage', 'routes.dispatch'),
  asyncHandler(async (req, res) => {
    const routeId = routeIdParamSchema.parse(req.params).routeId;
    const note =
      typeof req.body?.note === 'string' && req.body.note.trim() ? req.body.note.trim() : undefined;
    sendSuccess(res, await dispatchRoute(getPool(), req.auth!, routeId, note));
  }),
);
