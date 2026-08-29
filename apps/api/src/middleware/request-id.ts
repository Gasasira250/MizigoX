import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  req.requestId = incoming && incoming.trim().length > 0 ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
