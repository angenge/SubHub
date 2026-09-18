import YAML from 'yaml';
import { ProxyNode } from '../types/index.js';

export function convertToClashProxyObject(node: ProxyNode): any {
  const base: any = {
    name: node.name,
    type: node.type === 'hysteria2' ? 'hysteria2' : node.type,
    server: node.server,
    port: node.port,
    udp: node.udp !== false,
  };

  if (node.type === 'ss') {
    base.cipher = node.cipher || 'aes-128-gcm';
    base.password = node.password;
    if (node.plugin) {
      base.plugin = node.plugin;
      if (node.pluginOpts) {
        base['plugin-opts'] = node.pluginOpts;
      }
    }
  } else if (node.type === 'vmess') {
    base.uuid = node.uuid;
    base.alterId = node.alterId || 0;
    base.cipher = node.cipher || 'auto';
    base.network = node.network || 'tcp';
    base.tls = !!node.tls;
    if (node.sni) base.servername = node.sni;
    if (node.skipCertVerify) base['skip-cert-verify'] = true;
    if (node.wsOpts) {
      base['ws-opts'] = {
        path: node.wsOpts.path || '/',
        headers: node.wsOpts.headers,
      };
    }
    if (node.grpcOpts) {
      base['grpc-opts'] = {
        'grpc-service-name': node.grpcOpts.serviceName,
      };
    }
  } else if (node.type === 'vless') {
    base.uuid = node.uuid;
    base.flow = node.flow;
    base.network = node.network || 'tcp';
    base.tls = !!node.tls;
    if (node.sni) base.servername = node.sni;
    if (node.fingerprint) base['client-fingerprint'] = node.fingerprint;
    if (node.skipCertVerify) base['skip-cert-verify'] = true;
    if (node.reality) {
      base['reality-opts'] = {
        'public-key': node.reality.publicKey,
        'short-id': node.reality.shortId,
      };
      if (node.reality.spiderX) base['reality-opts']['spider-x'] = node.reality.spiderX;
    }
    if (node.wsOpts) {
      base['ws-opts'] = {
        path: node.wsOpts.path || '/',
        headers: node.wsOpts.headers,
      };
    }
    if (node.grpcOpts) {
      base['grpc-opts'] = {
        'grpc-service-name': node.grpcOpts.serviceName,
      };
    }
  } else if (node.type === 'trojan') {
    base.password = node.password;
    base.network = node.network || 'tcp';
    base.tls = true;
    if (node.sni) base.sni = node.sni;
    if (node.skipCertVerify) base['skip-cert-verify'] = true;
    if (node.alpn) base.alpn = node.alpn;
    if (node.wsOpts) {
      base['ws-opts'] = {
        path: node.wsOpts.path || '/',
        headers: node.wsOpts.headers,
      };
    }
    if (node.grpcOpts) {
      base['grpc-opts'] = {
        'grpc-service-name': node.grpcOpts.serviceName,
      };
    }
  } else if (node.type === 'hysteria2') {
    base.password = node.password || node.hy2Opts?.auth;
    base.tls = true;
    if (node.sni) base.sni = node.sni;
    if (node.skipCertVerify) base['skip-cert-verify'] = true;
    if (node.hy2Opts?.upMbps) base.up = node.hy2Opts.upMbps;
    if (node.hy2Opts?.downMbps) base.down = node.hy2Opts.downMbps;
    if (node.hy2Opts?.obfs) {
      base.obfs = node.hy2Opts.obfs;
      base['obfs-password'] = node.hy2Opts.obfsPassword;
    }
  }

  return base;
}

const CLASH_RESERVED_NAMES = new Set([
  'direct',
  'reject',
  'pass',
  'global',
  '🚀 节点选择',
  '⚡ 自动选择',
  '🛡️ 故障转移',
  '🐟 漏网之鱼',
  '🇭🇰 香港节点',
  '🇯🇵 日本节点',
  '🇺🇸 美国节点',
  '🇸🇬 新加坡节点',
  '🇹🇼 台湾节点',
]);

