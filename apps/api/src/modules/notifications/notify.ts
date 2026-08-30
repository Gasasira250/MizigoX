import type { Pool } from 'pg';
import { logger } from '../../lib/logger.js';
import { dispatchNotificationEvent } from './notification.dispatch.js';
import type { NotificationEvent } from './notification.types.js';

export async function emitNotificationNow(pool: Pool, event: NotificationEvent) {
  return dispatchNotificationEvent(pool, event);
}

export async function emitNotification(pool: Pool, event: NotificationEvent) {
  try {
    return await dispatchNotificationEvent(pool, event);
  } catch (error) {
    logger.error('Failed to emit notification', {
      type: event.type,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return 0;
  }
}
