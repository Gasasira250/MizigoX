import type { Pool } from 'pg';
import { dispatchNotificationEvent } from './notification.dispatch.js';
import type { NotificationEvent } from './notification.types.js';

export async function emitNotificationNow(pool: Pool, event: NotificationEvent) {
  return dispatchNotificationEvent(pool, event);
}

export async function emitNotification(pool: Pool, event: NotificationEvent) {
  try {
    return await dispatchNotificationEvent(pool, event);
  } catch (error) {
    console.error('Failed to emit notification', event.type, error);
    return 0;
  }
}