export function generateClashConfig(nodes: ProxyNode[], options: { template?: string } = {}): string {
  const safeNodes = nodes.map((n) => {
    let name = (n.name || '').trim() || `${n.server}:${n.port}`;
    if (CLASH_RESERVED_NAMES.has(name.toLowerCase()) || CLASH_RESERVED_NAMES.has(name)) {
      name = `${name} (Node)`;
    }
    return { ...n, name };
  });

  const proxyList = safeNodes.map(convertToClashProxyObject);
  const proxyNames = safeNodes.map((n) => n.name);

  // Group nodes by country
  const hkNodes = safeNodes.filter((n) => n.countryCode === 'HK').map((n) => n.name);
  const jpNodes = safeNodes.filter((n) => n.countryCode === 'JP').map((n) => n.name);
  const usNodes = safeNodes.filter((n) => n.countryCode === 'US').map((n) => n.name);
  const sgNodes = safeNodes.filter((n) => n.countryCode === 'SG').map((n) => n.name);
  const twNodes = safeNodes.filter((n) => n.countryCode === 'TW').map((n) => n.name);

  const fallbackProxy = proxyNames.length > 0 ? proxyNames : ['DIRECT'];
  const mainSelectProxies = proxyNames.length > 0
    ? ['⚡ 自动选择', '🛡️ 故障转移', ...proxyNames, 'DIRECT']
    : ['DIRECT'];

  const proxyGroups: any[] = [
    {
      name: '🚀 节点选择',
      type: 'select',
      proxies: mainSelectProxies,
    },
    {
      name: '⚡ 自动选择',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      tolerance: 50,
      proxies: fallbackProxy,
    },
    {
      name: '🛡️ 故障转移',
      type: 'fallback',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      proxies: fallbackProxy,
    },
  ];

  if (hkNodes.length > 0) {
    proxyGroups.push({
      name: '🇭🇰 香港节点',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      proxies: hkNodes,
    });
  }
  if (jpNodes.length > 0) {
    proxyGroups.push({
      name: '🇯🇵 日本节点',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      proxies: jpNodes,
    });
  }
  if (usNodes.length > 0) {
    proxyGroups.push({
      name: '🇺🇸 美国节点',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      proxies: usNodes,
    });
  }
  if (sgNodes.length > 0) {
    proxyGroups.push({
      name: '🇸🇬 新加坡节点',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      proxies: sgNodes,
    });
  }
  if (twNodes.length > 0) {
    proxyGroups.push({
      name: '🇹🇼 台湾节点',
      type: 'url-test',
      url: 'http://www.gstatic.com/generate_204',
      interval: 300,
      proxies: twNodes,
    });
  }

  proxyGroups.push({
    name: '🐟 漏网之鱼',
    type: 'select',
    proxies: ['🚀 节点选择', 'DIRECT'],
  });

  const config: any = {
    port: 7890,
    'socks-port': 7891,
    'allow-lan': true,
    mode: 'rule',
    'log-level': 'info',
    'external-controller': '127.0.0.1:9090',
    dns: {
      enable: true,
      ipv6: false,
      'default-nameserver': ['223.5.5.5', '119.29.29.29'],
      'enhanced-mode': 'fake-ip',
      'fake-ip-range': '198.18.0.1/16',
      nameserver: ['https://doh.pub/dns-query', 'https://dns.alidns.com/dns-query'],
      fallback: ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query'],
    },
    proxies: proxyList,
    'proxy-groups': proxyGroups,
    rules: [
      'DOMAIN-SUFFIX,local,DIRECT',
      'IP-CIDR,127.0.0.0/8,DIRECT',
      'IP-CIDR,172.16.0.0/12,DIRECT',
      'IP-CIDR,192.168.0.0/16,DIRECT',
      'IP-CIDR,10.0.0.0/8,DIRECT',
      'GEOIP,CN,DIRECT',
      'MATCH,🚀 节点选择',
    ],
  };

  return YAML.stringify(config);
}
