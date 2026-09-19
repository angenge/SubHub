import { ProxyNode } from '../types/index.js';

export interface SingboxGenerateOptions {
  mixedPort?: number; // default 1080 (serves both SOCKS5 and HTTP simultaneously)
  listenAddress?: string; // default '0.0.0.0'
  testInterval?: string; // e.g. '15m' - probe group interval
  testTolerance?: number; // e.g. 50
  clashApiSecret?: string; // enable experimental.clash_api dashboard (yacd) on port 9090 when provided
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
      if (node.fingerprint) {
        base.tls.utls = {
          enabled: true,
          fingerprint: node.fingerprint,
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
  } else if (node.type === 'vless') {
    base.uuid = node.uuid;
    base.flow = node.flow;
    if (node.tls) {
      const isReality = !!node.reality;
      base.tls = {
        enabled: true,
        server_name: node.sni,
        insecure: node.skipCertVerify,
        // Reality requires uTLS to be enabled (default to 'chrome' if not specified)
        utls: {
          enabled: true,
          fingerprint: node.fingerprint || (isReality ? 'chrome' : undefined),
        },
      };

      if (!base.tls.utls.fingerprint) {
        delete base.tls.utls;
      }

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
    if (node.fingerprint) {
      base.tls.utls = {
        enabled: true,
        fingerprint: node.fingerprint,
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
  'mixed-in',
  'cf-dns',
  'local-dns',
  '🚀 节点选择',
  '🧪 节点探针',
]);

export function generateSingboxConfig(nodes: ProxyNode[], options: SingboxGenerateOptions = {}): string {
  const mixedPort = options.mixedPort || 1080;
  const listenAddress = options.listenAddress || '0.0.0.0';
  const testInterval = options.testInterval || '15m';
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

  // Single mixed inbound: simultaneously handles SOCKS5 and HTTP on the same port (1080)
  const inbounds = [
    {
      type: 'mixed',
      tag: 'mixed-in',
      listen: listenAddress,
      listen_port: mixedPort,
    },
  ];

  // Outbounds without legacy 'type: dns'
  const outbounds: any[] = [
    {
      type: 'selector',
      tag: '🚀 节点选择',
      outbounds: [...nodeTags, 'direct'],
      default: nodeTags[0] || 'direct',
    },
    {
      // Probe-only group: feeds latency ranking data via Clash API history,
      // never routed to, so it does NOT auto-select real traffic.
      type: 'urltest',
      tag: '🧪 节点探针',
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
  ];

  // Modern Rule-Set definitions (Sing-box 1.12 ~ 1.15+ compliant)
  const ruleSets = [
    {
      tag: 'geosite-category-ads-all',
      type: 'remote',
      format: 'binary',
      url: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ads-all.srs',
      download_detour: '🚀 节点选择',
    },
    {
      tag: 'geosite-cn',
      type: 'remote',
      format: 'binary',
      url: 'https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs',
      download_detour: '🚀 节点选择',
    },
    {
      tag: 'geoip-cn',
      type: 'remote',
      format: 'binary',
      url: 'https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs',
      download_detour: '🚀 节点选择',
    },
  ];

  // Route rules using modern actions and rule_sets
  const routeRules: any[] = [
    {
      action: 'sniff',
    },
    {
      protocol: 'dns',
      action: 'hijack-dns',
    },
    {
      domain_suffix: ['hiz.one', 'subhub.hiz.one'],
      outbound: 'direct',
    },
    {
      ip_is_private: true,
      outbound: 'direct',
    },
    {
      rule_set: 'geosite-category-ads-all',
      outbound: 'block',
    },
    {
      rule_set: ['geosite-cn', 'geoip-cn'],
      outbound: 'direct',
    },
  ];

  // Modern DNS rules: use action: route and remove legacy outbound field (1.12+ compliant)
  const dnsRules: any[] = [
    {
      rule_set: 'geosite-cn',
      action: 'route',
      server: 'local-dns',
    },
  ];

  const config = {
    log: {
      level: 'debug',
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
        },
      ],
      rules: dnsRules,
      final: 'cf-dns',
      strategy: 'ipv4_only',
    },
    inbounds,
    outbounds,
    route: {
      default_domain_resolver: 'local-dns',
      rule_set: ruleSets,
      rules: routeRules,
      final: '🚀 节点选择',
      auto_detect_interface: true,
    },
  };

  if (options.clashApiSecret) {
    (config as any).experimental = {
      clash_api: {
        external_controller: '0.0.0.0:9090',
        external_ui: 'yacd',
        secret: options.clashApiSecret,
        default_mode: 'rule',
      },
    };
  }

  return JSON.stringify(config, null, 2);
}
