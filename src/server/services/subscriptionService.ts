import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { parseNodesFromContent, parseSubscriptionUserInfo } from '../../core/parsers/index.js';
import { ProxyNode } from '../../core/types/index.js';
import crypto from 'crypto';
import net from 'net';

const DEFAULT_UA = 'ClashMeta/v1.18.0 (SubHub Aggregator)';

function isPrivateOrReservedIP(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return true;
    const [a, b] = parts;
    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (Private network)
    if (a === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link-local / Cloud metadata)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Private network: 172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16 (Private network)
    if (a === 192 && b === 168) return true;
    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (a >= 224) return true;
    return false;
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // Loopback & Unspecified
    if (lower === '::1' || lower === '::' || lower === '0:0:0:0:0:0:0:1' || lower === '0:0:0:0:0:0:0:0') return true;
    // Link-local (fe80::/10)
    if (/^fe[89ab]/i.test(lower)) return true;
    // Unique local address (fc00::/7 -> fc00:: or fd00::)
    if (/^f[cd]/i.test(lower)) return true;
    // Multicast (ff00::/8)
    if (/^ff/i.test(lower)) return true;
    // IPv4-mapped IPv6 (::ffff:x.x.x.x)
    if (lower.startsWith('::ffff:')) {
      const v4Part = lower.slice(7);
      if (net.isIPv4(v4Part)) {
        return isPrivateOrReservedIP(v4Part);
      }
    }
    return false;
  }

  return false;
}

function validateSubscriptionUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('无效的订阅链接 URL 格式');
  }

  // Restrict to HTTP / HTTPS schemes
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`不支持的 URL 协议方案: ${parsed.protocol}`);
  }

  // Clean brackets from IPv6 hostnames
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // 1. IP address check
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIP(hostname)) {
      throw new Error('禁止访问私有/内网或保留 IP 地址 (SSRF 拦截)');
    }
  }

  // 2. Local/Internal domain name check
  const blockedSuffixes = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.arpa'];
  if (
    hostname === 'localhost' ||
    hostname === 'metadata.google.internal' ||
    hostname === 'instance-data' ||
    blockedSuffixes.some((s) => hostname.endsWith(s))
  ) {
    throw new Error('禁止访问内网或元数据域名 (SSRF 拦截)');
  }

  return parsed;
}

export async function fetchRemoteSubscription(
  url: string,
  options: {
    userAgent?: string;
    etag?: string | null;
    lastModified?: string | null;
  } = {}
) {
  const targetUrl = validateSubscriptionUrl(url);

  const headers: Record<string, string> = {
    'User-Agent': options.userAgent || DEFAULT_UA,
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
  };

  if (options.etag) {
    headers['If-None-Match'] = options.etag;
  }
  if (options.lastModified) {
    headers['If-Modified-Since'] = options.lastModified;
  }

  try {
    const res = await fetch(targetUrl.toString(), {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(20000), // 20s timeout
    });

    if (res.status === 304) {
      return {
        notModified: true,
        nodes: [] as ProxyNode[],
        userinfo: null,
        etag: options.etag,
        lastModified: options.lastModified,
        rawContent: '',
        httpStatus: 304,
      };
    }

    if (!res.ok) {
      throw new Error(`HTTP 响应错误状态: ${res.status} ${res.statusText}`);
    }

    const newEtag = res.headers.get('etag') || null;
    const newLastModified = res.headers.get('last-modified') || null;

    // Parse Subscription-Userinfo header if present
    const userInfoHeader = res.headers.get('subscription-userinfo');
    const userinfo = userInfoHeader ? parseSubscriptionUserInfo(userInfoHeader) : null;

    const content = await res.text();
    const nodes = parseNodesFromContent(content);

    return {
      notModified: false,
      nodes,
      userinfo,
      etag: newEtag,
      lastModified: newLastModified,
      rawContent: content,
      httpStatus: res.status,
    };
  } catch (err: any) {
    if (err.name === 'TimeoutError') {
      throw new Error('订阅链接拉取超时 (超过 20 秒)');
    }
    throw new Error(`订阅拉取失败: ${err.message}`);
  }
}

