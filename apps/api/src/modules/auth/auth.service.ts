import { randomUUID } from 'node:crypto';
import type { SessionUser } from '@mizigox/shared';
import jwt from 'jsonwebtoken';
import type { Pool } from 'pg';
import { getEnv } from '../../config/env.js';
import { writeAudit } from '../../lib/audit.js';
import { createOpaqueToken, hashToken, hashPassword, verifyPassword } from '../../lib/crypto.js';
import { forbidden, unauthorized } from '../../lib/errors.js';
import type { AccessTokenClaims, AuthContext } from './auth.types.js';

const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;
const REFRESH_COOKIE = 'mx_refresh';

interface MembershipRow {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  user_status: string;
  email_verified_at: Date | null;
  locked_until: Date | null;
  failed_login_count: number;
  password_hash: string;
  organization_id: string;
  organization_name: string;
  organization_type: string;
  country_code: string;
  default_currency_code: string;
  role_code: string;
  permissions: string[];
}

export function refreshCookieName() {
  return REFRESH_COOKIE;
}

export function toSessionUser(auth: AuthContext): SessionUser {
  return {
    id: auth.userId,
    email: auth.email,
    firstName: auth.firstName,
    lastName: auth.lastName,
    role: auth.role,
    permissions: auth.permissions,
    organization: {
      id: auth.orgId,
      name: auth.orgName,
      type: auth.orgType,
      countryCode: auth.countryCode,
      defaultCurrencyCode: auth.currencyCode,
    },
  };
}

export function signAccessToken(auth: AuthContext) {
  const env = getEnv();
  const claims: AccessTokenClaims = {
    sub: auth.userId,
    email: auth.email,
    firstName: auth.firstName,
    lastName: auth.lastName,
    orgId: auth.orgId,
    orgName: auth.orgName,
    orgType: auth.orgType,
    role: auth.role,
    permissions: auth.permissions,
    countryCode: auth.countryCode,
    currencyCode: auth.currencyCode,
    jti: randomUUID(),
  };

  const accessToken = jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
  });

  return { accessToken, expiresIn: env.JWT_ACCESS_TTL_SECONDS };
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const env = getEnv();
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenClaims;
}

export async function login(
  pool: Pool,
  input: {
    email: string;
    password: string;
    ip?: string;
    userAgent?: string;
    requestId?: string;
  },
) {
  const user = await loadMembershipByEmail(pool, input.email);

  if (!user) {
    await writeAudit(pool, {
      action: 'AUTH_LOGIN_FAILURE',
      entityType: 'user',
      entityId: input.email.toLowerCase(),
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
      after: { reason: 'unknown_user' },
    });
    throw unauthorized('Invalid email or password');
  }

  if (user.locked_until && user.locked_until.getTime() > Date.now()) {
    throw unauthorized('Account is temporarily locked. Try again later.');
  }

  const passwordMatches = await verifyPassword(user.password_hash, input.password);
  if (!passwordMatches) {
    const failedCount = user.failed_login_count + 1;
    const lockedUntil =
      failedCount >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null;
    await pool.query(
      `
        UPDATE users
        SET failed_login_count = $2,
            locked_until = $3,
            updated_at = now()
        WHERE id = $1
      `,
      [user.user_id, failedCount, lockedUntil],
    );
    await writeAudit(pool, {
      actorUserId: user.user_id,
      organizationId: user.organization_id,
      action: 'AUTH_LOGIN_FAILURE',
      entityType: 'user',
      entityId: user.user_id,
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
      after: { reason: 'invalid_password', failedCount },
    });
    throw unauthorized('Invalid email or password');
  }

  if (user.user_status !== 'ACTIVE') {
    throw forbidden('This account is not active');
  }

  if (!user.email_verified_at) {
    throw forbidden('Email address has not been verified');
  }

  await pool.query(
    `
      UPDATE users
      SET failed_login_count = 0,
          locked_until = NULL,
          last_login_at = now(),
          updated_at = now()
      WHERE id = $1
    `,
    [user.user_id],
  );

  const auth = membershipToAuth(user);
  await writeAudit(pool, {
    actorUserId: auth.userId,
    organizationId: auth.orgId,
    action: 'AUTH_LOGIN_SUCCESS',
    entityType: 'user',
    entityId: auth.userId,
    ip: input.ip,
    userAgent: input.userAgent,
    requestId: input.requestId,
  });

  return createSession(pool, auth, input);
}

