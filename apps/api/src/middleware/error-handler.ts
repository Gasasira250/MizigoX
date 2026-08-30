import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { getEnv, isProductionLike } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

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

  const production = isProductionLike(getEnv());
  logger.error('Unhandled API error', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    name: error instanceof Error ? error.name : 'unknown',
    message: production ? 'hidden' : error instanceof Error ? error.message : 'Unexpected error',
  });

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: production ? 'An unexpected error occurred' : 'An unexpected error occurred',
      details: [],
      requestId: req.requestId,
    },
  });
}
