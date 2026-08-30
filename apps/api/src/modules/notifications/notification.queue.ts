import { getEnv } from '../../config/env.js';
import { writeAudit } from '../../lib/audit.js';
import type { Pool } from 'pg';
import {
  isPermanentDeliveryError,
  resolveEmailProvider,
  resolvePushProvider,
  resolveSmsProvider,
  safeDeliveryError,
} from './notification.providers.js';

function backoffMs(attempts: number) {
  const minutes = [1, 5, 15, 60, 360];
  return (minutes[Math.min(attempts, minutes.length) - 1] ?? 360) * 60 * 1000;
}

function parseMetadata(value: unknown): {
  subject?: string | null;
  body?: string;
  toEmail?: string | null;
  toPhone?: string | null;
} {
  if (!value) {
    return {};
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as ReturnType<typeof parseMetadata>;
    } catch {
      return {};
    }
  }
  if (typeof value === 'object') {
    return value as ReturnType<typeof parseMetadata>;
  }
  return {};
}

export async function processDueDeliveries(pool: Pool, limit = 50) {
  let processed = 0;
  let batchSize = 0;
  let rounds = 0;
  do {
    batchSize = await processDeliveryBatch(pool, limit);
    processed += batchSize;
    rounds += 1;
  } while (batchSize === limit && rounds < 40);
  return processed;
}

async function processDeliveryBatch(pool: Pool, limit: number) {
  const client = await pool.connect();
  let processed = 0;
  try {
    await client.query('BEGIN');
    const due = await client.query<{
      id: string;
      notification_id: string;
      organization_id: string;
      channel: string;
      attempts: number;
      max_attempts: number;
      metadata: unknown;
    }>(
      `
        SELECT id, notification_id, organization_id, channel, attempts, max_attempts, metadata
        FROM notification_deliveries
        WHERE status IN ('PENDING', 'QUEUED', 'FAILED')
          AND attempts < max_attempts
          AND (next_retry_at IS NULL OR next_retry_at <= now())
        ORDER BY created_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `,
      [limit],
    );
    if (due.rows.length > 0) {
      await client.query(
        `
          UPDATE notification_deliveries
          SET next_retry_at = now() + interval '10 minutes'
          WHERE id = ANY($1::uuid[])
        `,
        [due.rows.map((row) => row.id)],
      );
    }
    await client.query('COMMIT');

    for (const row of due.rows) {
      processed += 1;
      await deliverOne(pool, {
        ...row,
        metadata: parseMetadata(row.metadata),
      });
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return processed;
}

async function deliverOne(
  pool: Pool,
  row: {
    id: string;
    notification_id: string;
    organization_id: string;
    channel: string;
    attempts: number;
    max_attempts: number;
    metadata: {
      subject?: string | null;
      body?: string;
      toEmail?: string | null;
      toPhone?: string | null;
    };
  },
) {
  const attempts = row.attempts + 1;
  try {
    if (row.channel === 'IN_APP') {
      await markSent(pool, row.id, attempts, 'in-app', undefined);
      return;
    }

    const notification = await pool.query<{ title: string; message: string }>(
      `SELECT title, message FROM notifications WHERE id = $1`,
      [row.notification_id],
    );
    const title = row.metadata.subject || notification.rows[0]?.title || 'MizigoX';
    const body = row.metadata.body || notification.rows[0]?.message || '';

    if (row.channel === 'EMAIL') {
      const to = row.metadata.toEmail;
      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        await markFailed(pool, row, attempts, 'Invalid recipient email', true);
        return;
      }
      const result = await resolveEmailProvider().send({ to, subject: title, text: body });
      await markSent(pool, row.id, attempts, result.provider, result.providerMessageId);
      return;
    }

    if (row.channel === 'SMS') {
      const to = row.metadata.toPhone;
      if (!to || !/^\+[1-9]\d{7,14}$/.test(to)) {
        await markFailed(pool, row, attempts, 'Invalid recipient phone', true);
        return;
      }
      const result = await resolveSmsProvider().send({ to, body });
      await markSent(pool, row.id, attempts, result.provider, result.providerMessageId);
      return;
    }

    if (row.channel === 'PUSH') {
      const tokens = await pool.query<{ token: string }>(
        `
          SELECT t.token
          FROM notification_device_tokens t
          JOIN notifications n ON n.id = $1
          WHERE t.user_id = n.recipient_user_id AND t.active = true
        `,
        [row.notification_id],
      );
      if (tokens.rows.length === 0) {
        await markFailed(pool, row, attempts, 'No active device tokens', true);
        return;
      }
      const provider = resolvePushProvider();
      let lastId: string | undefined;
      for (const token of tokens.rows) {
        const result = await provider.send({ token: token.token, title, body });
        lastId = result.providerMessageId;
      }
      await markSent(pool, row.id, attempts, provider.name, lastId);
      return;
    }

    await markFailed(pool, row, attempts, `Unsupported channel ${row.channel}`, true);
  } catch (error) {
    const permanent = isPermanentDeliveryError(error) || attempts >= row.max_attempts;
    await markFailed(pool, row, attempts, safeDeliveryError(error), permanent);
  }
}

async function markSent(
  pool: Pool,
  id: string,
  attempts: number,
  provider: string,
  providerMessageId?: string,
) {
  await pool.query(
    `
      UPDATE notification_deliveries
      SET status = 'SENT',
          attempts = $2,
          provider = $3,
          provider_message_id = $4,
          sent_at = now(),
          last_error = NULL,
          next_retry_at = NULL
      WHERE id = $1
    `,
    [id, attempts, provider, providerMessageId ?? null],
  );
}

async function markFailed(
  pool: Pool,
  row: { id: string; organization_id: string; max_attempts: number },
  attempts: number,
  reason: string,
  permanent: boolean,
) {
  const terminal = permanent || attempts >= row.max_attempts;
  await pool.query(
    `
      UPDATE notification_deliveries
      SET status = 'FAILED',
          attempts = $2,
          last_error = $3,
          next_retry_at = $4
      WHERE id = $1
    `,
    [row.id, attempts, reason, terminal ? null : new Date(Date.now() + backoffMs(attempts))],
  );
  if (terminal) {
    await writeAudit(pool, {
      organizationId: row.organization_id,
      action: 'NOTIFICATION_DELIVERY_FAILED',
      entityType: 'notification_delivery',
      entityId: row.id,
      after: { reason, attempts },
    });
  }
}

export async function retryDelivery(pool: Pool, deliveryId: string) {
  const env = getEnv();
  const updated = await pool.query<{ id: string }>(
    `
      UPDATE notification_deliveries
      SET status = 'QUEUED',
          next_retry_at = now(),
          max_attempts = GREATEST(max_attempts, attempts + 1, $2),
          last_error = NULL
      WHERE id = $1
      RETURNING id
    `,
    [deliveryId, env.NOTIFICATION_MAX_ATTEMPTS],
  );
  return Boolean(updated.rows[0]);
}
