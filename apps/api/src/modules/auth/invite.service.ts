import { ROLE_DEFINITIONS, type RoleCode } from '@mizigox/shared';
import type { Pool } from 'pg';
import { writeAudit } from '../../lib/audit.js';
import { createOpaqueToken, hashPassword, hashToken } from '../../lib/crypto.js';
import { conflict, forbidden, notFound, unprocessable } from '../../lib/errors.js';
import type { AuthContext } from './auth.types.js';
import { createSession, loadAuthContext } from './auth.service.js';
import { notifyAccountCreated, notifyInvitation } from '../notifications/notification.hooks.js';

const INVITE_TTL_DAYS = 7;

interface InviteRow {
  id: string;
  organization_id: string;
  role_id: string;
  email: string;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  organization_name: string;
  organization_type: string;
  role_code: string;
}

export async function createInvite(
  pool: Pool,
  actor: AuthContext,
  input: { email: string; role: RoleCode; organizationId?: string },
) {
  const organizationId = input.organizationId ?? actor.orgId;
  const organization = await pool.query<{ id: string; type: string; name: string }>(
    `
      SELECT id, type::text AS type, name
      FROM organizations
      WHERE id = $1 AND deleted_at IS NULL
    `,
    [organizationId],
  );
  const org = organization.rows[0];
  if (!org) {
    throw notFound('Organization not found');
  }

  if (actor.orgType !== 'PLATFORM' && organizationId !== actor.orgId) {
    throw forbidden('You can only invite users to your own organization');
  }

  const roleDefinition = ROLE_DEFINITIONS[input.role];
  if (roleDefinition.scope !== org.type) {
    throw unprocessable('That role cannot be assigned to this organization type');
  }

  const role = await pool.query<{ id: string }>('SELECT id FROM roles WHERE code = $1', [
    input.role,
  ]);
  const roleId = role.rows[0]?.id;
  if (!roleId) {
    throw unprocessable('Unknown role');
  }

  const existingUser = await pool.query(
    `
      SELECT id FROM users
      WHERE lower(email) = lower($1) AND deleted_at IS NULL
    `,
    [input.email],
  );
  if ((existingUser.rowCount ?? 0) > 0) {
    throw conflict('A user with this email already exists');
  }

  await pool.query(
    `
      UPDATE user_invites
      SET revoked_at = now()
      WHERE organization_id = $1
        AND lower(email) = lower($2)
        AND accepted_at IS NULL
        AND revoked_at IS NULL
    `,
    [organizationId, input.email],
  );

  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const inserted = await pool.query<{ id: string; expires_at: Date }>(
    `
      INSERT INTO user_invites (
        organization_id, role_id, email, invited_by_user_id, token_hash, expires_at
      )
      VALUES ($1, $2, lower($3), $4, $5, $6)
      RETURNING id, expires_at
    `,
    [organizationId, roleId, input.email, actor.userId, hashToken(token), expiresAt],
  );
  const invite = inserted.rows[0];
  if (!invite) {
    throw new Error('Failed to create invite');
  }

  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId,
    action: 'AUTH_USER_INVITED',
    entityType: 'user_invite',
    entityId: invite.id,
    after: { email: input.email.toLowerCase(), role: input.role },
  });

  await notifyInvitation(pool, {
    organizationId,
    organizationName: org.name,
    email: input.email.toLowerCase(),
    inviteId: invite.id,
    token,
  });

  return {
    id: invite.id,
    email: input.email.toLowerCase(),
    role: input.role,
    organizationId,
    expiresAt: invite.expires_at.toISOString(),
    token,
  };
}

export async function getInvitePreview(pool: Pool, token: string) {
  const invite = await loadInviteByToken(pool, token);
  return {
    email: invite.email,
    organizationName: invite.organization_name,
    organizationType: invite.organization_type,
    role: invite.role_code,
    expiresAt: invite.expires_at.toISOString(),
  };
}

export async function registerWithInvite(
  pool: Pool,
  input: {
    token: string;
    firstName: string;
    lastName: string;
    password: string;
    ip?: string;
    userAgent?: string;
    requestId?: string;
  },
) {
  const invite = await loadInviteByToken(pool, input.token);
  const passwordHash = await hashPassword(input.password);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const user = await client.query<{ id: string }>(
      `
        INSERT INTO users (
          email, password_hash, first_name, last_name, status, email_verified_at
        )
        VALUES ($1, $2, $3, $4, 'ACTIVE', now())
        RETURNING id
      `,
      [invite.email, passwordHash, input.firstName, input.lastName],
    );
    const userId = user.rows[0]?.id;
    if (!userId) {
      throw new Error('Failed to create user');
    }

    await client.query(
      `
        INSERT INTO organization_memberships (organization_id, user_id, role_id, status)
        VALUES ($1, $2, $3, 'ACTIVE')
      `,
      [invite.organization_id, userId, invite.role_id],
    );
    await client.query(
      `
        UPDATE user_invites
        SET accepted_at = now()
        WHERE id = $1
      `,
      [invite.id],
    );
    await client.query('COMMIT');

    await writeAudit(pool, {
      actorUserId: userId,
      organizationId: invite.organization_id,
      action: 'AUTH_REGISTERED',
      entityType: 'user',
      entityId: userId,
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
      after: { inviteId: invite.id, role: invite.role_code },
    });

    await notifyAccountCreated(pool, {
      userId,
      organizationId: invite.organization_id,
      organizationName: invite.organization_name,
    });

    const auth = await loadAuthContext(pool, userId);
    return createSession(pool, auth, input);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listPendingInvites(pool: Pool, actor: AuthContext) {
  const params: string[] = [];
  let where = 'i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()';
  if (actor.orgType !== 'PLATFORM') {
    params.push(actor.orgId);
    where += ` AND i.organization_id = $${params.length}`;
  }

  const result = await pool.query(
    `
      SELECT i.id, i.email, i.expires_at, r.code AS role, o.id AS organization_id, o.name AS organization_name
      FROM user_invites i
      JOIN roles r ON r.id = i.role_id
      JOIN organizations o ON o.id = i.organization_id
      WHERE ${where}
      ORDER BY i.created_at DESC
    `,
    params,
  );
  return result.rows;
}

async function loadInviteByToken(pool: Pool, token: string): Promise<InviteRow> {
  const result = await pool.query<InviteRow>(
    `
      SELECT
        i.id,
        i.organization_id,
        i.role_id,
        i.email,
        i.expires_at,
        i.accepted_at,
        i.revoked_at,
        o.name AS organization_name,
        o.type::text AS organization_type,
        r.code AS role_code
      FROM user_invites i
      JOIN organizations o ON o.id = i.organization_id AND o.deleted_at IS NULL
      JOIN roles r ON r.id = i.role_id
      WHERE i.token_hash = $1
    `,
    [hashToken(token)],
  );
  const invite = result.rows[0];
  if (
    !invite ||
    invite.revoked_at ||
    invite.accepted_at ||
    invite.expires_at.getTime() <= Date.now()
  ) {
    throw notFound('Invite is invalid or has expired');
  }
  return invite;
}
