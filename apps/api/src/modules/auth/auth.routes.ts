import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import {
  changePasswordHandler,
  createInviteHandler,
  forgotPasswordHandler,
  invitePreviewHandler,
  listInvitesHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  registerHandler,
  resetPasswordHandler,
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
authRouter.post(
  '/refresh',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 60, keyPrefix: 'refresh' }),
  asyncHandler(refreshHandler),
);
authRouter.post('/logout', asyncHandler(logoutHandler));
authRouter.post(
  '/forgot-password',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 5, keyPrefix: 'forgot-password' }),
  asyncHandler(forgotPasswordHandler),
);
authRouter.post(
  '/reset-password',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: 'reset-password' }),
  asyncHandler(resetPasswordHandler),
);
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
