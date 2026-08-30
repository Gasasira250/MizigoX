import type { PermissionCode } from '@mizigox/shared';
import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../lib/errors.js';

export function requirePermission(...permissions: PermissionCode[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(unauthorized());
      return;
    }

    const granted = new Set(req.auth.permissions);
    const allowed = permissions.every((permission) => granted.has(permission));
    if (!allowed) {
      next(forbidden());
      return;
    }

    next();
  };
}

export function requireAnyPermission(...permissions: PermissionCode[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(unauthorized());
      return;
    }

    const granted = new Set(req.auth.permissions);
    const allowed = permissions.some((permission) => granted.has(permission));
    if (!allowed) {
      next(forbidden());
      return;
    }

    next();
  };
}
