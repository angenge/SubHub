import { ProxyNode, SubscriptionInfo } from '../types/index.js';
import { parseUri, safeBase64Decode } from './uri.js';
import { parseClashConfigDetailed } from './clash.js';
import { parseSingboxConfigDetailed } from './singbox.js';

export interface ParsedContentReport {
  nodes: ProxyNode[];
  skippedUnsupported: number;
  skippedDetail: string | null;
}

interface SkipCounters {
  schemes: Record<string, number>;
  protocols: Record<string, number>;
  malformed: Record<string, number>;
}

const SUPPORTED_URI_SCHEMES = new Set(['vless', 'vmess', 'trojan', 'ss', 'hysteria2', 'hy2', 'anytls']);

function mergeCounter(target: Record<string, number>, source: Record<string, number>) {
  for (const [k, v] of Object.entries(source)) {
    target[k] = (target[k] || 0) + v;
  }
}

function buildReport(nodes: ProxyNode[], counters: SkipCounters): ParsedContentReport {
  const skippedUnsupported =
    Object.values(counters.schemes).reduce((a, b) => a + b, 0) +
    Object.values(counters.protocols).reduce((a, b) => a + b, 0);

  const detail: Record<string, Record<string, number>> = {};
  if (Object.keys(counters.schemes).length > 0) detail.schemes = counters.schemes;
  if (Object.keys(counters.protocols).length > 0) detail.protocols = counters.protocols;
  if (Object.keys(counters.malformed).length > 0) detail.malformed = counters.malformed;

  return {
    nodes,
    skippedUnsupported,
    skippedDetail: Object.keys(detail).length > 0 ? JSON.stringify(detail) : null,
  };
}

export function parseSubscriptionUserInfo(headerValue?: string | null): SubscriptionInfo | null {
  if (!headerValue) return null;
  const result: SubscriptionInfo = {};
  const pairs = headerValue.split(';');

  for (const pair of pairs) {
    const [rawKey, rawVal] = pair.trim().split('=');
    if (!rawKey || !rawVal) continue;
    const key = rawKey.toLowerCase();
    const val = parseInt(rawVal, 10);
    if (isNaN(val)) continue;

    if (key === 'upload') result.upload = val;
    else if (key === 'download') result.download = val;
    else if (key === 'total') result.total = val;
    else if (key === 'expire') result.expire = val;
  }

  return Object.keys(result).length > 0 ? result : null;
}

export function parseNodesFromContent(rawContent: string): ProxyNode[] {
  return parseNodesFromContentDetailed(rawContent).nodes;
}

export function parseNodesFromContentDetailed(rawContent: string): ParsedContentReport {
  const empty: ParsedContentReport = { nodes: [], skippedUnsupported: 0, skippedDetail: null };
  if (!rawContent || typeof rawContent !== 'string') return empty;
  const content = rawContent.replace(/^\uFEFF/, '').trim();

  const counters: SkipCounters = { schemes: {}, protocols: {}, malformed: {} };

  // 1. Try Clash YAML (look for proxies: keyword)
  if (content.includes('proxies:') && (content.includes('server:') || content.includes('port:'))) {
    const clash = parseClashConfigDetailed(content);
    if (clash.nodes.length > 0 || Object.keys(clash.skippedTypes).length > 0) {
      mergeCounter(counters.protocols, clash.skippedTypes);
      return buildReport(clash.nodes, counters);
    }
  }

  // 2. Try Sing-box JSON (look for outbounds keyword)
  if (content.startsWith('{') && content.includes('"outbounds"')) {
    const sg = parseSingboxConfigDetailed(content);
    if (sg.nodes.length > 0 || Object.keys(sg.skippedTypes).length > 0) {
      mergeCounter(counters.protocols, sg.skippedTypes);
      return buildReport(sg.nodes, counters);
    }
  }

  // 3. Try Base64 Decode
  let decodedText = content;
  // If content has no spaces and no newline or single base64 block, or starts with standard base64
  if (!content.includes('://') || (!content.includes('\n') && content.length > 50)) {
    const decoded = safeBase64Decode(content);
    if (decoded && (decoded.includes('://') || decoded.includes('proxies:'))) {
      decodedText = decoded;
      // If decoded is clash yaml
      if (decodedText.includes('proxies:')) {
        const clash = parseClashConfigDetailed(decodedText);
        if (clash.nodes.length > 0 || Object.keys(clash.skippedTypes).length > 0) {
          mergeCounter(counters.protocols, clash.skippedTypes);
          return buildReport(clash.nodes, counters);
        }
      }
    }
  }

  // 4. Parse Line by Line URIs (vless://, vmess://, trojan://, ss://, hysteria2://)
  const lines = decodedText.split(/\r?\n/);
  const nodes: ProxyNode[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const node = parseUri(trimmed);
    if (node) {
      nodes.push(node);
      continue;
    }

    // Unrecognized entry: classify it for the skip report
    const schemeMatch = trimmed.match(/^([A-Za-z0-9][A-Za-z0-9+.-]*):\/\//);
    const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : '';
    if (scheme && SUPPORTED_URI_SCHEMES.has(scheme)) {
      counters.malformed[scheme] = (counters.malformed[scheme] || 0) + 1;
    } else if (scheme) {
      counters.schemes[scheme] = (counters.schemes[scheme] || 0) + 1;
    } else {
      counters.schemes['unknown-line'] = (counters.schemes['unknown-line'] || 0) + 1;
    }
  }

  return buildReport(nodes, counters);
}

export * from './uri.js';
export * from './clash.js';
export * from './singbox.js';