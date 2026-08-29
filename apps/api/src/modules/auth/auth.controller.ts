import type { Request, Response } from 'express';
import { getEnv } from '../../config/env.js';
import { getPool } from '../../db/pool.js';
import { sendSuccess } from '../../lib/http.js';
import { loginSchema } from './auth.schemas.js';
import {
  loadAuthContext,
  login,
  logout,
  refreshCookieName,
  refreshSession,
  signAccessToken,
  toSessionUser,
} from './auth.service.js';

function cookieOptions() {
  const env = getEnv();
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax' as const,
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

export async function loginHandler(req: Request, res: Response) {
  const body = loginSchema.parse(req.body);
  const result = await login(getPool(), { ...body, ...clientMeta(req) });
  res.cookie(refreshCookieName(), result.refreshToken, cookieOptions());
  sendSuccess(res, {
    accessToken: result.accessToken,
    tokenType: 'Bearer' as const,
    expiresIn: result.expiresIn,
    user: result.user,
  });
}

export async function refreshHandler(req: Request, res: Response) {
  const result = await refreshSession(getPool(), {
    refreshToken: req.cookies?.[refreshCookieName()] as string | undefined,
    ...clientMeta(req),
  });
  res.cookie(refreshCookieName(), result.refreshToken, cookieOptions());
  sendSuccess(res, {
    accessToken: result.accessToken,
    tokenType: 'Bearer' as const,
    expiresIn: result.expiresIn,
    user: result.user,
  });
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
