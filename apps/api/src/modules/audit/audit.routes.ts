import { Router } from 'express';
import { getPool } from '../../db/pool.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { sendSuccess } from '../../lib/http.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';

export const auditRouter = Router();

auditRouter.use(authenticate, requirePermission('audit.read'));

auditRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 25), 100);
    const result = await getPool().query(
      `
        SELECT id, actor_user_id, organization_id, action, entity_type, entity_id,
               created_at, request_id
        FROM audit_logs
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [limit],
    );
    sendSuccess(res, result.rows, 200, { page: 1, pageSize: limit, total: result.rowCount ?? 0 });
  }),
);
