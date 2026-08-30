import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../modules/auth/auth.service.js';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    next(unauthorized());
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    next(unauthorized());
    return;
  }

  try {
    const claims = verifyAccessToken(token);
    req.auth = {
      userId: claims.sub,
      email: claims.email,
      firstName: claims.firstName,
      lastName: claims.lastName,
      orgId: claims.orgId,
      orgName: claims.orgName,
      orgType: claims.orgType,
      role: claims.role,
      permissions: claims.permissions,
      countryCode: claims.countryCode,
      currencyCode: claims.currencyCode,
    };
    next();
  } catch {
    next(unauthorized('Access token is invalid or expired'));
  }
}
