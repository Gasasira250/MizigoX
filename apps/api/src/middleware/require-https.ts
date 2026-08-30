import type { NextFunction, Request, Response } from 'express';
import { getEnv, isProductionLike } from '../config/env.js';
import { AppError } from '../lib/errors.js';

export function requireHttps(req: Request, _res: Response, next: NextFunction) {
  const env = getEnv();
  if (!isProductionLike(env)) {
    next();
    return;
  }
  if (req.path.startsWith('/api/v1/health')) {
    next();
    return;
  }
  const proto = (req.header('x-forwarded-proto') ?? (req.secure ? 'https' : 'http'))
    .split(',')[0]
    ?.trim()
    .toLowerCase();
  if (proto === 'https') {
    next();
    return;
  }
  next(new AppError(403, 'HTTPS_REQUIRED', 'HTTPS is required'));
}
