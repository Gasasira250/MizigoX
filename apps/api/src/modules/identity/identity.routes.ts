import { Router } from 'express';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { sendSuccess } from '../../lib/http.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';

export const identityRouter = Router();

identityRouter.use(authenticate);

identityRouter.get(
  '/countries',
  requirePermission('countries.read'),
  asyncHandler(async (_req, res) => {
    const result = await getPool().query(
      `
        SELECT code, iso3, name, phone_country_code, default_timezone,
               default_currency_code, address_schema, is_active
        FROM countries
        ORDER BY name
      `,
    );
    sendSuccess(res, result.rows);
  }),
);

identityRouter.get(
  '/currencies',
  requirePermission('countries.read'),
  asyncHandler(async (_req, res) => {
    const result = await getPool().query(
      `
        SELECT code, name, decimal_places, symbol, is_active
        FROM currencies
        ORDER BY code
      `,
    );
    sendSuccess(res, result.rows);
  }),
);

identityRouter.get(
  '/roles',
  requirePermission('users.manage'),
  asyncHandler(async (_req, res) => {
    const result = await getPool().query(
      `
        SELECT code, name, scope::text AS scope, description
        FROM roles
        ORDER BY name
      `,
    );
    sendSuccess(res, result.rows);
  }),
);

identityRouter.get(
  '/organizations',
  requirePermission('org.settings'),
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const params: string[] = [];
    let where = 'deleted_at IS NULL';

    if (auth.orgType !== 'PLATFORM') {
      params.push(auth.orgId);
      where += ` AND id = $${params.length}`;
    }

    const result = await getPool().query(
      `
        SELECT id, type, name, legal_name, country_code, default_currency_code, status
        FROM organizations
        WHERE ${where}
        ORDER BY name
      `,
      params,
    );
    sendSuccess(res, result.rows);
  }),
);
