import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { getAllNodes, batchUpdatePingResults } from './nodeService.js';
import { PingResult } from '../../core/types/index.js';
import { convertToClashProxyObject } from '../../core/converters/toClash.js';
import YAML from 'yaml';
import crypto from 'crypto';

export interface AgentConfig {
  secret: string;
  lastHeartbeatAt?: string;
  lastHeartbeatIp?: string;
  lastReportNodeCount?: number;
  isOnline: boolean;
}

const SETTING_AGENT_SECRET = 'agent_probe_secret';
const SETTING_AGENT_HEARTBEAT = 'agent_probe_heartbeat';

export async function getOrInitAgentSecret(): Promise<string> {
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, SETTING_AGENT_SECRET));
  const existing = rows[0];
  if (existing && existing.value) {
    return existing.value;
  }

  const newSecret = `subprobe_${crypto.randomBytes(16).toString('hex')}`;
  const now = new Date().toISOString();
  await db.insert(schema.settings).values({
    key: SETTING_AGENT_SECRET,
    value: newSecret,
    updatedAt: now,
  });
  return newSecret;
}

export async function rotateAgentSecret(): Promise<string> {
  const newSecret = `subprobe_${crypto.randomBytes(16).toString('hex')}`;
  const now = new Date().toISOString();

  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, SETTING_AGENT_SECRET));
  const existing = rows[0];
  if (existing) {
    await db.update(schema.settings).set({ value: newSecret, updatedAt: now }).where(eq(schema.settings.key, SETTING_AGENT_SECRET));
  } else {
    await db.insert(schema.settings).values({ key: SETTING_AGENT_SECRET, value: newSecret, updatedAt: now });
  }

  return newSecret;
}

export async function validateAgentAuth(authHeader?: string | null): Promise<boolean> {
  if (!authHeader) return false;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  if (!token) return false;

  const validSecret = await getOrInitAgentSecret();
  return token === validSecret;
}

export async function getAgentConfig(): Promise<AgentConfig> {
  const secret = await getOrInitAgentSecret();
  const hbRows = await db.select().from(schema.settings).where(eq(schema.settings.key, SETTING_AGENT_HEARTBEAT));
  const hbSetting = hbRows[0];

  let lastHeartbeatAt: string | undefined;
  let lastHeartbeatIp: string | undefined;
  let lastReportNodeCount: number | undefined;
  let isOnline = false;

  if (hbSetting && hbSetting.value) {
    try {
      const parsed = JSON.parse(hbSetting.value);
      lastHeartbeatAt = parsed.lastHeartbeatAt;
      lastHeartbeatIp = parsed.lastHeartbeatIp;
      lastReportNodeCount = parsed.lastReportNodeCount;

      if (lastHeartbeatAt) {
        const lastTime = new Date(lastHeartbeatAt).getTime();
        // Considered online if reported within the last 30 minutes
        isOnline = Date.now() - lastTime < 30 * 60 * 1000;
      }
    } catch {}
  }

  return {
    secret,
    lastHeartbeatAt,
    lastHeartbeatIp,
    lastReportNodeCount,
    isOnline,
  };
}

export async function getAgentNodes() {
  // Only return active/non-disabled subscription nodes to the probe
  const nodes = await getAllNodes(undefined, false);

  // 为避免节点重名导致 Clash 覆盖，为每个节点生成唯一的名称前缀标识
  const mappedNodes = nodes.map((n) => ({
    ...n,
    name: `[${n.id}] ${(n.name || `${n.server}:${n.port}`).trim()}`,
  }));

  // 生成专供探针 URL-Test 的精简纯粹配置（不含任何 GeoIP/MMDB/fake-ip 依赖，秒级加载防卡顿）
  const proxyList = mappedNodes.map(convertToClashProxyObject);
  const probeClashConfig = YAML.stringify({
    'mixed-port': 0,
    'allow-lan': false,
    mode: 'direct',
    'log-level': 'silent',
    'external-controller': '127.0.0.1:9090',
    dns: {
      enable: true,
      ipv6: false,
      'enhanced-mode': 'redir-host',
      nameserver: [
        '223.5.5.5',
        '119.29.29.29',
        '1.1.1.1',
        '8.8.8.8',
      ],
    },
    proxies: proxyList,
    rules: [
      'MATCH,DIRECT',
    ],
  });

  return {
    clashConfig: probeClashConfig,
    nodes: mappedNodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      server: n.server,
      port: n.port,
      country: n.country,
      countryCode: n.countryCode,
    })),
  };
}

export async function processAgentReport(results: PingResult[], clientIp: string) {
  if (!Array.isArray(results) || results.length === 0) {
    return { updatedCount: 0 };
  }

  // 1. Batch update ping status for reported nodes
  await batchUpdatePingResults(results);

  // 2. Record heartbeat in settings table
  const now = new Date().toISOString();
  const heartbeatData = JSON.stringify({
    lastHeartbeatAt: now,
    lastHeartbeatIp: clientIp,
    lastReportNodeCount: results.length,
  });

  const hbRows = await db.select().from(schema.settings).where(eq(schema.settings.key, SETTING_AGENT_HEARTBEAT));
  const existing = hbRows[0];
  if (existing) {
    await db.update(schema.settings).set({ value: heartbeatData, updatedAt: now }).where(eq(schema.settings.key, SETTING_AGENT_HEARTBEAT));
  } else {
    await db.insert(schema.settings).values({ key: SETTING_AGENT_HEARTBEAT, value: heartbeatData, updatedAt: now });
  }

  return { updatedCount: results.length, lastHeartbeatAt: now };
}
