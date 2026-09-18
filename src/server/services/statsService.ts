import { DashboardStats } from '../../core/types/index.js';
import { getAllNodes } from './nodeService.js';
import { getAllSubscriptions } from './subscriptionService.js';

export async function getDashboardStats(): Promise<DashboardStats> {
  const subscriptions = await getAllSubscriptions();
  const nodes = await getAllNodes();

  let onlineNodes = 0;
  let slowNodes = 0;
  let timeoutNodes = 0;

  const countryMap = new Map<string, { country: string; code: string; count: number }>();
  const protocolMap = new Map<string, number>();

  let totalTrafficUsed = 0;
  let totalTrafficQuota = 0;

  for (const sub of subscriptions) {
    if (sub.upload || sub.download) {
      totalTrafficUsed += (sub.upload || 0) + (sub.download || 0);
    }
    if (sub.total) {
      totalTrafficQuota += sub.total;
    }
  }

  for (const node of nodes) {
    // Status counts
    if (node.status === 'online') onlineNodes++;
    else if (node.status === 'slow') slowNodes++;
    else if (node.status === 'timeout') timeoutNodes++;

    // Country distribution
    const cName = node.country || '其他';
    const cCode = node.countryCode || 'OTHER';
    const existing = countryMap.get(cName) || { country: cName, code: cCode, count: 0 };
    existing.count++;
    countryMap.set(cName, existing);

    // Protocol distribution
    const proto = (node.type || 'unknown').toUpperCase();
    protocolMap.set(proto, (protocolMap.get(proto) || 0) + 1);
  }

  const countryDistribution = Array.from(countryMap.values()).sort((a, b) => b.count - a.count);
  const protocolDistribution = Array.from(protocolMap.entries())
    .map(([protocol, count]) => ({ protocol, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalSubscriptions: subscriptions.length,
    totalNodes: nodes.length,
    onlineNodes,
    slowNodes,
    timeoutNodes,
    totalTrafficUsed,
    totalTrafficQuota,
    countryDistribution,
    protocolDistribution,
  };
}
