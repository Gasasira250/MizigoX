import type { Pool } from 'pg';
import { processDueDeliveries } from './notification.queue.js';
import { runNotificationScans } from './notification.scans.js';

const TICK_MS = 15_000;

export function startNotificationWorker(pool: Pool) {
  let stopped = false;
  const timer = setInterval(() => {
    if (stopped) {
      return;
    }
    void processDueDeliveries(pool).catch((error) => {
      console.error('Notification worker delivery tick failed', error);
    });
    void runNotificationScans(pool).catch((error) => {
      console.error('Notification worker scan tick failed', error);
    });
  }, TICK_MS);
  timer.unref?.();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
