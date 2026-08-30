import type { Pool } from 'pg';
import { getEnv, isProductionLike, publicAppUrl } from '../../config/env.js';
import { writeAudit } from '../../lib/audit.js';
import { createOpaqueToken, hashPassword, hashToken } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { unprocessable } from '../../lib/errors.js';
import { resolveEmailProvider } from '../notifications/notification.providers.js';
import { passwordSchema } from './auth.schemas.js';

const RESET_TTL_MS = 30 * 60 * 1000;

export async function requestPasswordReset(
  pool: Pool,
  input: { email: string; ip?: string; userAgent?: string; requestId?: string },
): Promise<{ accepted: true; resetToken?: string }> {
  const email = input.email.trim().toLowerCase();
  const user = await pool.query<{
    id: string;
    email: string;
    status: string;
    organization_id: string | null;
  }>(
    `
      SELECT u.id, u.email, u.status,
             (
               SELECT om.organization_id
               FROM organization_memberships om
               WHERE om.user_id = u.id AND om.status = 'ACTIVE'
               ORDER BY om.created_at
               LIMIT 1
             ) AS organization_id
      FROM users u
      WHERE lower(u.email) = $1 AND u.deleted_at IS NULL
      LIMIT 1
    `,
    [email],
  );
  const row = user.rows[0];
  if (!row || row.status !== 'ACTIVE') {
    logger.info('Password reset requested for unknown or inactive account', {
      requestId: input.requestId,
    });
    return { accepted: true };
  }

  await pool.query(
    `
      UPDATE password_reset_tokens
      SET used_at = now()
      WHERE user_id = $1 AND used_at IS NULL
    `,
    [row.id],
  );

  const token = createOpaqueToken();
  await pool.query(
    `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
    [row.id, hashToken(token), new Date(Date.now() + RESET_TTL_MS)],
  );
  await writeAudit(pool, {
    actorUserId: row.id,
    organizationId: row.organization_id ?? undefined,
    action: 'AUTH_PASSWORD_RESET_REQUESTED',
    entityType: 'user',
    entityId: row.id,
    ip: input.ip,
    userAgent: input.userAgent,
    requestId: input.requestId,
  });

  await sendResetEmail(row.email, token);

  if (isProductionLike(getEnv())) {
    return { accepted: true };
  }
  return { accepted: true, resetToken: token };
}

export async function completePasswordReset(
  pool: Pool,
  input: {
    token: string;
    newPassword: string;
    ip?: string;
    userAgent?: string;
    requestId?: string;
  },
) {
  const parsed = passwordSchema.safeParse(input.newPassword);
  if (!parsed.success) {
    throw unprocessable('Password does not meet requirements', parsed.error.issues);
  }

  const stored = await pool.query<{
    id: string;
    user_id: string;
    expires_at: Date;
    used_at: Date | null;
  }>(
    `
      SELECT id, user_id, expires_at, used_at
      FROM password_reset_tokens
      WHERE token_hash = $1
    `,
    [hashToken(input.token)],
  );
  const row = stored.rows[0];
  if (!row || row.used_at || row.expires_at.getTime() <= Date.now()) {
    throw unprocessable('Reset token is invalid or has expired');
  }

  const nextHash = await hashPassword(parsed.data);
  await pool.query(
    `
      UPDATE users
      SET password_hash = $2,
          failed_login_count = 0,
          locked_until = NULL,
          updated_at = now()
      WHERE id = $1
    `,
    [row.user_id, nextHash],
  );
  await pool.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [row.id]);
  await pool.query(
    `
      UPDATE password_reset_tokens
      SET used_at = now()
      WHERE user_id = $1 AND used_at IS NULL
    `,
    [row.user_id],
  );
  await pool.query(
    `
      UPDATE refresh_tokens
      SET revoked_at = now()
      WHERE user_id = $1 AND revoked_at IS NULL
    `,
    [row.user_id],
  );
  await writeAudit(pool, {
    actorUserId: row.user_id,
    action: 'AUTH_PASSWORD_RESET_COMPLETED',
    entityType: 'user',
    entityId: row.user_id,
    ip: input.ip,
    userAgent: input.userAgent,
    requestId: input.requestId,
  });
}

async function sendResetEmail(email: string, token: string) {
  const env = getEnv();
  const url = `${publicAppUrl(env)}/reset-password?token=${encodeURIComponent(token)}`;
  if (!env.NOTIFICATION_EMAIL_ENABLED || env.NOTIFICATION_EMAIL_PROVIDER === 'log') {
    logger.info('Password reset email skipped because a live email provider is not enabled');
    return;
  }
  try {
    const provider = resolveEmailProvider();
    await provider.send({
      to: email,
      subject: 'Reset your MizigoX password',
      text: `A password reset was requested for your MizigoX account.\n\nOpen this link within 30 minutes:\n${url}\n\nIf you did not request this, you can ignore this message.`,
    });
  } catch (error) {
    logger.error('Password reset email failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}
