import { eq, desc, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { AggregateGroup, AccessLog } from '../../core/types/index.js';
import { getAllNodes } from './nodeService.js';
import { getAllSubscriptions } from './subscriptionService.js';
import { processAggregateNodes } from '../../core/engine/index.js';
import {
  generateClashConfig,
  generateSingboxConfig,
  generateSurgeConfig,
  generateLoonConfig,
  generateBase64Subscription,
} from '../../core/converters/index.js';
import crypto from 'crypto';

export function parseDbAggregate(raw: any): AggregateGroup {
  return {
    id: raw.id,
    name: raw.name,
    token: raw.token,
    subscriptionIds: JSON.parse(raw.subscriptionIds || '[]'),
    filterKeywords: JSON.parse(raw.filterKeywords || '[]'),
    excludeKeywords: JSON.parse(raw.excludeKeywords || '[]'),
    protocols: JSON.parse(raw.protocols || '[]'),
    renameRules: JSON.parse(raw.renameRules || '[]'),
    deduplicate: !!raw.deduplicate,
    filterOnlineOnly: !!raw.filterOnlineOnly,
    maxPing: raw.maxPing ?? undefined,
    targetFormat: raw.targetFormat || 'clash',
    clashTemplate: raw.clashTemplate || 'default',
    singboxTemplate: raw.singboxTemplate || 'default',
    customRuleConfig: raw.customRuleConfig || undefined,
    enabled: !!raw.enabled,
    accessCount: raw.accessCount || 0,
    lastAccessedAt: raw.lastAccessedAt || undefined,
    lastAccessedIp: raw.lastAccessedIp || undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function getAllAggregates(): Promise<AggregateGroup[]> {
  const rows = await db.select().from(schema.aggregates);
  return rows.map(parseDbAggregate);
}

export async function getAggregateById(id: string): Promise<AggregateGroup | null> {
  const rows = await db.select().from(schema.aggregates).where(eq(schema.aggregates.id, id));
  const row = rows[0];
  return row ? parseDbAggregate(row) : null;
}

export async function getAggregateByToken(token: string): Promise<AggregateGroup | null> {
  const rows = await db.select().from(schema.aggregates).where(eq(schema.aggregates.token, token));
  const row = rows[0];
  return row ? parseDbAggregate(row) : null;
}

export async function createAggregate(data: Partial<AggregateGroup> & { name: string }): Promise<AggregateGroup | null> {
  const trimmedName = data.name.trim();
  if (!trimmedName) {
    throw new Error('聚合名称不能为空');
  }

  const allAggs = await getAllAggregates();
  const duplicateNameAgg = allAggs.find(
    (a) => a.name.trim().toLowerCase() === trimmedName.toLowerCase()
  );
  if (duplicateNameAgg) {
    throw new Error(`聚合名称“${trimmedName}”已存在，请使用其他名称！`);
  }

  const id = `agg_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const token = crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();

  await db.insert(schema.aggregates).values({
    id,
    name: trimmedName,
    token, // Always generate a secure, random cryptographic token on creation
    subscriptionIds: JSON.stringify(data.subscriptionIds || []),
    filterKeywords: JSON.stringify(data.filterKeywords || []),
    excludeKeywords: JSON.stringify(data.excludeKeywords || []),
    protocols: JSON.stringify(data.protocols || []),
    renameRules: JSON.stringify(data.renameRules || []),
    deduplicate: data.deduplicate !== false,
    filterOnlineOnly: !!data.filterOnlineOnly,
    maxPing: data.maxPing ?? null,
    targetFormat: data.targetFormat || 'clash',
    clashTemplate: data.clashTemplate || 'default',
    singboxTemplate: data.singboxTemplate || 'default',
    customRuleConfig: data.customRuleConfig || null,
    enabled: data.enabled !== false,
    accessCount: 0,
    lastAccessedAt: null,
    lastAccessedIp: null,
    createdAt: now,
    updatedAt: now,
  });

  return getAggregateById(id);
}

export async function updateAggregate(id: string, data: Partial<AggregateGroup>): Promise<AggregateGroup | null> {
  const now = new Date().toISOString();
  const updateData: any = { updatedAt: now };

  if (data.name !== undefined) {
    const trimmedName = data.name.trim();
    if (trimmedName) {
      const allAggs = await getAllAggregates();
      const duplicateNameAgg = allAggs.find(
        (a) => a.id !== id && a.name.trim().toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicateNameAgg) {
        throw new Error(`聚合名称“${trimmedName}”已存在，请使用其他名称！`);
      }
      updateData.name = trimmedName;
    }
  }
  if (data.token !== undefined) updateData.token = data.token;
  if (data.subscriptionIds !== undefined) updateData.subscriptionIds = JSON.stringify(data.subscriptionIds);
  if (data.filterKeywords !== undefined) updateData.filterKeywords = JSON.stringify(data.filterKeywords);
  if (data.excludeKeywords !== undefined) updateData.excludeKeywords = JSON.stringify(data.excludeKeywords);
  if (data.protocols !== undefined) updateData.protocols = JSON.stringify(data.protocols);
  if (data.renameRules !== undefined) updateData.renameRules = JSON.stringify(data.renameRules);
  if (data.deduplicate !== undefined) updateData.deduplicate = data.deduplicate;
  if (data.filterOnlineOnly !== undefined) updateData.filterOnlineOnly = data.filterOnlineOnly;
  if (data.maxPing !== undefined) updateData.maxPing = data.maxPing;
  if (data.targetFormat !== undefined) updateData.targetFormat = data.targetFormat;
  if (data.clashTemplate !== undefined) updateData.clashTemplate = data.clashTemplate;
  if (data.singboxTemplate !== undefined) updateData.singboxTemplate = data.singboxTemplate;
  if (data.customRuleConfig !== undefined) updateData.customRuleConfig = data.customRuleConfig;
  if (data.enabled !== undefined) updateData.enabled = data.enabled;

  await db.update(schema.aggregates).set(updateData).where(eq(schema.aggregates.id, id));

  return getAggregateById(id);
}

export async function deleteAggregate(id: string) {
  await db.delete(schema.accessLogs).where(eq(schema.accessLogs.aggregateId, id));
  await db.delete(schema.aggregates).where(eq(schema.aggregates.id, id));
  return { success: true };
}

export async function rotateAggregateToken(id: string) {
  const newToken = crypto.randomBytes(16).toString('hex');
  return updateAggregate(id, { token: newToken });
}

export async function recordAggregateAccess(data: {
  aggregateId: string;
  aggregateToken: string;
  ip: string;
  userAgent?: string;
  targetFormat?: string;
  nodeCount: number;
}) {
  const id = `log_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date().toISOString();

  // 1. Insert access log
  await db.insert(schema.accessLogs).values({
    id,
    aggregateId: data.aggregateId,
    aggregateToken: data.aggregateToken,
    ip: data.ip,
    userAgent: data.userAgent || null,
    targetFormat: data.targetFormat || null,
    nodeCount: data.nodeCount,
    accessedAt: now,
  });

  // 2. Atomic increment in aggregates table to guarantee consistency during concurrent bursts
  await db.update(schema.aggregates).set({
    accessCount: sql`COALESCE(${schema.aggregates.accessCount}, 0) + 1`,
    lastAccessedAt: now,
    lastAccessedIp: data.ip,
  }).where(eq(schema.aggregates.id, data.aggregateId));
}

export async function getAggregateLogs(aggregateId: string, limit = 100): Promise<AccessLog[]> {
  const rows = await db.select()
    .from(schema.accessLogs)
    .where(eq(schema.accessLogs.aggregateId, aggregateId))
    .orderBy(desc(schema.accessLogs.accessedAt))
    .limit(limit);

  return rows.map((r: any) => ({
    id: r.id,
    aggregateId: r.aggregateId,
    aggregateToken: r.aggregateToken,
    ip: r.ip,
    userAgent: r.userAgent || undefined,
    targetFormat: r.targetFormat || undefined,
    nodeCount: r.nodeCount,
    accessedAt: r.accessedAt,
  }));
}

export async function clearAggregateLogs(aggregateId: string) {
  await db.delete(schema.accessLogs).where(eq(schema.accessLogs.aggregateId, aggregateId));
  return { success: true };
}

export async function generateAggregateSubscription(
  token: string,
  targetFormatOverride?: string
): Promise<{ content: string; contentType: string; filename: string; nodeCount: number; group: AggregateGroup }> {
  const group = await getAggregateByToken(token);
  if (!group || !group.enabled) {
    throw new Error('Aggregate not found or disabled');
  }

  // Get active (non-disabled) subscription IDs
  const allSubs = await getAllSubscriptions();
  const activeSubs = allSubs.filter((s: any) => s.status !== 'disabled');
  const activeSubIdSet = new Set(activeSubs.map((s: any) => s.id));

  // Only consider nodes belonging to active subscriptions
  const allNodes = await getAllNodes(undefined, false);
  const filteredNodes = processAggregateNodes(allNodes, group);

  const format = (targetFormatOverride || group.targetFormat || 'clash').toLowerCase();

  if (format === 'singbox' || format === 'sing-box') {
    return {
      content: generateSingboxConfig(filteredNodes, {
        mode: (group.singboxTemplate as any) || 'gateway',
      }),
      contentType: 'application/json; charset=utf-8',
      filename: `${group.name}_singbox.json`,
      nodeCount: filteredNodes.length,
      group,
    };
  }

  if (format === 'surge') {
    return {
      content: generateSurgeConfig(filteredNodes),
      contentType: 'text/plain; charset=utf-8',
      filename: `${group.name}_surge.conf`,
      nodeCount: filteredNodes.length,
      group,
    };
  }

  if (format === 'loon') {
    return {
      content: generateLoonConfig(filteredNodes),
      contentType: 'text/plain; charset=utf-8',
      filename: `${group.name}_loon.conf`,
      nodeCount: filteredNodes.length,
      group,
    };
  }

  if (format === 'base64' || format === 'v2ray') {
    return {
      content: generateBase64Subscription(filteredNodes),
      contentType: 'text/plain; charset=utf-8',
      filename: `${group.name}_v2ray.txt`,
      nodeCount: filteredNodes.length,
      group,
    };
  }

  // Default: Clash / Mihomo
  return {
    content: generateClashConfig(filteredNodes),
    contentType: 'text/yaml; charset=utf-8',
    filename: `${group.name}_clash.yaml`,
    nodeCount: filteredNodes.length,
    group,
  };
}
