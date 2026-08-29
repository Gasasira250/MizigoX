import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import {
  changePasswordHandler,
  createInviteHandler,
  invitePreviewHandler,
  listInvitesHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
} from './auth.controller.js';

export const authRouter = Router();

authRouter.post(
  '/login',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'login' }),
  asyncHandler(loginHandler),
);
authRouter.post(
  '/register',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: 'register' }),
  asyncHandler(registerHandler),
);
authRouter.post('/refresh', asyncHandler(refreshHandler));
authRouter.post('/logout', asyncHandler(logoutHandler));
authRouter.get('/me', authenticate, asyncHandler(meHandler));
authRouter.post('/change-password', authenticate, asyncHandler(changePasswordHandler));
authRouter.get('/invites/:token', asyncHandler(invitePreviewHandler));
authRouter.get(
  '/invites',
  authenticate,
  requirePermission('users.manage'),
  asyncHandler(listInvitesHandler),
);
authRouter.post(
  '/invites',
  authenticate,
  requirePermission('users.manage'),
  asyncHandler(createInviteHandler),
);
