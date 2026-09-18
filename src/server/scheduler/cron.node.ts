import cron from 'node-cron';
import { runScheduledMaintenance } from './cron.js';
import { pingAllNodes } from '../services/nodeService.js';
import { getSystemCapabilities } from '../config/capabilities.js';

let isRunningSubscriptionUpdate = false;
let isRunningPingCheck = false;

export function initNodeScheduler() {
  console.log('⏱️ Initializing SubHub Scheduler for Node.js...');

  // Check every 10 minutes for subscription updates
  cron.schedule('*/10 * * * *', async () => {
    if (isRunningSubscriptionUpdate) return;
    isRunningSubscriptionUpdate = true;
    try {
      await runScheduledMaintenance();
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
}
