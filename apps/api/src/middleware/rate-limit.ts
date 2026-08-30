import type { NextFunction, Request, Response } from 'express';
import { tooManyRequests } from '../lib/errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20_000;

function pruneExpired(now: number) {
  if (buckets.size < MAX_BUCKETS / 2) {
    return;
  }
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
  if (buckets.size >= MAX_BUCKETS) {
    const oldest = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (const [key] of oldest.slice(0, Math.ceil(MAX_BUCKETS / 4))) {
      buckets.delete(key);
    }
  }
}

export function rateLimit(options: {
  windowMs: number;
  max: number;
  keyPrefix: string;
  keyFn?: (req: Request) => string;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const identity = options.keyFn?.(req) ?? req.ip ?? 'unknown';
    const key = `${options.keyPrefix}:${identity}`;
    const now = Date.now();
    pruneExpired(now);
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      next(tooManyRequests());
      return;
    }

    next();
  };
}
