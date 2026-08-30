import type { NextFunction, Request, Response } from 'express';
import { unprocessable } from '../lib/errors.js';

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

export function requireJsonContentType(req: Request, _res: Response, next: NextFunction) {
  if (!METHODS_WITH_BODY.has(req.method)) {
    next();
    return;
  }
  const length = Number(req.header('content-length') ?? 0);
  if (!Number.isFinite(length) || length <= 0) {
    next();
    return;
  }
  if (!req.is('application/json')) {
    next(unprocessable('Content-Type must be application/json'));
    return;
  }
  next();
}
