import type { Request, Response } from 'express';
import { getEnv } from '../../config/env.js';
import { getPool } from '../../db/pool.js';
import { sendSuccess } from '../../lib/http.js';
import {
  changePasswordSchema,
  createInviteSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from './auth.schemas.js';
import { completePasswordReset, requestPasswordReset } from './password-reset.service.js';
import {
  changePassword,
  loadAuthContext,
  login,
  logout,
  refreshCookieName,
  refreshSession,
  signAccessToken,
  toSessionUser,
} from './auth.service.js';
import {
  createInvite,
  getInvitePreview,
  listPendingInvites,
  registerWithInvite,
} from './invite.service.js';

function cookieOptions() {
  const env = getEnv();
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: '/api/v1/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

function clientMeta(req: Request) {
  return {
    ip: req.ip,
    userAgent: req.header('user-agent'),
    requestId: req.requestId,
  };
}

function writeSession(
  res: Response,
  result: {
    accessToken: string;
    expiresIn: number;
    refreshToken: string;
    user: ReturnType<typeof toSessionUser>;
  },
) {
  res.cookie(refreshCookieName(), result.refreshToken, cookieOptions());
  sendSuccess(res, {
    accessToken: result.accessToken,
    tokenType: 'Bearer' as const,
    expiresIn: result.expiresIn,
    user: result.user,
  });
}

export async function loginHandler(req: Request, res: Response) {
  const body = loginSchema.parse(req.body);
  const result = await login(getPool(), { ...body, ...clientMeta(req) });
  writeSession(res, result);
}

export async function registerHandler(req: Request, res: Response) {
  const body = registerSchema.parse(req.body);
  const result = await registerWithInvite(getPool(), { ...body, ...clientMeta(req) });
  writeSession(res, result);
}

export async function refreshHandler(req: Request, res: Response) {
  const result = await refreshSession(getPool(), {
    refreshToken: req.cookies?.[refreshCookieName()] as string | undefined,
    ...clientMeta(req),
  });
  writeSession(res, result);
}

export async function logoutHandler(req: Request, res: Response) {
  await logout(
    getPool(),
    req.cookies?.[refreshCookieName()] as string | undefined,
    req.auth?.userId,
  );
  res.clearCookie(refreshCookieName(), { ...cookieOptions(), maxAge: 0 });
  sendSuccess(res, { success: true });
}

export async function meHandler(req: Request, res: Response) {
  const auth = await loadAuthContext(getPool(), req.auth!.userId);
  const tokens = signAccessToken(auth);
  sendSuccess(res, {
    user: toSessionUser(auth),
    expiresIn: tokens.expiresIn,
  });
}

export async function changePasswordHandler(req: Request, res: Response) {
  const body = changePasswordSchema.parse(req.body);
  await changePassword(getPool(), {
    userId: req.auth!.userId,
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
    requestId: req.requestId,
  });
  res.clearCookie(refreshCookieName(), { ...cookieOptions(), maxAge: 0 });
  sendSuccess(res, { success: true });
}

export async function createInviteHandler(req: Request, res: Response) {
  const body = createInviteSchema.parse(req.body);
  const invite = await createInvite(getPool(), req.auth!, body);
  sendSuccess(res, invite, 201);
}

export async function listInvitesHandler(req: Request, res: Response) {
  const invites = await listPendingInvites(getPool(), req.auth!);
  sendSuccess(res, invites);
}

export async function invitePreviewHandler(req: Request, res: Response) {
  const token = String(req.params.token ?? '');
  const preview = await getInvitePreview(getPool(), token);
  sendSuccess(res, preview);
}

export async function forgotPasswordHandler(req: Request, res: Response) {
  const body = forgotPasswordSchema.parse(req.body);
  await requestPasswordReset(getPool(), { ...body, ...clientMeta(req) });
  sendSuccess(res, { accepted: true });
}

export async function resetPasswordHandler(req: Request, res: Response) {
  const body = resetPasswordSchema.parse(req.body);
  await completePasswordReset(getPool(), {
    token: body.token,
    newPassword: body.newPassword,
    ...clientMeta(req),
  });
  res.clearCookie(refreshCookieName(), { ...cookieOptions(), maxAge: 0 });
  sendSuccess(res, { success: true });
}
