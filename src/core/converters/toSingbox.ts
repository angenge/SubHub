import { ProxyNode } from '../types/index.js';

export interface SingboxGenerateOptions {
  mode?: 'gateway' | 'client'; // 'gateway': TUN + SOCKS5 + HTTP + 0.0.0.0; 'client': 127.0.0.1:2080 mixed
  socksPort?: number; // default 1080
  httpPort?: number; // default 1081
  enableTun?: boolean; // default true in gateway mode
  testInterval?: string; // e.g. '3m', '5m'
  testTolerance?: number; // e.g. 50
  enableAdblock?: boolean;
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
  'socks-in',
  'http-in',
  'tun-in',
  'cf-dns',
  'local-dns',
  '🚀 节点选择',
  '⚡ 自动选择',
]);

export function generateSingboxConfig(nodes: ProxyNode[], options: SingboxGenerateOptions = {}): string {
  const isGateway = options.mode === 'gateway' || options.enableTun !== false;
  const socksPort = options.socksPort || 1080;
  const httpPort = options.httpPort || 1081;
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

  const inbounds: any[] = [];

  if (isGateway) {
    // 1. SOCKS5 Inbound (Listen 0.0.0.0 for LAN)
    inbounds.push({
      type: 'socks',
      tag: 'socks-in',
      listen: '0.0.0.0',
      listen_port: socksPort,
    });
    // 2. HTTP/Mixed Inbound (Listen 0.0.0.0 for LAN)
    inbounds.push({
      type: 'mixed',
      tag: 'http-in',
      listen: '0.0.0.0',
      listen_port: httpPort,
    });
    // 3. TUN Transparent Gateway (Auto route for router/NAS/Linux)
    if (options.enableTun !== false) {
      inbounds.push({
        type: 'tun',
        tag: 'tun-in',
        interface_name: 'tun0',
        inet4_address: '172.19.0.1/30',
        auto_route: true,
        strict_route: true,
        stack: 'system',
        sniff: true,
      });
    }
  } else {
    // Client standalone mode (Localhost Mixed Proxy)
    inbounds.push({
      type: 'mixed',
      tag: 'mixed-in',
      listen: '127.0.0.1',
      listen_port: 2080,
    });
  }

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

  // Compatible route rules supporting Sing-box 1.8 ~ 1.15+ (ad-blocking, direct for CN/LAN, bypass SubHub domain loop)
  const routeRules: any[] = [
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

  const config = {
    log: {
      level: 'info',
      timestamp: true,
    },
    dns: {
      servers: [
        {
          tag: 'cf-dns',
          address: 'https://1.1.1.1/dns-query',
          detour: '🚀 节点选择',
        },
        {
          tag: 'local-dns',
          address: '223.5.5.5',
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
