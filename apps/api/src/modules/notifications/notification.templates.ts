import {
  renderNotificationTemplate,
  type NotificationChannel,
  type NotificationType,
} from '@mizigox/shared';
import type { Pool } from 'pg';

const FALLBACKS: Record<string, { subject: string | null; body: string }> = {
  IN_APP: { subject: null, body: 'You have a new MizigoX notification.' },
  EMAIL: { subject: 'MizigoX notification', body: 'You have a new MizigoX notification.' },
  SMS: { subject: null, body: 'MizigoX: you have a new notification.' },
  PUSH: { subject: null, body: 'You have a new MizigoX notification.' },
};

export async function renderNotificationContent(
  pool: Pool,
  type: NotificationType,
  channel: NotificationChannel,
  variables: Record<string, string | null | undefined>,
) {
  const result = await pool.query<{ subject: string | null; body: string }>(
    `
      SELECT subject, body
      FROM notification_templates
      WHERE type = $1 AND channel = $2 AND language = 'en' AND active = true
      ORDER BY version DESC
      LIMIT 1
    `,
    [type, channel],
  );
  const template = result.rows[0] ?? FALLBACKS[channel] ?? FALLBACKS.IN_APP;
  return {
    subject: template.subject ? renderNotificationTemplate(template.subject, variables) : null,
    body: renderNotificationTemplate(template.body, variables),
    title: template.subject
      ? renderNotificationTemplate(template.subject, variables)
      : renderNotificationTemplate(template.body, variables).slice(0, 120),
  };
}
