import { ProxyNode } from '../types/index.js';

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

export function generateSingboxConfig(nodes: ProxyNode[]): string {
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
      interval: '5m',
      tolerance: 50,
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
    inbounds: [
      {
        type: 'mixed',
        tag: 'mixed-in',
        listen: '127.0.0.1',
        listen_port: 2080,
      },
    ],
    outbounds,
    route: {
      rules: [
        {
          protocol: 'dns',
          outbound: 'dns-out',
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
      ],
      final: '🚀 节点选择',
      auto_detect_interface: true,
    },
  };

  return JSON.stringify(config, null, 2);
}
