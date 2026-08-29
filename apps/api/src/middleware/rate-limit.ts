import type { NextFunction, Request, Response } from 'express';
import { tooManyRequests } from '../lib/errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(options: { windowMs: number; max: number; keyPrefix: string }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = `${options.keyPrefix}:${req.ip ?? 'unknown'}`;
    const now = Date.now();
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > options.max) {
      next(tooManyRequests());
      return;
    }

    next();
  };
}
