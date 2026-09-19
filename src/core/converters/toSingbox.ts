import { ProxyNode } from '../types/index.js';

export interface SingboxGenerateOptions {
  mixedPort?: number; // default 1080 (serves both SOCKS5 and HTTP simultaneously)
  listenAddress?: string; // default '0.0.0.0'
  testInterval?: string; // e.g. '3m', '5m'
  testTolerance?: number; // e.g. 50
}

export function convertToSingboxOutbound(node: ProxyNode): any {
  const base: any = {
    tag: node.name,
    type: node.type === 'ss' ? 'shadowsocks' : node.type,
    server: node.server,
    server_port: node.port,
  };

  if (node.type === 'ss') {
    base.method = node.cipher || 'aes-128-gcm';
    base.password = node.password;
    if (node.plugin) {
      base.plugin = node.plugin;
      if (node.pluginOpts) {
        base.plugin_opts = Object.entries(node.pluginOpts)
          .map(([k, v]) => (v === true ? k : `${k}=${v}`))
          .join(';');
      }
    }
  } else if (node.type === 'vmess') {
    base.uuid = node.uuid;
    base.security = node.cipher || 'auto';
    base.alter_id = node.alterId || 0;
    if (node.tls) {
      base.tls = {
        enabled: true,
        server_name: node.sni,
        insecure: node.skipCertVerify,
      };
    }
    if (node.network === 'ws') {
      base.transport = {
        type: 'ws',
        path: node.wsOpts?.path || '/',
        headers: node.wsOpts?.headers,
      };
    } else if (node.network === 'grpc') {
      base.transport = {
        type: 'grpc',
        service_name: node.grpcOpts?.serviceName || '',
      };
    }
  } else if (node.type === 'vless') {
    base.uuid = node.uuid;
    base.flow = node.flow;
    if (node.tls) {
      base.tls = {
        enabled: true,
        server_name: node.sni,
        insecure: node.skipCertVerify,
        utls: node.fingerprint ? { enabled: true, fingerprint: node.fingerprint } : undefined,
      };
      if (node.reality) {
        base.tls.reality = {
          enabled: true,
          public_key: node.reality.publicKey,
          short_id: node.reality.shortId,
        };
      }
    }
    if (node.network === 'ws') {
      base.transport = {
        type: 'ws',
        path: node.wsOpts?.path || '/',
        headers: node.wsOpts?.headers,
      };
    } else if (node.network === 'grpc') {
      base.transport = {
        type: 'grpc',
        service_name: node.grpcOpts?.serviceName || '',
      };
    }
  } else if (node.type === 'trojan') {
    base.password = node.password;
    base.tls = {
      enabled: true,
      server_name: node.sni,
      insecure: node.skipCertVerify,
    };
    if (node.network === 'ws') {
      base.transport = {
        type: 'ws',
        path: node.wsOpts?.path || '/',
        headers: node.wsOpts?.headers,
      };
    } else if (node.network === 'grpc') {
      base.transport = {
        type: 'grpc',
        service_name: node.grpcOpts?.serviceName || '',
      };
    }
  } else if (node.type === 'hysteria2') {
    base.password = node.password || node.hy2Opts?.auth;
    base.tls = {
      enabled: true,
      server_name: node.sni,
      insecure: node.skipCertVerify,
    };
    if (node.hy2Opts?.upMbps && node.hy2Opts?.downMbps) {
      base.up_mbps = node.hy2Opts.upMbps;
      base.down_mbps = node.hy2Opts.downMbps;
    }
    if (node.hy2Opts?.obfs) {
      base.obfs = {
        type: node.hy2Opts.obfs,
        password: node.hy2Opts.obfsPassword,
      };
    }
  }

  return base;
}

const SINGBOX_RESERVED_TAGS = new Set([
  'direct',
  'block',
  'dns-out',
  'mixed-in',
  'cf-dns',
  'local-dns',
  '🚀 节点选择',
  '⚡ 自动选择',
]);

export function generateSingboxConfig(nodes: ProxyNode[], options: SingboxGenerateOptions = {}): string {
  const mixedPort = options.mixedPort || 1080;
  const listenAddress = options.listenAddress || '0.0.0.0';
  const testInterval = options.testInterval || '3m';
  const testTolerance = options.testTolerance !== undefined ? options.testTolerance : 50;

  const safeNodes = nodes.map((n) => {
    let name = (n.name || '').trim() || `${n.server}:${n.port}`;
    if (SINGBOX_RESERVED_TAGS.has(name.toLowerCase()) || SINGBOX_RESERVED_TAGS.has(name)) {
      name = `${name} (Node)`;
    }
    return { ...n, name };
  });

  const nodeOutbounds = safeNodes.map(convertToSingboxOutbound);
  const nodeTags = safeNodes.map((n) => n.name);

  const fallbackTags = nodeTags.length > 0 ? nodeTags : ['direct'];

  // Modern Inbound standard compliant with Sing-box 1.11 ~ 1.15+ (sniff/domain_strategy migrated to route action)
  const inbounds = [
    {
      type: 'mixed',
      tag: 'mixed-in',
      listen: listenAddress,
      listen_port: mixedPort,
    },
  ];

  const outbounds: any[] = [
    {
      type: 'selector',
      tag: '🚀 节点选择',
      outbounds: ['⚡ 自动选择', ...nodeTags, 'direct'],
      default: '⚡ 自动选择',
    },
    {
      type: 'urltest',
      tag: '⚡ 自动选择',
      outbounds: fallbackTags,
      url: 'http://www.gstatic.com/generate_204',
      interval: testInterval,
      tolerance: testTolerance,
    },
    ...nodeOutbounds,
    {
      type: 'direct',
      tag: 'direct',
    },
    {
      type: 'block',
      tag: 'block',
    },
    {
      type: 'dns',
      tag: 'dns-out',
    },
  ];

  // Modern Route rules compatible across Sing-box 1.11 ~ 1.15+
  const routeRules: any[] = [
    {
      action: 'sniff',
    },
    {
      protocol: 'dns',
      outbound: 'dns-out',
    },
    {
      domain_suffix: ['hiz.one', 'subhub.hiz.one'],
      outbound: 'direct',
    },
    {
      geosite: 'category-ads-all',
      outbound: 'block',
    },
    {
      geosite: 'cn',
      geoip: ['cn', 'private'],
      outbound: 'direct',
    },
    {
      ip_is_private: true,
      outbound: 'direct',
    },
  ];

  // Modern DNS format standard required since sing-box 1.12.0+ (removed legacy address field in 1.14+)
  const config = {
    log: {
      level: 'info',
      timestamp: true,
    },
    dns: {
      servers: [
        {
          tag: 'cf-dns',
          type: 'https',
          server: '1.1.1.1',
          server_port: 443,
          path: '/dns-query',
          detour: '🚀 节点选择',
        },
        {
          tag: 'local-dns',
          type: 'udp',
          server: '223.5.5.5',
          server_port: 53,
          detour: 'direct',
        },
      ],
      rules: [
        {
          outbound: 'any',
          server: 'local-dns',
        },
        {
          geosite: 'cn',
          server: 'local-dns',
        },
      ],
    },
    inbounds,
    outbounds,
    route: {
      rules: routeRules,
      final: '🚀 节点选择',
      auto_detect_interface: true,
    },
  };

  return JSON.stringify(config, null, 2);
}
