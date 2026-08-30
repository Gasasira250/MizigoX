import { Router } from 'express';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { sendSuccess } from '../../lib/http.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { listAuditLogs } from '../portals/admin.service.js';
import { listAuditQuerySchema } from '../portals/portals.schemas.js';

export const auditRouter = Router();

auditRouter.use(authenticate, requirePermission('audit.read'));

auditRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listAuditQuerySchema.parse(req.query);
    const result = await listAuditLogs(getPool(), req.auth!, query);
    sendSuccess(res, result.logs, 200, {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }),
);
