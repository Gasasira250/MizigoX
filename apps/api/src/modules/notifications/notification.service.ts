import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  canReadNotificationDelivery,
  canManageNotifications,
  defaultChannelEnabled,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationDeliveryPayload,
  type NotificationPayload,
  type NotificationPreferencePayload,
  type NotificationTemplatePayload,
} from '@mizigox/shared';
import type { Pool } from 'pg';
import { writeAudit } from '../../lib/audit.js';
import { forbidden, notFound, unprocessable } from '../../lib/errors.js';
import type { AuthContext } from '../auth/auth.types.js';
import { retryDelivery } from './notification.queue.js';

interface ListQuery {
  unread?: boolean;
  type?: string;
  page: number;
  pageSize: number;
}

function mapNotification(row: {
  id: string;
  organization_id: string;
  type: string;
  category: string;
  title: string;
  message: string;
  channel: string;
  priority: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  related_reference: string | null;
  link_path: string | null;
  read_at: Date | null;
  created_at: Date;
  sent_at: Date | null;
}): NotificationPayload {
  return {
    id: row.id,
    organizationId: row.organization_id,
    type: row.type as NotificationPayload['type'],
    category: row.category as NotificationPayload['category'],
    title: row.title,
    message: row.message,
    channel: row.channel as NotificationPayload['channel'],
    priority: row.priority as NotificationPayload['priority'],
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id,
    relatedReference: row.related_reference,
    linkPath: row.link_path,
    readAt: row.read_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    sentAt: row.sent_at?.toISOString() ?? null,
  };
}

export async function listNotifications(pool: Pool, actor: AuthContext, query: ListQuery) {
  const params: unknown[] = [actor.userId];
  const where = [`n.recipient_user_id = $1`, `n.channel = 'IN_APP'`];
  if (query.unread) {
    where.push('n.read_at IS NULL');
  }
  if (query.type) {
    params.push(query.type);
    where.push(`n.type = $${params.length}`);
  }
  const count = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM notifications n WHERE ${where.join(' AND ')}`,
    params,
  );
  params.push(query.pageSize, (query.page - 1) * query.pageSize);
  const result = await pool.query(
    `
      SELECT n.id, n.organization_id, n.type, n.category, n.title, n.message, n.channel, n.priority,
             n.related_entity_type, n.related_entity_id, n.related_reference, n.link_path,
             n.read_at, n.created_at,
             (
               SELECT min(d.sent_at) FROM notification_deliveries d WHERE d.notification_id = n.id
             ) AS sent_at
      FROM notifications n
      WHERE ${where.join(' AND ')}
      ORDER BY n.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );
  return {
    notifications: result.rows.map(mapNotification),
    page: query.page,
    pageSize: query.pageSize,
    total: Number(count.rows[0]?.total ?? 0),
  };
}

export async function unreadCount(pool: Pool, actor: AuthContext) {
  const result = await pool.query<{ count: string }>(
    `
      SELECT count(*)::text AS count
      FROM notifications
      WHERE recipient_user_id = $1 AND channel = 'IN_APP' AND read_at IS NULL
    `,
    [actor.userId],
  );
  return { unreadCount: Number(result.rows[0]?.count ?? 0) };
}

async function loadOwned(pool: Pool, actor: AuthContext, notificationId: string) {
  const result = await pool.query(
    `
      SELECT n.id, n.organization_id, n.type, n.category, n.title, n.message, n.channel, n.priority,
             n.related_entity_type, n.related_entity_id, n.related_reference, n.link_path,
             n.read_at, n.created_at, NULL::timestamptz AS sent_at
      FROM notifications n
      WHERE n.id = $1 AND n.recipient_user_id = $2
    `,
    [notificationId, actor.userId],
  );
  const row = result.rows[0];
  if (!row) {
    throw notFound('Notification not found');
  }
  return mapNotification(row);
}

