import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { loginHandler, logoutHandler, meHandler, refreshHandler } from './auth.controller.js';

export const authRouter = Router();

authRouter.post(
  '/login',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'login' }),
  asyncHandler(loginHandler),
);
authRouter.post('/refresh', asyncHandler(refreshHandler));
authRouter.post('/logout', asyncHandler(logoutHandler));
authRouter.get('/me', authenticate, asyncHandler(meHandler));