export async function recordSyncLog(data: {
  subscriptionId: string;
  subscriptionName: string;
  triggerType: 'manual' | 'cron';
  status: 'success' | 'failed';
  httpStatus?: number;
  durationMs: number;
  nodeCount: number;
  nodeDiff?: number;
  errorMessage?: string;
}) {
  const id = `slog_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date().toISOString();
  await db.insert(schema.syncLogs).values({
    id,
    subscriptionId: data.subscriptionId,
    subscriptionName: data.subscriptionName,
    triggerType: data.triggerType,
    status: data.status,
    httpStatus: data.httpStatus,
    durationMs: data.durationMs,
    nodeCount: data.nodeCount,
    nodeDiff: data.nodeDiff ?? 0,
    errorMessage: data.errorMessage,
    createdAt: now,
  });
}

export async function getSyncLogs(subscriptionId?: string, limit: number = 100) {
  if (subscriptionId) {
    const rows = await db
      .select()
      .from(schema.syncLogs)
      .where(eq(schema.syncLogs.subscriptionId, subscriptionId));
    return rows.reverse().slice(0, limit);
  }
  const rows = await db.select().from(schema.syncLogs);
  return rows.reverse().slice(0, limit);
}

export async function clearSyncLogs(subscriptionId?: string) {
  if (subscriptionId) {
    await db.delete(schema.syncLogs).where(eq(schema.syncLogs.subscriptionId, subscriptionId));
  } else {
    await db.delete(schema.syncLogs);
  }
  return { success: true };
}

export async function createSubscription(data: {
  name: string;
  url: string;
  customUserAgent?: string;
  autoUpdate?: boolean;
  updateInterval?: number;
}) {
  const id = `sub_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date().toISOString();

  let fetchedNodes: ProxyNode[] = [];
  let userinfo: any = null;
  let status: 'active' | 'error' = 'active';
  let errorMessage: string | undefined;
  let etag: string | undefined;
  let lastModified: string | undefined;
  let durationMs = 0;
  let httpStatus: number | undefined = undefined;

  const startTime = Date.now();
  try {
    const result = await fetchRemoteSubscription(data.url, { userAgent: data.customUserAgent });
    durationMs = Date.now() - startTime;
    fetchedNodes = result.nodes;
    userinfo = result.userinfo;
    etag = result.etag || undefined;
    lastModified = result.lastModified || undefined;
    httpStatus = result.httpStatus;
  } catch (err: any) {
    durationMs = Date.now() - startTime;
    status = 'error';
    errorMessage = err.message || 'Initial sync failed';
  }

  await db.insert(schema.subscriptions).values({
    id,
    name: data.name.trim(),
    url: data.url.trim(),
    customUserAgent: data.customUserAgent?.trim() || null,
    autoUpdate: data.autoUpdate !== false,
    updateInterval: data.updateInterval || 360,
    lastUpdatedAt: status === 'active' ? now : null,
    upload: userinfo?.upload ?? 0,
    download: userinfo?.download ?? 0,
    total: userinfo?.total ?? 0,
    expire: userinfo?.expire ?? 0,
    nodeCount: fetchedNodes.length,
    etag: etag || null,
    lastModified: lastModified || null,
    status,
    errorMessage: errorMessage || null,
    createdAt: now,
    updatedAt: now,
  });

  if (fetchedNodes.length > 0) {
    await saveSubscriptionNodes(id, fetchedNodes);
  }

  try {
    await recordSyncLog({
      subscriptionId: id,
      subscriptionName: data.name.trim(),
      triggerType: 'manual',
      status: status === 'active' ? 'success' : 'failed',
      httpStatus,
      durationMs,
      nodeCount: fetchedNodes.length,
      nodeDiff: fetchedNodes.length,
      errorMessage,
    });
  } catch (logErr) {
    console.error('Failed to write sync log:', logErr);
  }

  return getSubscriptionById(id);
}