export async function markRead(pool: Pool, actor: AuthContext, notificationId: string) {
  await loadOwned(pool, actor, notificationId);
  await pool.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND recipient_user_id = $2`,
    [notificationId, actor.userId],
  );
  await pool.query(
    `
      UPDATE notification_deliveries
      SET status = CASE WHEN status IN ('SENT', 'DELIVERED', 'READ') THEN 'READ' ELSE status END
      WHERE notification_id = $1 AND channel = 'IN_APP'
    `,
    [notificationId],
  );
  return loadOwned(pool, actor, notificationId);
}

export async function markUnread(pool: Pool, actor: AuthContext, notificationId: string) {
  await loadOwned(pool, actor, notificationId);
  await pool.query(
    `UPDATE notifications SET read_at = NULL WHERE id = $1 AND recipient_user_id = $2`,
    [notificationId, actor.userId],
  );
  return loadOwned(pool, actor, notificationId);
}

export async function markAllRead(pool: Pool, actor: AuthContext) {
  const result = await pool.query(
    `
      UPDATE notifications
      SET read_at = now()
      WHERE recipient_user_id = $1 AND channel = 'IN_APP' AND read_at IS NULL
    `,
    [actor.userId],
  );
  return { updated: result.rowCount ?? 0 };
}

export async function getPreferences(pool: Pool, actor: AuthContext) {
  const stored = await pool.query<{
    category: NotificationCategory;
    channel: NotificationChannel;
    enabled: boolean;
    digest: 'IMMEDIATE' | 'DAILY';
  }>(`SELECT category, channel, enabled, digest FROM notification_preferences WHERE user_id = $1`, [
    actor.userId,
  ]);
  const byKey = new Map(stored.rows.map((row) => [`${row.category}:${row.channel}`, row] as const));
  const items: NotificationPreferencePayload[] = [];
  for (const category of NOTIFICATION_CATEGORIES) {
    for (const channel of NOTIFICATION_CHANNELS) {
      const row = byKey.get(`${category}:${channel}`);
      const mandatory = category === 'ACCOUNT' && (channel === 'IN_APP' || channel === 'EMAIL');
      items.push({
        category,
        channel,
        enabled: row?.enabled ?? defaultChannelEnabled(category, channel),
        digest: row?.digest ?? 'IMMEDIATE',
        mandatory,
      });
    }
  }
  return items;
}

export async function updatePreferences(
  pool: Pool,
  actor: AuthContext,
  updates: Array<{
    category: NotificationCategory;
    channel: NotificationChannel;
    enabled: boolean;
    digest?: 'IMMEDIATE' | 'DAILY';
  }>,
) {
  for (const update of updates) {
    if (
      update.category === 'ACCOUNT' &&
      (update.channel === 'IN_APP' || update.channel === 'EMAIL') &&
      update.enabled === false
    ) {
      throw unprocessable('Account and security notifications cannot be disabled');
    }
    await pool.query(
      `
        INSERT INTO notification_preferences (user_id, category, channel, enabled, digest)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, category, channel)
        DO UPDATE SET enabled = EXCLUDED.enabled, digest = EXCLUDED.digest, updated_at = now()
      `,
      [actor.userId, update.category, update.channel, update.enabled, update.digest ?? 'IMMEDIATE'],
    );
  }
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: actor.orgId,
    action: 'NOTIFICATION_PREFERENCES_CHANGED',
    entityType: 'notification_preference',
    entityId: actor.userId,
    after: { updates },
  });
  return getPreferences(pool, actor);
}

export async function listDeliveries(
  pool: Pool,
  actor: AuthContext,
  query: {
    status?: string;
    channel?: string;
    type?: string;
    page: number;
    pageSize: number;
  },
) {
  if (!canReadNotificationDelivery(actor.permissions)) {
    throw forbidden();
  }
  const params: unknown[] = [];
  const where = ['1=1'];
  if (actor.orgType !== 'PLATFORM') {
    params.push(actor.orgId);
    where.push(`d.organization_id = $${params.length}`);
  }
  if (query.status) {
    params.push(query.status);
    where.push(`d.status = $${params.length}`);
  }
  if (query.channel) {
    params.push(query.channel);
    where.push(`d.channel = $${params.length}`);
  }
  if (query.type) {
    params.push(query.type);
    where.push(`n.type = $${params.length}`);
  }
  const count = await pool.query<{ total: string }>(
    `
      SELECT count(*)::text AS total
      FROM notification_deliveries d
      JOIN notifications n ON n.id = d.notification_id
      WHERE ${where.join(' AND ')}
    `,
    params,
  );
  params.push(query.pageSize, (query.page - 1) * query.pageSize);
  const result = await pool.query(
    `
      SELECT d.id, d.notification_id, d.organization_id, n.type, d.channel, d.status,
             n.recipient_user_id, n.recipient_email,
             coalesce(u.first_name || ' ' || u.last_name, n.recipient_email) AS recipient_name,
             d.attempts, d.max_attempts, d.last_error, d.provider, d.sent_at, d.delivered_at, d.created_at,
             n.title, n.message
      FROM notification_deliveries d
      JOIN notifications n ON n.id = d.notification_id
      LEFT JOIN users u ON u.id = n.recipient_user_id
      WHERE ${where.join(' AND ')}
      ORDER BY d.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params,
  );
  const includeBody = canManageNotifications(actor.permissions);
  const deliveries: NotificationDeliveryPayload[] = result.rows.map((row) => ({
    id: row.id,
    notificationId: row.notification_id,
    organizationId: row.organization_id,
    type: row.type,
    channel: row.channel,
    status: row.status,
    recipientUserId: row.recipient_user_id,
    recipientName: row.recipient_name,
    recipientEmail: includeBody ? row.recipient_email : maskEmail(row.recipient_email),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    provider: row.provider,
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    title: includeBody ? row.title : undefined,
    message: includeBody ? row.message : undefined,
  }));
  return {
    deliveries,
    page: query.page,
    pageSize: query.pageSize,
    total: Number(count.rows[0]?.total ?? 0),
  };
}

