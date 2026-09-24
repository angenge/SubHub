import { ProxyNode, AggregateGroup, RenameRule } from '../types/index.js';
import { detectCountry } from '../utils/country.js';

export function applyRenaming(name: string, rules: RenameRule[], fallback = 'Proxy'): string {
  let result = name;
  for (const rule of rules) {
    if (!rule.pattern) continue;
    try {
      const regex = new RegExp(rule.pattern, 'g');
      result = result.replace(regex, rule.replace || '');
    } catch (e) {
      // Ignore invalid regex
    }
  }
  const trimmed = result.trim();
  return trimmed || name || fallback;
}

export function deduplicateNodes(nodes: ProxyNode[]): ProxyNode[] {
  const seen = new Set<string>();
  const uniqueNodes: ProxyNode[] = [];

  for (const node of nodes) {
    const cred = node.uuid || node.password || node.cipher || '';
    const net = node.network || 'tcp';
    const tls = node.tls ? 'tls' : 'notls';
    const sni = node.sni || '';
    const flow = node.flow || '';
    const pathOrService = node.wsOpts?.path || node.grpcOpts?.serviceName || node.reality?.publicKey || '';
    const key = `${node.type}:${node.server.toLowerCase()}:${node.port}:${cred}:${net}:${tls}:${sni}:${flow}:${pathOrService}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueNodes.push(node);
    }
  }

  return uniqueNodes;
}

export function ensureUniqueNodeNames(nodes: ProxyNode[]): ProxyNode[] {
  const nameCounts = new Map<string, number>();
  
  return nodes.map((node) => {
    let finalName = (node.name || '').trim();
    if (!finalName) {
      finalName = `${node.server || 'proxy'}:${node.port || 80}`;
    }
    const count = nameCounts.get(finalName) || 0;
    
    if (count > 0) {
      nameCounts.set(finalName, count + 1);
      finalName = `${finalName} ${count + 1}`;
    } else {
      nameCounts.set(finalName, 1);
    }

    return {
      ...node,
      name: finalName,
    };
  });
}

const DUMMY_SERVERS = new Set([
  '1.1.1.1',
  '1.0.0.1',
  '8.8.8.8',
  '8.8.4.4',
  '127.0.0.1',
  '0.0.0.0',
  'localhost',
]);

export function processAggregateNodes(
  allNodes: ProxyNode[],
  group: AggregateGroup
): ProxyNode[] {
  let result = [...allNodes];

  // 0. Filter out informational/dummy announcement nodes
  result = result.filter((n) => {
    if (n.country === '提示' || n.countryCode === 'INFO') return false;
    if (n.server && DUMMY_SERVERS.has(n.server.trim().toLowerCase())) return false;
    return true;
  });

  // 1. Filter by Subscription ID
  if (group.subscriptionIds && group.subscriptionIds.length > 0) {
    const subSet = new Set(group.subscriptionIds);
    result = result.filter((n) => n.subscriptionId && subSet.has(n.subscriptionId));
  }

  // 2. Filter by Protocol
  if (group.protocols && group.protocols.length > 0) {
    const protoSet = new Set(group.protocols.map((p) => p.toLowerCase()));
    result = result.filter((n) => protoSet.has(n.type.toLowerCase()));
  }

  // 3. Filter by Exclude Keywords (Default excludes advertising keywords if matched)
  if (group.excludeKeywords && group.excludeKeywords.length > 0) {
    result = result.filter((n) => {
      return !group.excludeKeywords.some((kw) => {
        const cleanKw = kw.trim();
        if (!cleanKw) return false;
        try {
          const re = new RegExp(cleanKw, 'i');
          const matchName = n.name ? re.test(n.name) : false;
          const matchServer = n.server ? re.test(n.server) : false;
          return matchName || matchServer;
        } catch {
          const lower = cleanKw.toLowerCase();
          return (n.name && n.name.toLowerCase().includes(lower)) || (n.server && n.server.toLowerCase().includes(lower));
        }
      });
    });
  }

  // 4. Filter by Include Keywords
  if (group.filterKeywords && group.filterKeywords.length > 0) {
    result = result.filter((n) => {
      return group.filterKeywords.some((kw) => {
        const cleanKw = kw.trim();
        if (!cleanKw) return false;
        try {
          const re = new RegExp(cleanKw, 'i');
          const matchName = n.name ? re.test(n.name) : false;
          const matchCountry = n.country ? re.test(n.country) : false;
          const matchCode = n.countryCode ? re.test(n.countryCode) : false;
          return matchName || matchCountry || matchCode;
        } catch {
          const lower = cleanKw.toLowerCase();
          return (
            (n.name && n.name.toLowerCase().includes(lower)) ||
            (n.country && n.country.toLowerCase().includes(lower)) ||
            (n.countryCode && n.countryCode.toLowerCase().includes(lower))
          );
        }
      });
    });
  }

  // 5. Filter by Online / Latency
  if (group.filterOnlineOnly) {
    result = result.filter((n) => n.status === 'fast' || n.status === 'online' || n.status === 'slow' || (n.ping !== undefined && n.ping > 0));
  }

  if (group.maxPing && group.maxPing > 0) {
    result = result.filter((n) => n.ping !== undefined && n.ping > 0 && n.ping <= group.maxPing!);
  }

  // 6. Apply Renaming Rules
  if (group.renameRules && group.renameRules.length > 0) {
    result = result.map((n) => {
      const newName = applyRenaming(n.name, group.renameRules);
      const newCountry = detectCountry(newName);
      return {
        ...n,
        name: newName,
        country: newCountry.name,
        countryCode: newCountry.code,
      };
    });
  }

  // 7. Deduplicate
  if (group.deduplicate) {
    result = deduplicateNodes(result);
  }

  // 8. Ensure Unique Node Names
  result = ensureUniqueNodeNames(result);

  return result;
}
