import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { ProxyNode, PingResult } from '../../core/types/index.js';
import { batchPingNodes, pingNode } from '../../core/ping/index.js';

export function parseDbNode(raw: any): ProxyNode {
  let extra: any = {};
  if (raw.rawData) {
    try {
      extra = JSON.parse(raw.rawData);
    } catch {}
  }

  return {
    id: raw.id,
    subscriptionId: raw.subscriptionId,
    name: raw.name,
    type: raw.type as any,
    server: raw.server,
    port: raw.port,
    uuid: raw.uuid || undefined,
    password: raw.password || undefined,
    cipher: raw.cipher || undefined,
    alterId: raw.alterId || undefined,
    network: raw.network || undefined,
    tls: !!raw.tls,
    sni: raw.sni || undefined,
    alpn: raw.alpn ? JSON.parse(raw.alpn) : undefined,
    skipCertVerify: !!raw.skipCertVerify,
    flow: raw.flow || undefined,
    reality: raw.reality ? JSON.parse(raw.reality) : undefined,
    wsOpts: raw.wsOpts ? JSON.parse(raw.wsOpts) : undefined,
    grpcOpts: raw.grpcOpts ? JSON.parse(raw.grpcOpts) : undefined,
    hy2Opts: raw.hy2Opts ? JSON.parse(raw.hy2Opts) : undefined,
    plugin: extra.plugin || undefined,
    pluginOpts: extra.pluginOpts || undefined,
    udp: !!raw.udp,
    country: raw.country || undefined,
    countryCode: raw.countryCode || undefined,
    ping: raw.ping ?? undefined,
    lastCheckedAt: raw.lastCheckedAt || undefined,
    status: raw.status || 'unknown',
    rawUri: raw.rawUri || undefined,
  };
}

export async function getAllNodes(subscriptionId?: string): Promise<ProxyNode[]> {
  let query = db.select().from(schema.nodes);
  if (subscriptionId) {
    const rows = await query.where(eq(schema.nodes.subscriptionId, subscriptionId));
    return rows.map(parseDbNode);
  }
  const rows = await query;
  return rows.map(parseDbNode);
}

export interface NodeFilterParams {
  subscriptionId?: string;
  search?: string;
  protocol?: string;
  country?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function getPaginatedNodes(params: NodeFilterParams): Promise<{
  items: ProxyNode[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.max(1, Math.min(Number(params.pageSize) || 50, 500));

  let nodes = await getAllNodes(params.subscriptionId);

  if (params.protocol && params.protocol !== 'all') {
    const proto = params.protocol.toLowerCase();
    nodes = nodes.filter((n) => n.type.toLowerCase() === proto);
  }

  if (params.country && params.country !== 'all') {
    nodes = nodes.filter((n) => n.country === params.country);
  }

  if (params.status && params.status !== 'all') {
    nodes = nodes.filter((n) => n.status === params.status);
  }

  if (params.search && params.search.trim()) {
    const q = params.search.trim().toLowerCase();
    nodes = nodes.filter(
      (n) =>
        (n.name && n.name.toLowerCase().includes(q)) ||
        (n.server && n.server.toLowerCase().includes(q))
    );
  }

  const total = nodes.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const items = nodes.slice(start, start + pageSize);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function getNodeById(id: string): Promise<ProxyNode | null> {
  const rows = await db.select().from(schema.nodes).where(eq(schema.nodes.id, id));
  const row = rows[0];
  return row ? parseDbNode(row) : null;
}

export async function updateNodePingResult(res: PingResult) {
  await db.update(schema.nodes).set({
    ping: res.ping,
    status: res.status,
    lastCheckedAt: res.checkedAt,
  }).where(eq(schema.nodes.id, res.nodeId));
}

export async function batchUpdatePingResults(results: PingResult[]) {
  if (results.length === 0) return;
  for (const item of results) {
    await updateNodePingResult(item);
  }
}

export async function pingSingleNode(id: string): Promise<PingResult> {
  const node = await getNodeById(id);
  if (!node) throw new Error('Node not found');
  const res = await pingNode(node);
  await updateNodePingResult(res);
  return res;
}

export async function pingAllNodes(
  subscriptionId?: string,
  onProgress?: (progress: { current: number; total: number; result: PingResult }) => void
): Promise<PingResult[]> {
  const nodes = await getAllNodes(subscriptionId);
  const pendingUpdates: PingResult[] = [];
  let lastFlush = Date.now();

  const flushUpdates = async () => {
    if (pendingUpdates.length > 0) {
      const chunk = pendingUpdates.splice(0, pendingUpdates.length);
      await batchUpdatePingResults(chunk);
    }
  };

  const results = await batchPingNodes(nodes, 25, 2500, async (prog) => {
    pendingUpdates.push(prog.result);
    if (Date.now() - lastFlush > 300 || pendingUpdates.length >= 20) {
      lastFlush = Date.now();
      await flushUpdates();
    }
    if (onProgress) onProgress(prog);
  });

  await flushUpdates();
  return results;
}

export async function deleteNode(id: string) {
  const node = await getNodeById(id);
  if (node) {
    await db.delete(schema.nodes).where(eq(schema.nodes.id, id));
    if (node.subscriptionId) {
      const remaining = await db
        .select()
        .from(schema.nodes)
        .where(eq(schema.nodes.subscriptionId, node.subscriptionId));
      await db.update(schema.subscriptions)
        .set({ nodeCount: remaining.length, updatedAt: new Date().toISOString() })
        .where(eq(schema.subscriptions.id, node.subscriptionId));
    }
  }
  return { success: true };
}
