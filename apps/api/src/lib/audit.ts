import type { Pool } from 'pg';

export async function writeAudit(
  pool: Pool,
  entry: {
    actorUserId?: string;
    organizationId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    before?: unknown;
    after?: unknown;
    ip?: string;
    userAgent?: string;
    requestId?: string;
  },
) {
  await pool.query(
    `
      INSERT INTO audit_logs (
        actor_user_id, organization_id, action, entity_type, entity_id,
        before, after, ip, user_agent, request_id
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10)
    `,
    [
      entry.actorUserId ?? null,
      entry.organizationId ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.before ? JSON.stringify(entry.before) : null,
      entry.after ? JSON.stringify(entry.after) : null,
      entry.ip ?? null,
      entry.userAgent ?? null,
      entry.requestId ?? null,
    ],
  );
}