export async function refreshSession(
  pool: Pool,
  input: { refreshToken?: string; ip?: string; userAgent?: string },
) {
  if (!input.refreshToken) {
    throw unauthorized('Refresh token is missing');
  }

  const tokenHash = hashToken(input.refreshToken);
  const stored = await pool.query<{
    id: string;
    user_id: string;
    expires_at: Date;
    revoked_at: Date | null;
  }>(
    `
      SELECT id, user_id, expires_at, revoked_at
      FROM refresh_tokens
      WHERE token_hash = $1
    `,
    [tokenHash],
  );

  const row = stored.rows[0];
  if (!row || row.revoked_at || row.expires_at.getTime() <= Date.now()) {
    throw unauthorized('Refresh token is invalid or expired');
  }

  await pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [row.id]);

  const membership = await loadMembershipByUserId(pool, row.user_id);
  if (!membership || membership.user_status !== 'ACTIVE') {
    throw unauthorized('Session is no longer valid');
  }

  const auth = membershipToAuth(membership);
  return createSession(pool, auth, input);
}

export async function logout(pool: Pool, refreshToken: string | undefined, actorUserId?: string) {
  if (refreshToken) {
    await pool.query(
      `
        UPDATE refresh_tokens
        SET revoked_at = now()
        WHERE token_hash = $1 AND revoked_at IS NULL
      `,
      [hashToken(refreshToken)],
    );
  }

  if (actorUserId) {
    await writeAudit(pool, {
      actorUserId,
      action: 'AUTH_LOGOUT',
      entityType: 'user',
      entityId: actorUserId,
    });
  }
}

export async function loadAuthContext(pool: Pool, userId: string): Promise<AuthContext> {
  const membership = await loadMembershipByUserId(pool, userId);
  if (!membership) {
    throw unauthorized('Session is no longer valid');
  }
  return membershipToAuth(membership);
}

export async function createSession(
  pool: Pool,
  auth: AuthContext,
  input: { ip?: string; userAgent?: string },
) {
  const tokens = signAccessToken(auth);
  const refreshToken = await issueRefreshToken(pool, {
    userId: auth.userId,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return {
    ...tokens,
    refreshToken,
    user: toSessionUser(auth),
  };
}

export async function changePassword(
  pool: Pool,
  input: {
    userId: string;
    currentPassword: string;
    newPassword: string;
    requestId?: string;
  },
) {
  const row = await pool.query<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
    [input.userId],
  );
  const current = row.rows[0];
  if (!current) {
    throw unauthorized('Session is no longer valid');
  }

  const matches = await verifyPassword(current.password_hash, input.currentPassword);
  if (!matches) {
    throw unauthorized('Current password is incorrect');
  }

  const nextHash = await hashPassword(input.newPassword);
  await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [input.userId, nextHash]);
  await pool.query(
    `
      UPDATE refresh_tokens
      SET revoked_at = now()
      WHERE user_id = $1 AND revoked_at IS NULL
    `,
    [input.userId],
  );
  await writeAudit(pool, {
    actorUserId: input.userId,
    action: 'AUTH_PASSWORD_CHANGED',
    entityType: 'user',
    entityId: input.userId,
    requestId: input.requestId,
  });
}

async function issueRefreshToken(
  pool: Pool,
  input: { userId: string; ip?: string; userAgent?: string },
) {
  const env = getEnv();
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    `
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [input.userId, hashToken(token), expiresAt, input.userAgent ?? null, input.ip ?? null],
  );
  return token;
}

async function loadMembershipByEmail(pool: Pool, email: string) {
  const result = await pool.query<MembershipRow>(
    `${membershipSelect()} WHERE lower(u.email) = lower($1) AND u.deleted_at IS NULL LIMIT 1`,
    [email],
  );
  return result.rows[0];
}

async function loadMembershipByUserId(pool: Pool, userId: string) {
  const result = await pool.query<MembershipRow>(
    `${membershipSelect()} WHERE u.id = $1 AND u.deleted_at IS NULL LIMIT 1`,
    [userId],
  );
  return result.rows[0];
}

function membershipSelect() {
  return `
    SELECT
      u.id AS user_id,
      u.email,
      u.first_name,
      u.last_name,
      u.status AS user_status,
      u.email_verified_at,
      u.locked_until,
      u.failed_login_count,
      u.password_hash,
      o.id AS organization_id,
      o.name AS organization_name,
      o.type::text AS organization_type,
      o.country_code,
      o.default_currency_code,
      r.code AS role_code,
      COALESCE(
        (
          SELECT array_agg(p.code ORDER BY p.code)
          FROM role_permissions rp
          JOIN permissions p ON p.id = rp.permission_id
          WHERE rp.role_id = r.id
        ),
        ARRAY[]::text[]
      ) AS permissions
    FROM users u
    JOIN organization_memberships m ON m.user_id = u.id AND m.status = 'ACTIVE'
    JOIN organizations o ON o.id = m.organization_id AND o.deleted_at IS NULL
    JOIN roles r ON r.id = m.role_id
  `;
}

function membershipToAuth(row: MembershipRow): AuthContext {
  return {
    userId: row.user_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    orgId: row.organization_id,
    orgName: row.organization_name,
    orgType: row.organization_type as AuthContext['orgType'],
    role: row.role_code as AuthContext['role'],
    permissions: row.permissions ?? [],
    countryCode: row.country_code,
    currencyCode: row.default_currency_code,
  };
}