function maskEmail(email: string | null) {
  if (!email || !email.includes('@')) {
    return null;
  }
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}

export async function retryNotificationDelivery(
  pool: Pool,
  actor: AuthContext,
  deliveryId: string,
) {
  const found = await pool.query<{ id: string; organization_id: string }>(
    `SELECT id, organization_id FROM notification_deliveries WHERE id = $1`,
    [deliveryId],
  );
  const row = found.rows[0];
  if (!row) {
    throw notFound('Delivery not found');
  }
  if (actor.orgType !== 'PLATFORM' && row.organization_id !== actor.orgId) {
    throw forbidden();
  }
  const ok = await retryDelivery(pool, deliveryId);
  if (!ok) {
    throw notFound('Delivery not found');
  }
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: row.organization_id,
    action: 'NOTIFICATION_RETRY',
    entityType: 'notification_delivery',
    entityId: deliveryId,
  });
  return { id: deliveryId, queued: true };
}

export async function listTemplates(pool: Pool, actor: AuthContext) {
  const result = await pool.query(
    `
      SELECT DISTINCT ON (type, channel, language)
             id, type, channel, language, version, subject, body, active, updated_at
      FROM notification_templates
      ORDER BY type, channel, language, version DESC
    `,
  );
  void actor;
  return result.rows.map((row): NotificationTemplatePayload => ({
    id: row.id,
    type: row.type,
    channel: row.channel,
    language: row.language,
    version: row.version,
    subject: row.subject,
    body: row.body,
    active: row.active,
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

export async function updateTemplate(
  pool: Pool,
  actor: AuthContext,
  templateId: string,
  input: { subject?: string | null; body?: string; active?: boolean },
) {
  const current = await pool.query<{
    id: string;
    type: string;
    channel: string;
    language: string;
    version: number;
    subject: string | null;
    body: string;
    active: boolean;
  }>(`SELECT * FROM notification_templates WHERE id = $1`, [templateId]);
  const row = current.rows[0];
  if (!row) {
    throw notFound('Template not found');
  }
  const created = await pool.query<{ id: string }>(
    `
      INSERT INTO notification_templates (type, channel, language, version, subject, body, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `,
    [
      row.type,
      row.channel,
      row.language,
      row.version + 1,
      input.subject === undefined ? row.subject : input.subject,
      input.body ?? row.body,
      input.active ?? row.active,
    ],
  );
  await pool.query(`UPDATE notification_templates SET active = false WHERE id = $1`, [templateId]);
  await writeAudit(pool, {
    actorUserId: actor.userId,
    organizationId: actor.orgId,
    action: 'NOTIFICATION_TEMPLATE_CHANGED',
    entityType: 'notification_template',
    entityId: created.rows[0]!.id,
    before: { type: row.type, channel: row.channel, version: row.version },
    after: { version: row.version + 1, subject: input.subject ?? row.subject },
  });
  const templates = await listTemplates(pool, actor);
  return templates.find((item) => item.id === created.rows[0]!.id) ?? templates[0];
}

export async function listDeviceTokens(pool: Pool, actor: AuthContext) {
  const result = await pool.query(
    `
      SELECT id, platform, device_name, active, last_seen_at, created_at
      FROM notification_device_tokens
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
    [actor.userId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    platform: row.platform,
    deviceName: row.device_name,
    active: row.active,
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function registerDeviceToken(
  pool: Pool,
  actor: AuthContext,
  input: { platform: string; token: string; deviceName?: string },
) {
  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO notification_device_tokens (
        user_id, organization_id, platform, token, device_name, active, last_seen_at
      )
      VALUES ($1, $2, $3, $4, $5, true, now())
      ON CONFLICT (user_id, token)
      DO UPDATE SET
        platform = EXCLUDED.platform,
        device_name = EXCLUDED.device_name,
        active = true,
        last_seen_at = now(),
        updated_at = now()
      RETURNING id
    `,
    [actor.userId, actor.orgId, input.platform, input.token, input.deviceName ?? null],
  );
  return { id: result.rows[0]!.id, active: true };
}

export async function deactivateDeviceToken(pool: Pool, actor: AuthContext, tokenId: string) {
  const result = await pool.query(
    `
      UPDATE notification_device_tokens
      SET active = false, updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `,
    [tokenId, actor.userId],
  );
  if (!result.rows[0]) {
    throw notFound('Device token not found');
  }
  return { id: tokenId, active: false };
}
