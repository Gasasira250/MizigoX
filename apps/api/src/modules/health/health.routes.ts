import { Router } from 'express';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { sendSuccess } from '../../lib/http.js';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, {
      status: 'ok' as const,
      service: 'mizigox-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
  }),
);

healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const started = Date.now();
    try {
      await getPool().query('SELECT 1');
      sendSuccess(res, {
        status: 'ok' as const,
        checks: {
          database: {
            status: 'ok' as const,
            latencyMs: Date.now() - started,
          },
        },
      });
    } catch {
      res.status(503).json({
        data: {
          status: 'error',
          checks: {
            database: {
              status: 'error',
              latencyMs: Date.now() - started,
            },
          },
        },
        meta: { requestId: res.req.requestId },
      });
    }
  }),
);
