import { Router } from 'express';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { sendSuccess } from '../../lib/http.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { getPublicShipmentTracking, getTrackingConfig } from './tracking.service.js';
import { publicTokenParamSchema } from './tracking.schemas.js';

export const publicTrackingRouter = Router();

publicTrackingRouter.get(
  '/config',
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'public-track-config' }),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, getTrackingConfig());
  }),
);

publicTrackingRouter.get(
  '/:token',
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'public-track' }),
  asyncHandler(async (req, res) => {
    const token = publicTokenParamSchema.parse(req.params).token;
    sendSuccess(res, await getPublicShipmentTracking(getPool(), token));
  }),
);
