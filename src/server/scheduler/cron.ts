import { lt } from 'drizzle-orm';
import { getAllSubscriptions, refreshSubscription } from '../services/subscriptionService.js';
import { db, schema } from '../db/index.js';

export async function runScheduledMaintenance() {
  try {
    const subscriptions = await getAllSubscriptions();
    const now = Date.now();

    for (const sub of subscriptions) {
      if (!sub.autoUpdate || sub.status === 'disabled') continue;

      const intervalMs = (sub.updateInterval || 360) * 60 * 1000;
      const lastUpdated = sub.lastUpdatedAt ? new Date(sub.lastUpdatedAt).getTime() : 0;

      if (now - lastUpdated >= intervalMs) {
        console.log(`[Scheduler] Auto-updating subscription: ${sub.name} (${sub.id})`);
        try {
          await refreshSubscription(sub.id, 'cron');
        } catch (err: any) {
          console.error(`[Scheduler] Failed to update subscription ${sub.name}:`, err.message);
        }
      }
    }
  } catch (e: any) {
    console.error('[Scheduler] Error in subscription check:', e.message);
  }

  // Prune logs older than 30 days
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.delete(schema.syncLogs).where(lt(schema.syncLogs.createdAt, thirtyDaysAgo));
    await db.delete(schema.accessLogs).where(lt(schema.accessLogs.accessedAt, thirtyDaysAgo));
  } catch (e: any) {
    console.error('[Scheduler] Log maintenance error:', e.message);
  }
}
