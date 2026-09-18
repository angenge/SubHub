import cron from 'node-cron';
import { getAllSubscriptions, refreshSubscription } from '../services/subscriptionService.js';
import { pingAllNodes } from '../services/nodeService.js';
import { getSystemCapabilities } from '../config/capabilities.js';
import { sqlite } from '../db/index.js';

let isRunningSubscriptionUpdate = false;
let isRunningPingCheck = false;

export function initScheduler() {
  console.log('⏱️ Initializing SubHub Scheduler...');

  // Check every 10 minutes for subscription updates
  cron.schedule('*/10 * * * *', async () => {
    if (isRunningSubscriptionUpdate) return;
    isRunningSubscriptionUpdate = true;
    try {
      const subscriptions = getAllSubscriptions();
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
    } finally {
      isRunningSubscriptionUpdate = false;
    }
  });

  // Health check: auto-ping nodes every 30 minutes if tcpPing is enabled
  cron.schedule('*/30 * * * *', async () => {
    if (isRunningPingCheck) return;
    const capabilities = getSystemCapabilities();
    if (!capabilities.features.tcpPing) {
      return;
    }

    isRunningPingCheck = true;
    try {
      console.log('[Scheduler] Running periodic health ping...');
      await pingAllNodes();
      console.log('[Scheduler] Periodic health ping completed.');
    } catch (e: any) {
      console.error('[Scheduler] Health check error:', e.message);
    } finally {
      isRunningPingCheck = false;
    }
  });

  // Daily maintenance at 03:30 AM: prune logs older than 30 days
  cron.schedule('30 3 * * *', () => {
    try {
      console.log('[Scheduler] Running daily database log maintenance...');
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      sqlite.prepare(`DELETE FROM sync_logs WHERE created_at < ?`).run(thirtyDaysAgo);
      sqlite.prepare(`DELETE FROM access_logs WHERE accessed_at < ?`).run(thirtyDaysAgo);
      console.log('[Scheduler] Daily database log maintenance completed.');
    } catch (e: any) {
      console.error('[Scheduler] Log maintenance error:', e.message);
    }
  });
}
