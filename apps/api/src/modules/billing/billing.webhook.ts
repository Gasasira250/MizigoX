import { Router } from 'express';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { sendSuccess } from '../../lib/http.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { applyProviderWebhook } from './billing.service.js';
import { providerParamSchema, providerWebhookSchema } from './billing.schemas.js';
import { verifyProviderWebhook } from './payment-providers.js';

export const billingWebhookRouter = Router();

billingWebhookRouter.post(
  '/:provider',
  rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'payment-webhook' }),
  asyncHandler(async (req, res) => {
    const { provider } = providerParamSchema.parse(req.params);
    const signature =
      (typeof req.header('x-mizigox-signature') === 'string'
        ? req.header('x-mizigox-signature')
        : undefined) ??
      (typeof req.header('x-webhook-signature') === 'string'
        ? req.header('x-webhook-signature')
        : undefined);
    verifyProviderWebhook(signature, req.rawBody ?? '');
    const body = providerWebhookSchema.parse(req.body);
    const payment = await applyProviderWebhook(getPool(), provider, body);
    sendSuccess(res, payment);
  }),
);
