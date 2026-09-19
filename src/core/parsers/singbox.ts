import { ProxyNode } from '../types/index.js';
import { detectCountry } from '../utils/country.js';
import { generateNodeId } from './uri.js';

export interface SingboxParseResult {
  nodes: ProxyNode[];
  skippedTypes: Record<string, number>;
}

export function parseSingboxConfig(content: string): ProxyNode[] {
  return parseSingboxConfigDetailed(content).nodes;
}

export function parseSingboxConfigDetailed(content: string): SingboxParseResult {
  const skippedTypes: Record<string, number> = {};
  try {
    const doc = JSON.parse(content);
    if (!doc || !Array.isArray(doc.outbounds)) {
      return { nodes: [], skippedTypes };
    }

    const nodes: ProxyNode[] = [];

    for (const ob of doc.outbounds) {
      if (!ob || !ob.type || !ob.server || !ob.server_port) continue;
      const type = (ob.type as string).toLowerCase();
      // Ignore direct/block/dns/urltest/selector built-ins
      if (['direct', 'block', 'dns', 'urltest', 'selector'].includes(type)) continue;

      const name = ob.tag || `${ob.server}:${ob.server_port}`;
      const country = detectCountry(name);

      const baseNode: ProxyNode = {
        id: generateNodeId(ob.server, ob.server_port, type, name),
        name,
        type: type as any,
        server: ob.server,
        port: parseInt(ob.server_port, 10),
        country: country.name,
        countryCode: country.code,
        status: 'unknown',
      };

      if (type === 'shadowsocks') {
        baseNode.type = 'ss';
        baseNode.cipher = ob.method;
        baseNode.password = ob.password;
        nodes.push(baseNode);
      } else if (type === 'vmess') {
        baseNode.uuid = ob.uuid;
        baseNode.alterId = ob.alter_id || 0;
        baseNode.cipher = ob.security || 'auto';
        if (ob.tls && ob.tls.enabled) {
          baseNode.tls = true;
          baseNode.sni = ob.tls.server_name;
          baseNode.skipCertVerify = ob.tls.insecure;
        }
        if (ob.transport && ob.transport.type === 'ws') {
          baseNode.network = 'ws';
          baseNode.wsOpts = {
            path: ob.transport.path,
            headers: ob.transport.headers,
          };
        }
        nodes.push(baseNode);
      } else if (type === 'vless') {
        baseNode.uuid = ob.uuid;
        baseNode.flow = ob.flow;
        if (ob.tls && ob.tls.enabled) {
          baseNode.tls = true;
          baseNode.sni = ob.tls.server_name;
          baseNode.skipCertVerify = ob.tls.insecure;
          if (ob.tls.reality && ob.tls.reality.enabled) {
            baseNode.reality = {
              publicKey: ob.tls.reality.public_key,
              shortId: ob.tls.reality.short_id,
            };
          }
        }
        if (ob.transport && ob.transport.type === 'ws') {
          baseNode.network = 'ws';
          baseNode.wsOpts = {
            path: ob.transport.path,
            headers: ob.transport.headers,
          };
        }
        nodes.push(baseNode);
      } else if (type === 'trojan') {
        baseNode.password = ob.password;
        if (ob.tls && ob.tls.enabled) {
          baseNode.tls = true;
          baseNode.sni = ob.tls.server_name;
          baseNode.skipCertVerify = ob.tls.insecure;
        }
        nodes.push(baseNode);
      } else if (type === 'hysteria2') {
        baseNode.password = ob.password;
        baseNode.tls = true;
        if (ob.tls) {
          baseNode.sni = ob.tls.server_name;
          baseNode.skipCertVerify = ob.tls.insecure;
        }
        nodes.push(baseNode);
      } else {
        skippedTypes[type] = (skippedTypes[type] || 0) + 1;
      }
    }

    return { nodes, skippedTypes };
  } catch (e) {
    return { nodes: [], skippedTypes };
  }
}