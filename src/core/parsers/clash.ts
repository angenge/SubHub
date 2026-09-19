import YAML from 'yaml';
import { ProxyNode } from '../types/index.js';
import { detectCountry } from '../utils/country.js';
import { generateNodeId } from './uri.js';

export interface ClashParseResult {
  nodes: ProxyNode[];
  skippedTypes: Record<string, number>;
}

export function parseClashConfig(content: string): ProxyNode[] {
  return parseClashConfigDetailed(content).nodes;
}

export function parseClashConfigDetailed(content: string): ClashParseResult {
  const skippedTypes: Record<string, number> = {};
  try {
    const doc = YAML.parse(content);
    if (!doc || !Array.isArray(doc.proxies)) {
      return { nodes: [], skippedTypes };
    }

    const nodes: ProxyNode[] = [];

    for (const p of doc.proxies) {
      if (!p || !p.type || !p.server || !p.port) continue;

      const port = parseInt(p.port, 10);
      if (isNaN(port) || port <= 0 || port > 65535) continue;

      const type = (p.type as string).toLowerCase();
      const name = p.name || `${p.server}:${port}`;
      const country = detectCountry(name);

      const baseNode: ProxyNode = {
        id: generateNodeId(p.server, port, type, name),
        name,
        type: type as any,
        server: p.server,
        port,
        udp: p.udp !== false,
        country: country.name,
        countryCode: country.code,
        status: 'unknown',
      };

      if (type === 'ss' || type === 'shadowsocks') {
        baseNode.type = 'ss';
        baseNode.cipher = p.cipher;
        baseNode.password = p.password;
        if (p.plugin) {
          baseNode.plugin = p.plugin;
          if (p['plugin-opts']) {
            baseNode.pluginOpts = p['plugin-opts'];
          }
        }
        nodes.push(baseNode);
      } else if (type === 'vmess') {
        baseNode.uuid = p.uuid;
        baseNode.alterId = p.alterId !== undefined ? p.alterId : 0;
        baseNode.cipher = p.cipher || 'auto';
        baseNode.network = p.network || 'tcp';
        baseNode.tls = !!p.tls;
        baseNode.sni = p.servername || p.sni;
        baseNode.skipCertVerify = p['skip-cert-verify'];

        if (p['ws-opts']) {
          baseNode.wsOpts = {
            path: p['ws-opts'].path,
            headers: p['ws-opts'].headers,
          };
        }
        if (p['grpc-opts']) {
          baseNode.grpcOpts = {
            serviceName: p['grpc-opts']['grpc-service-name'],
          };
        }
        nodes.push(baseNode);
      } else if (type === 'vless') {
        baseNode.uuid = p.uuid;
        baseNode.flow = p.flow;
        baseNode.network = p.network || 'tcp';
        baseNode.tls = !!p.tls;
        baseNode.sni = p.servername || p.sni;
        baseNode.skipCertVerify = p['skip-cert-verify'];

        if (p['reality-opts']) {
          baseNode.reality = {
            publicKey: p['reality-opts']['public-key'],
            shortId: p['reality-opts']['short-id'],
          };
        }
        if (p['ws-opts']) {
          baseNode.wsOpts = {
            path: p['ws-opts'].path,
            headers: p['ws-opts'].headers,
          };
        }
        if (p['grpc-opts']) {
          baseNode.grpcOpts = {
            serviceName: p['grpc-opts']['grpc-service-name'],
          };
        }
        nodes.push(baseNode);
      } else if (type === 'trojan') {
        baseNode.password = p.password;
        baseNode.network = p.network || 'tcp';
        baseNode.tls = true;
        baseNode.sni = p.sni || p.servername || p.server;
        baseNode.skipCertVerify = p['skip-cert-verify'];
        if (p['ws-opts']) {
          baseNode.wsOpts = {
            path: p['ws-opts'].path,
            headers: p['ws-opts'].headers,
          };
        }
        nodes.push(baseNode);
      } else if (type === 'hysteria2' || type === 'hy2') {
        baseNode.type = 'hysteria2';
        baseNode.password = p.password || p.auth;
        baseNode.tls = true;
        baseNode.sni = p.sni;
        baseNode.skipCertVerify = p['skip-cert-verify'];
        baseNode.hy2Opts = {
          auth: p.password || p.auth,
          upMbps: p.up,
          downMbps: p.down,
          obfs: p.obfs,
          obfsPassword: p['obfs-password'],
        };
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