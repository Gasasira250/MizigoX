import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { getEnv } from '../config/env.js';
import { AppError } from '../lib/errors.js';

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.issues,
        requestId: req.requestId,
      },
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId: req.requestId,
      },
    });
  }

  const isProduction = getEnv().NODE_ENV === 'production';
  const fallback = error instanceof Error ? error.message : 'Unexpected error';

  console.error({ requestId: req.requestId, error });

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction ? 'An unexpected error occurred' : fallback,
      details: [],
      requestId: req.requestId,
    },
  });
}
