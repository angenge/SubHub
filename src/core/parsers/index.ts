import { ProxyNode, SubscriptionInfo } from '../types/index.js';
import { parseUri, safeBase64Decode } from './uri.js';
import { parseClashConfig } from './clash.js';
import { parseSingboxConfig } from './singbox.js';

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
  if (!rawContent || typeof rawContent !== 'string') return [];
  const content = rawContent.replace(/^\uFEFF/, '').trim();

  // 1. Try Clash YAML (look for proxies: keyword)
  if (content.includes('proxies:') && (content.includes('server:') || content.includes('port:'))) {
    const clashNodes = parseClashConfig(content);
    if (clashNodes.length > 0) return clashNodes;
  }

  // 2. Try Sing-box JSON (look for outbounds keyword)
  if (content.startsWith('{') && content.includes('"outbounds"')) {
    const singboxNodes = parseSingboxConfig(content);
    if (singboxNodes.length > 0) return singboxNodes;
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
        const clashNodes = parseClashConfig(decodedText);
        if (clashNodes.length > 0) return clashNodes;
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
    }
  }

  return nodes;
}

export * from './uri.js';
export * from './clash.js';
export * from './singbox.js';