export async function saveSubscriptionNodes(subscriptionId: string, nodes: ProxyNode[]) {
  // 1. Read existing health state to preserve ping and status across refreshes
  const existingRows = await db
    .select({
      id: schema.nodes.id,
      ping: schema.nodes.ping,
      status: schema.nodes.status,
      lastCheckedAt: schema.nodes.lastCheckedAt,
    })
    .from(schema.nodes)
    .where(eq(schema.nodes.subscriptionId, subscriptionId));

  const existingHealthMap = new Map<string, { ping: number | null; status: string; lastCheckedAt: string | null }>();
  for (const row of existingRows) {
    existingHealthMap.set(row.id, {
      ping: row.ping,
      status: (row.status as any) || 'unknown',
      lastCheckedAt: row.lastCheckedAt,
    });
  }

  // 2. Delete old nodes for this subscription
  await db.delete(schema.nodes).where(eq(schema.nodes.subscriptionId, subscriptionId));

  const insertedInThisBatch = new Set<string>();
  const toInsert: any[] = [];

  for (const node of nodes) {
    let rawBaseId = node.id || `node_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let scopedNodeId = `${rawBaseId}_${subscriptionId.slice(0, 8)}`;

    if (insertedInThisBatch.has(scopedNodeId)) {
      scopedNodeId = `${scopedNodeId}_${Math.random().toString(36).slice(2, 6)}`;
    }
    insertedInThisBatch.add(scopedNodeId);

    const prevHealth = existingHealthMap.get(scopedNodeId) || existingHealthMap.get(rawBaseId);

    const ping = node.ping !== undefined ? node.ping : (prevHealth?.ping ?? null);
    const status = (node.status && node.status !== 'unknown') ? node.status : (prevHealth?.status || 'unknown');
    const lastCheckedAt = node.lastCheckedAt || prevHealth?.lastCheckedAt || null;

    toInsert.push({
      id: scopedNodeId,
      subscriptionId,
      name: node.name || 'Unnamed Proxy',
      type: node.type,
      server: node.server,
      port: node.port,
      uuid: node.uuid || null,
      password: node.password || null,
      cipher: node.cipher || null,
      alterId: node.alterId ?? null,
      network: node.network || null,
      tls: node.tls ? true : false,
      sni: node.sni || null,
      alpn: node.alpn ? JSON.stringify(node.alpn) : null,
      skipCertVerify: node.skipCertVerify ? true : false,
      flow: node.flow || null,
      reality: node.reality ? JSON.stringify(node.reality) : null,
      wsOpts: node.wsOpts ? JSON.stringify(node.wsOpts) : null,
      grpcOpts: node.grpcOpts ? JSON.stringify(node.grpcOpts) : null,
      hy2Opts: node.hy2Opts ? JSON.stringify(node.hy2Opts) : null,
      udp: node.udp !== false,
      country: node.country || null,
      countryCode: node.countryCode || null,
      ping,
      lastCheckedAt,
      status,
      rawUri: node.rawUri || null,
      rawData: JSON.stringify(node),
    });
  }

  // Insert in chunks of 50
  const CHUNK_SIZE = 50;
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    if (chunk.length > 0) {
      await db.insert(schema.nodes).values(chunk);
    }
  }
}

export async function getSubscriptionById(id: string) {
  const rows = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, id));
  return rows[0] || null;
}

export async function getAllSubscriptions() {
  return await db.select().from(schema.subscriptions);
}

export async function refreshSubscription(id: string, triggerType: 'manual' | 'cron' = 'manual') {
  const sub = await getSubscriptionById(id);
  if (!sub) throw new Error('Subscription not found');

  const now = new Date().toISOString();
  const startTime = Date.now();
  let durationMs = 0;

  try {
    const result = await fetchRemoteSubscription(sub.url, {
      userAgent: sub.customUserAgent || undefined,
      etag: sub.etag || undefined,
      lastModified: sub.lastModified || undefined,
    });
    durationMs = Date.now() - startTime;

    if (result.notModified) {
      // 304: Nodes remain unchanged, update lastUpdatedAt & userinfo
      await db.update(schema.subscriptions).set({
        lastUpdatedAt: now,
        upload: result.userinfo?.upload ?? sub.upload,
        download: result.userinfo?.download ?? sub.download,
        total: result.userinfo?.total ?? sub.total,
        expire: result.userinfo?.expire ?? sub.expire,
        status: 'active',
        errorMessage: null,
        updatedAt: now,
      }).where(eq(schema.subscriptions.id, id));

      await recordSyncLog({
        subscriptionId: id,
        subscriptionName: sub.name,
        triggerType,
        status: 'success',
        httpStatus: 304,
        durationMs,
        nodeCount: sub.nodeCount,
        nodeDiff: 0,
      });

      return getSubscriptionById(id);
    }

    // 200 OK: New nodes fetched
    const previousCount = sub.nodeCount || 0;
    await saveSubscriptionNodes(id, result.nodes);

    await db.update(schema.subscriptions).set({
      lastUpdatedAt: now,
      upload: result.userinfo?.upload ?? sub.upload,
      download: result.userinfo?.download ?? sub.download,
      total: result.userinfo?.total ?? sub.total,
      expire: result.userinfo?.expire ?? sub.expire,
      nodeCount: result.nodes.length,
      etag: result.etag || undefined,
      lastModified: result.lastModified || undefined,
      status: 'active',
      errorMessage: null,
      updatedAt: now,
    }).where(eq(schema.subscriptions.id, id));

    await recordSyncLog({
      subscriptionId: id,
      subscriptionName: sub.name,
      triggerType,
      status: 'success',
      httpStatus: result.httpStatus || 200,
      durationMs,
      nodeCount: result.nodes.length,
      nodeDiff: result.nodes.length - previousCount,
    });

    return getSubscriptionById(id);
  } catch (err: any) {
    durationMs = Date.now() - startTime;
    // Graceful fallback on failure: KEEP existing cached nodes in DB!
    await db.update(schema.subscriptions).set({
      status: 'error',
      errorMessage: err.message || 'Refresh failed',
      updatedAt: now,
    }).where(eq(schema.subscriptions.id, id));

    await recordSyncLog({
      subscriptionId: id,
      subscriptionName: sub.name,
      triggerType,
      status: 'failed',
      durationMs,
      nodeCount: sub.nodeCount,
      nodeDiff: 0,
      errorMessage: err.message || 'Refresh failed',
    });

    throw err;
  }
}

export async function deleteSubscription(id: string) {
  await db.delete(schema.nodes).where(eq(schema.nodes.subscriptionId, id));
  await db.delete(schema.syncLogs).where(eq(schema.syncLogs.subscriptionId, id));
  await db.delete(schema.subscriptions).where(eq(schema.subscriptions.id, id));

  // Clean up any dangling references to this subscription in aggregates
  try {
    const allAggs = await db.select().from(schema.aggregates);
    for (const agg of allAggs) {
      if (!agg.subscriptionIds) continue;
      try {
        const ids: string[] = JSON.parse(agg.subscriptionIds);
        if (Array.isArray(ids) && ids.includes(id)) {
          const cleanedIds = ids.filter((subId: string) => subId !== id);
          await db.update(schema.aggregates)
            .set({ subscriptionIds: JSON.stringify(cleanedIds), updatedAt: new Date().toISOString() })
            .where(eq(schema.aggregates.id, agg.id));
        }
      } catch {}
    }
  } catch {}

  return { success: true };
}

export async function updateSubscriptionSettings(id: string, data: {
  name?: string;
  url?: string;
  customUserAgent?: string;
  autoUpdate?: boolean;
  updateInterval?: number;
  status?: 'active' | 'error' | 'disabled';
}) {
  const existing = await getSubscriptionById(id);
  if (!existing) throw new Error('Subscription not found');

  const now = new Date().toISOString();
  const updatePayload: Record<string, any> = {
    updatedAt: now,
  };

  if (typeof data.name === 'string') {
    const trimmedName = data.name.trim();
    if (trimmedName) updatePayload.name = trimmedName;
  }

  let isUrlChanged = false;
  if (typeof data.url === 'string') {
    const trimmedUrl = data.url.trim();
    if (trimmedUrl && trimmedUrl !== existing.url.trim()) {
      validateSubscriptionUrl(trimmedUrl);
      updatePayload.url = trimmedUrl;
      updatePayload.etag = null;
      updatePayload.lastModified = null;
      isUrlChanged = true;
    }
  }

  if (data.customUserAgent !== undefined) {
    updatePayload.customUserAgent = typeof data.customUserAgent === 'string' ? (data.customUserAgent.trim() || null) : null;
  }

  if (typeof data.autoUpdate === 'boolean') {
    updatePayload.autoUpdate = data.autoUpdate;
  }

  if (data.updateInterval !== undefined) {
    const num = Number(data.updateInterval);
    if (!isNaN(num) && num > 0) {
      updatePayload.updateInterval = Math.max(10, num);
    }
  }

  if (data.status !== undefined) {
    if (['active', 'error', 'disabled'].includes(data.status)) {
      updatePayload.status = data.status;
      if (data.status === 'disabled') {
        updatePayload.errorMessage = null;
      }
    }
  }

  await db.update(schema.subscriptions).set(updatePayload).where(eq(schema.subscriptions.id, id));

  // If URL changed and subscription is not disabled, automatically trigger refresh to parse new nodes
  if (isUrlChanged && (data.status || existing.status) !== 'disabled') {
    return await refreshSubscription(id, 'manual');
  }

  return getSubscriptionById(id);
}
