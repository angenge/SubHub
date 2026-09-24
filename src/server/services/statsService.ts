import { DashboardStats } from '../../core/types/index.js';
import { getAllNodes } from './nodeService.js';
import { getAllSubscriptions } from './subscriptionService.js';

export async function getDashboardStats(): Promise<DashboardStats> {
  const allSubscriptions = await getAllSubscriptions();
  // Active (non-disabled) subscriptions
  const activeSubscriptions = allSubscriptions.filter((s: any) => s.status !== 'disabled');
  // Nodes of active subscriptions
  const nodes = await getAllNodes(undefined, false);

  let fastNodes = 0;
  let slowNodes = 0;
  let timeoutNodes = 0;
  let unknownNodes = 0;

  const countryMap = new Map<string, { country: string; code: string; count: number }>();
  const protocolMap = new Map<string, number>();

  let totalTrafficUsed = 0;
  let totalTrafficQuota = 0;

  for (const sub of activeSubscriptions) {
    if (sub.upload || sub.download) {
      totalTrafficUsed += (sub.upload || 0) + (sub.download || 0);
    }
    if (sub.total) {
      totalTrafficQuota += sub.total;
    }
  }

  for (const node of nodes) {
    // Status counts
    if (node.status === 'fast' || node.status === 'online') fastNodes++;
    else if (node.status === 'slow') slowNodes++;
    else if (node.status === 'timeout') timeoutNodes++;
    else unknownNodes++;

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
    totalSubscriptions: activeSubscriptions.length,
    totalNodes: nodes.length,
    fastNodes,
    slowNodes,
    timeoutNodes,
    unknownNodes,
    aliveNodes: fastNodes + slowNodes,
    onlineNodes: fastNodes,
    totalTrafficUsed,
    totalTrafficQuota,
    countryDistribution,
    protocolDistribution,
  };
}
