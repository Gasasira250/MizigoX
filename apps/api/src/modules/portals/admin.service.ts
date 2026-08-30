import type { AdminUserPayload, AuditLogPayload, RoleCode } from '@mizigox/shared';
import { ROLE_DEFINITIONS } from '@mizigox/shared';
import type { Pool } from 'pg';
import { writeAudit } from '../../lib/audit.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { likePattern } from '../../lib/linked-driver.js';
import type { AuthContext } from '../auth/auth.types.js';
import type { z } from 'zod';
import type { listAuditQuerySchema, listUsersQuerySchema } from './portals.schemas.js';

type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

export async function listAdminUsers(pool: Pool, actor: AuthContext, query: ListUsersQuery) {
  const where = ['u.deleted_at IS NULL', "m.status = 'ACTIVE'"];
  const params: unknown[] = [];
  applyUserScope(actor, where, params, query.organizationId);

  if (query.q) {
    params.push(likePattern(query.q));
    where.push(
      `(lower(u.email) LIKE $${params.length} ESCAPE '\\' OR lower(u.first_name) LIKE $${params.length} ESCAPE '\\' OR lower(u.last_name) LIKE $${params.length} ESCAPE '\\')`,
    );
  }
  if (query.status) {
    params.push(query.status);
    where.push(`u.status::text = $${params.length}`);
  }
  if (query.role) {
    params.push(query.role);
    where.push(`r.code = $${params.length}`);
  }

  const count = await pool.query<{ total: string }>(
    `
      SELECT count(*)::text AS total
      FROM users u
      JOIN organization_memberships m ON m.user_id = u.id
      JOIN organizations o ON o.id = m.organization_id AND o.deleted_at IS NULL
      JOIN roles r ON r.id = m.role_id
      WHERE ${where.join(' AND ')}
    `,
    params,
  );
  params.push(query.pageSize, (query.page - 1) * query.pageSize);
  const result = await pool.query(
    `
      SELECT ${userSelect()}
      FROM users u
      JOIN organization_memberships m ON m.user_id = u.id
      JOIN organizations o ON o.id = m.organization_id AND o.deleted_at IS NULL
      JOIN roles r ON r.id = m.role_id
      WHERE ${where.join(' AND ')}
      ORDER BY u.last_name, u.first_name, u.email
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );

  return {
    users: result.rows.map(mapAdminUser),
    total: Number(count.rows[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getAdminUser(pool: Pool, actor: AuthContext, userId: string) {
  const where = ['u.deleted_at IS NULL', "m.status = 'ACTIVE'", 'u.id = $1'];
  const params: unknown[] = [userId];
  applyUserScope(actor, where, params);
  const result = await pool.query(
    `
      SELECT ${userSelect()}
      FROM users u
      JOIN organization_memberships m ON m.user_id = u.id
      JOIN organizations o ON o.id = m.organization_id AND o.deleted_at IS NULL
      JOIN roles r ON r.id = m.role_id
      WHERE ${where.join(' AND ')}
      LIMIT 1
    `,
    params,
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound('User not found');
  }
  return mapAdminUser(row);
}

export async function updateAdminUserStatus(
  pool: Pool,
  actor: AuthContext,
  userId: string,
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED',
) {
  if (userId === actor.userId) {
    throw forbidden('You cannot change the status of your own account');
  }
  const current = await getAdminUser(pool, actor, userId);
  await pool.query(
    `UPDATE users SET status = $2::user_status WHERE id = $1 AND deleted_at IS NULL`,
    [userId, status],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: current.organizationId,
    action: status === 'ACTIVE' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
    entityType: 'user',
    entityId: userId,
    before: { status: current.status },
    after: { status },
  });
  return getAdminUser(pool, actor, userId);
}

export async function updateAdminUserRole(
  pool: Pool,
  actor: AuthContext,
  userId: string,
  role: RoleCode,
  organizationId?: string,
) {
  if (userId === actor.userId) {
    throw forbidden('You cannot change your own role');
  }
  const current = await getAdminUser(pool, actor, userId);
  const targetOrgId = organizationId ?? current.organizationId;
  if (actor.orgType !== 'PLATFORM' && targetOrgId !== actor.orgId) {
    throw forbidden('You cannot assign roles in another organization');
  }
  const definition = ROLE_DEFINITIONS[role];
  if (actor.role !== 'SUPER_ADMIN' && role === 'SUPER_ADMIN') {
    throw forbidden('Only a Super Admin can assign the Super Admin role');
  }
  const org = await pool.query<{ type: string }>(
    `SELECT type::text AS type FROM organizations WHERE id = $1 AND deleted_at IS NULL`,
    [targetOrgId],
  );
  if (!org.rows[0]) {
    throw notFound('Organization not found');
  }
  if (definition.scope !== org.rows[0].type && actor.role !== 'SUPER_ADMIN') {
    throw forbidden('That role cannot be assigned to this organization type');
  }

  const roleRow = await pool.query<{ id: string }>(`SELECT id FROM roles WHERE code = $1`, [role]);
  if (!roleRow.rows[0]) {
    throw notFound('Role not found');
  }
  await pool.query(
    `
      UPDATE organization_memberships
      SET role_id = $3, status = 'ACTIVE'
      WHERE organization_id = $1 AND user_id = $2
    `,
    [targetOrgId, userId, roleRow.rows[0].id],
  );
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: targetOrgId,
    action: 'USER_ROLE_ASSIGNED',
    entityType: 'user',
    entityId: userId,
    before: { role: current.role },
    after: { role },
  });
  return getAdminUser(pool, actor, userId);
}

export async function listAuditLogs(pool: Pool, actor: AuthContext, query: ListAuditQuery) {
  const where = ['TRUE'];
  const params: unknown[] = [];
  if (actor.orgType !== 'PLATFORM') {
    params.push(actor.orgId);
    where.push(`a.organization_id = $${params.length}`);
  } else if (query.organizationId) {
    params.push(query.organizationId);
    where.push(`a.organization_id = $${params.length}`);
  }
  if (query.action) {
    params.push(query.action);
    where.push(`a.action = $${params.length}`);
  }
  if (query.entityType) {
    params.push(query.entityType);
    where.push(`a.entity_type = $${params.length}`);
  }
  if (query.q) {
    params.push(likePattern(query.q));
    where.push(
      `(lower(a.action) LIKE $${params.length} ESCAPE '\\' OR lower(a.entity_type) LIKE $${params.length} ESCAPE '\\' OR lower(coalesce(u.email, '')) LIKE $${params.length} ESCAPE '\\')`,
    );
  }
  const count = await pool.query<{ total: string }>(
    `
      SELECT count(*)::text AS total
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE ${where.join(' AND ')}
    `,
    params,
  );
  params.push(query.pageSize, (query.page - 1) * query.pageSize);
  const result = await pool.query(
    `
      SELECT a.id, a.actor_user_id, a.organization_id, a.action, a.entity_type, a.entity_id,
             a.created_at, a.request_id, u.email AS actor_email,
             NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), '') AS actor_name,
             o.name AS organization_name
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      LEFT JOIN organizations o ON o.id = a.organization_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );
  return {
    logs: result.rows.map(mapAudit),
    total: Number(count.rows[0]?.total ?? 0),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function listOrganizationUsers(
  pool: Pool,
  actor: AuthContext,
  organizationId: string,
) {
  return listAdminUsers(pool, actor, {
    organizationId,
    page: 1,
    pageSize: 50,
  });
}

function applyUserScope(
  actor: AuthContext,
  where: string[],
  params: unknown[],
  requestedOrgId?: string,
) {
  if (actor.orgType === 'PLATFORM') {
    if (requestedOrgId) {
      params.push(requestedOrgId);
      where.push(`o.id = $${params.length}`);
    }
    return;
  }
  params.push(actor.orgId);
  where.push(`o.id = $${params.length}`);
  if (requestedOrgId && requestedOrgId !== actor.orgId) {
    throw forbidden('You cannot list users for another organization');
  }
}

function userSelect() {
  return `
    u.id, u.email, u.first_name, u.last_name, u.phone_e164, u.status::text AS status,
    r.code AS role, o.id AS organization_id, o.name AS organization_name,
    o.type::text AS organization_type, u.last_login_at, u.created_at
  `;
}

function mapAdminUser(row: Record<string, unknown>): AdminUserPayload {
  return {
    id: String(row.id),
    email: String(row.email),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    phoneE164: (row.phone_e164 as string | null) ?? null,
    status: String(row.status),
    role: String(row.role),
    organizationId: String(row.organization_id),
    organizationName: String(row.organization_name),
    organizationType: String(row.organization_type),
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at as string).toISOString() : null,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

function mapAudit(row: Record<string, unknown>): AuditLogPayload {
  return {
    id: String(row.id),
    actorUserId: (row.actor_user_id as string | null) ?? null,
    actorEmail: (row.actor_email as string | null) ?? null,
    actorName: (row.actor_name as string | null) ?? null,
    organizationId: (row.organization_id as string | null) ?? null,
    organizationName: (row.organization_name as string | null) ?? null,
    action: String(row.action),
    entityType: String(row.entity_type),
    entityId: (row.entity_id as string | null) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
    requestId: (row.request_id as string | null) ?? null,
  };
}
