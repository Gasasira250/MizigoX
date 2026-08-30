import type { Response } from 'express';

export function sendSuccess<T>(
  res: Response,
  data: T,
  status = 200,
  extraMeta: Record<string, unknown> = {},
) {
  return res.status(status).json({
    data,
    meta: {
      requestId: res.req.requestId,
      ...extraMeta,
    },
  });
}
