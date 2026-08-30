import {
  defaultChannelEnabled,
  isMandatoryNotificationType,
  notificationCategory,
  notificationPriority,
  type NotificationChannel,
  type NotificationType,
} from '@mizigox/shared';
import type { Pool } from 'pg';
import { getEnv } from '../../config/env.js';
import { resolveRecipients } from './notification.recipients.js';
import { renderNotificationContent } from './notification.templates.js';
import type { NotificationEvent, ResolvedRecipient } from './notification.types.js';
import { processDueDeliveries } from './notification.queue.js';

const ALL_CHANNELS: NotificationChannel[] = ['IN_APP', 'EMAIL', 'SMS', 'PUSH'];

function linkPathFor(event: NotificationEvent, recipient: ResolvedRecipient) {
  const entityId = event.relatedEntityId;
  if (!entityId) {
    if (recipient.orgType === 'CUSTOMER') return '/portal/notifications';
    if (recipient.role === 'DRIVER') return '/driver/notifications';
    return '/admin/notifications';
  }
  if (recipient.orgType === 'CUSTOMER') {
    if (event.relatedEntityType === 'shipment') return `/portal/shipments/${entityId}`;
    if (event.relatedEntityType === 'invoice') return `/portal/invoices/${entityId}`;
    return '/portal/notifications';
  }
  if (recipient.role === 'DRIVER') {
    return '/driver';
  }
  switch (event.relatedEntityType) {
    case 'shipment':
      return `/admin/shipments/${entityId}`;
    case 'invoice':
      return `/admin/invoices/${entityId}`;
    case 'payment':
      return `/admin/payments/${entityId}`;
    case 'route':
      return `/admin/routes/${entityId}`;
    case 'vehicle':
      return `/admin/vehicles/${entityId}`;
    case 'driver':
      return `/admin/drivers/${entityId}`;
    default:
      return '/admin/notifications';
  }
}

async function preferenceEnabled(
  pool: Pool,
  userId: string | null,
  type: NotificationType,
  channel: NotificationChannel,
) {
  if (isMandatoryNotificationType(type) && (channel === 'IN_APP' || channel === 'EMAIL')) {
    return true;
  }
  const category = notificationCategory(type);
  if (!userId) {
    return defaultChannelEnabled(category, channel, type);
  }
  const stored = await pool.query<{ enabled: boolean }>(
    `
      SELECT enabled
      FROM notification_preferences
      WHERE user_id = $1 AND category = $2 AND channel = $3
    `,
    [userId, category, channel],
  );
  if (stored.rows[0]) {
    return stored.rows[0].enabled;
  }
  return defaultChannelEnabled(category, channel, type);
}

function channelsForEvent(event: NotificationEvent): NotificationChannel[] {
  if (event.channels?.length) {
    return event.channels;
  }
  if (!event.recipientUserId && event.recipientEmail) {
    return ['EMAIL'];
  }
  return ALL_CHANNELS;
}

function isValidEmail(value: string | null) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function isValidPhone(value: string | null) {
  return Boolean(value && /^\+[1-9]\d{7,14}$/.test(value));
}

export async function dispatchNotificationEvent(pool: Pool, event: NotificationEvent) {
  const recipients = await resolveRecipients(pool, event);
  const env = getEnv();
  let created = 0;

  for (const recipient of recipients) {
    const variables = {
      ...event.variables,
      recipient_name: `${recipient.firstName} ${recipient.lastName}`.trim(),
      organization_name: event.variables?.organization_name ?? '',
    };
    const enabledChannels: NotificationChannel[] = [];
    for (const channel of channelsForEvent(event)) {
      if (await preferenceEnabled(pool, recipient.userId, event.type, channel)) {
        enabledChannels.push(channel);
      }
    }
    if (enabledChannels.length === 0) {
      continue;
    }

    const inAppEnabled = enabledChannels.includes('IN_APP') && Boolean(recipient.userId);
    const primaryChannel: NotificationChannel = inAppEnabled ? 'IN_APP' : enabledChannels[0]!;
    const content = await renderNotificationContent(pool, event.type, primaryChannel, variables);
    const dedupeKey = [
      event.type,
      event.relatedEntityId ?? event.relatedReference ?? 'none',
      recipient.userId ?? recipient.email ?? recipient.phone ?? 'anon',
      primaryChannel,
      event.idempotencySuffix ?? 'once',
    ].join(':');

    const inserted = await pool.query<{ id: string }>(
      `
        INSERT INTO notifications (
          organization_id, recipient_user_id, recipient_email, recipient_phone,
          type, category, title, message, channel, priority,
          related_entity_type, related_entity_id, related_reference, link_path,
          dedupe_key, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING id
      `,
      [
        event.organizationId,
        recipient.userId,
        recipient.email,
        recipient.phone,
        event.type,
        notificationCategory(event.type),
        content.title,
        content.body,
        primaryChannel,
        notificationPriority(event.type),
        event.relatedEntityType ?? null,
        event.relatedEntityId ?? null,
        event.relatedReference ?? null,
        linkPathFor(event, recipient),
        dedupeKey,
        JSON.stringify({ actorUserId: event.actorUserId ?? null }),
      ],
    );
    const notificationId = inserted.rows[0]?.id;
    if (!notificationId) {
      continue;
    }
    created += 1;

    for (const channel of enabledChannels) {
      if (channel === 'EMAIL' && !isValidEmail(recipient.email)) {
        continue;
      }
      if (channel === 'SMS' && !isValidPhone(recipient.phone)) {
        continue;
      }
      if (channel === 'IN_APP' && !recipient.userId) {
        continue;
      }
      const channelContent = await renderNotificationContent(pool, event.type, channel, variables);
      const deliveryKey = [
        event.type,
        event.relatedEntityId ?? event.relatedReference ?? 'none',
        recipient.userId ?? recipient.email ?? recipient.phone ?? 'anon',
        channel,
        event.idempotencySuffix ?? 'once',
      ].join(':');
      const immediate = channel === 'IN_APP';
      await pool.query(
        `
          INSERT INTO notification_deliveries (
            notification_id, organization_id, channel, status, attempts, max_attempts,
            next_retry_at, provider, idempotency_key, sent_at, metadata
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb
          )
          ON CONFLICT (idempotency_key) DO NOTHING
        `,
        [
          notificationId,
          event.organizationId,
          channel,
          immediate ? 'SENT' : 'QUEUED',
          immediate ? 1 : 0,
          env.NOTIFICATION_MAX_ATTEMPTS,
          immediate ? null : new Date(),
          immediate ? 'in-app' : null,
          deliveryKey,
          immediate ? new Date() : null,
          JSON.stringify({
            subject: channelContent.subject,
            body: channelContent.body,
            toEmail: recipient.email,
            toPhone: recipient.phone,
          }),
        ],
      );
    }
  }

  if (created > 0 && env.NODE_ENV !== 'test') {
    setImmediate(() => {
      void processDueDeliveries(pool).catch((error) => {
        console.error('Notification delivery processing failed', error);
      });
    });
  }

  return created;
}
