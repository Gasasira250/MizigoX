import { DOCUMENT_ALERT_WINDOWS, isDocumentAlertWindow } from '@mizigox/shared';
import { Router } from 'express';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { unprocessable } from '../../lib/errors.js';
import { sendSuccess } from '../../lib/http.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAnyPermission } from '../../middleware/authorize.js';
import { listExpiringDocuments } from './documents.js';
import { listOperatorOrganizations } from './tenant.js';

export const fleetRouter = Router();

fleetRouter.use(authenticate);

fleetRouter.get(
  '/operators',
  requireAnyPermission(
    'vehicles.manage',
    'drivers.manage',
    'fleet.manage',
    'vehicles.read',
    'drivers.read',
    'vehicles.create',
    'drivers.create',
  ),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await listOperatorOrganizations(getPool(), req.auth!));
  }),
);

fleetRouter.get(
  '/document-expiry',
  requireAnyPermission(
    'vehicles.read',
    'drivers.read',
    'vehicle_documents.read',
    'driver_documents.read',
    'vehicles.manage',
    'drivers.manage',
    'fleet.manage',
  ),
  asyncHandler(async (req, res) => {
    const requested = req.query.window ?? '30';
    if (!isDocumentAlertWindow(requested)) {
      throw unprocessable(`window must be one of: ${DOCUMENT_ALERT_WINDOWS.join(', ')}`);
    }
    sendSuccess(res, await listExpiringDocuments(getPool(), req.auth!, requested));
  }),
);
