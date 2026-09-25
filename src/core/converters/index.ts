import { ProxyNode, assertNever } from '../types/index.js';
import { safeBase64Encode } from '../parsers/uri.js';

export function convertNodeToUri(node: ProxyNode): string {
  const encName = encodeURIComponent(node.name);

  switch (node.type) {
    case 'vless': {
      let uri = `vless://${node.uuid}@${node.server}:${node.port}?type=${node.network || 'tcp'}`;
      if (node.tls) {
        if (node.reality) {
          uri += `&security=reality&pbk=${node.reality.publicKey}`;
          if (node.reality.shortId) uri += `&sid=${node.reality.shortId}`;
          if (node.reality.spiderX) uri += `&spx=${encodeURIComponent(node.reality.spiderX)}`;
        } else {
          uri += '&security=tls';
        }
      }
      if (node.sni) uri += `&sni=${node.sni}`;
      if (node.flow) uri += `&flow=${node.flow}`;
      if (node.network === 'ws' && node.wsOpts?.path) {
        uri += `&path=${encodeURIComponent(node.wsOpts.path)}`;
        if (node.wsOpts.headers?.Host) uri += `&host=${node.wsOpts.headers.Host}`;
      }
      if (node.network === 'grpc' && node.grpcOpts?.serviceName) {
        uri += `&serviceName=${encodeURIComponent(node.grpcOpts.serviceName)}`;
      }
      uri += `#${encName}`;
      return uri;
    }
    case 'vmess': {
      const vmessJson = {
        v: '2',
        ps: node.name,
        add: node.server,
        port: node.port,
        id: node.uuid,
        aid: node.alterId || 0,
        scy: node.cipher || 'auto',
        net: node.network || 'tcp',
        type: 'none',
        host: node.wsOpts?.headers?.Host || '',
        path: node.wsOpts?.path || '',
        tls: node.tls ? 'tls' : '',
        sni: node.sni || '',
      };
      return `vmess://${safeBase64Encode(JSON.stringify(vmessJson))}`;
    }
    case 'trojan': {
      let uri = `trojan://${encodeURIComponent(node.password || '')}@${node.server}:${node.port}?type=${node.network || 'tcp'}`;
      if (node.sni) uri += `&sni=${node.sni}`;
      if (node.skipCertVerify) uri += '&allowInsecure=1';
      if (node.network === 'ws' && node.wsOpts?.path) {
        uri += `&path=${encodeURIComponent(node.wsOpts.path)}`;
        if (node.wsOpts.headers?.Host) uri += `&host=${node.wsOpts.headers.Host}`;
      }
      uri += `#${encName}`;
      return uri;
    }
    case 'ss': {
      const auth = `${node.cipher || 'aes-128-gcm'}:${node.password || ''}`;
      const encodedAuth = safeBase64Encode(auth);
      let pluginParam = '';
      if (node.plugin) {
        let pluginStr = node.plugin;
        if (node.pluginOpts && Object.keys(node.pluginOpts).length > 0) {
          const optStr = Object.entries(node.pluginOpts)
            .map(([k, v]) => (v === true ? k : `${k}=${v}`))
            .join(';');
          pluginStr += `;${optStr}`;
        }
        pluginParam = `/?plugin=${encodeURIComponent(pluginStr)}`;
      }
      return `ss://${encodedAuth}@${node.server}:${node.port}${pluginParam}#${encName}`;
    }
    case 'hysteria2': {
      const params = new URLSearchParams();
      if (node.sni) params.set('sni', node.sni);
      if (node.skipCertVerify) params.set('insecure', '1');
      if (node.hy2Opts?.obfs) {
        params.set('obfs', node.hy2Opts.obfs);
        if (node.hy2Opts.obfsPassword) {
          params.set('obfs-password', node.hy2Opts.obfsPassword);
        }
      }
      const queryString = params.toString();
      const queryPart = queryString ? `?${queryString}` : '';
      return `hysteria2://${encodeURIComponent(node.password || '')}@${node.server}:${node.port}${queryPart}#${encName}`;
    }
    case 'anytls': {
      const params = new URLSearchParams();
      if (node.sni) params.set('sni', node.sni);
      if (node.skipCertVerify) params.set('insecure', '1');
      if (node.fingerprint) params.set('fp', node.fingerprint);
      if (node.alpn && node.alpn.length > 0) params.set('alpn', node.alpn.join(','));
      const queryString = params.toString();
      const queryPart = queryString ? `?${queryString}` : '';
      return `anytls://${encodeURIComponent(node.password || '')}@${node.server}:${node.port}${queryPart}#${encName}`;
    }
    case 'socks5': {
      const auth = node.uuid && node.password ? `${encodeURIComponent(node.uuid)}:${encodeURIComponent(node.password)}@` : '';
      return `socks5://${auth}${node.server}:${node.port}#${encName}`;
    }
    case 'http': {
      const auth = node.uuid && node.password ? `${encodeURIComponent(node.uuid)}:${encodeURIComponent(node.password)}@` : '';
      const scheme = node.tls ? 'https' : 'http';
      return `${scheme}://${auth}${node.server}:${node.port}#${encName}`;
    }
    case 'wireguard': {
      return `wireguard://${node.server}:${node.port}#${encName}`;
    }
    default: {
      assertNever(node.type, `URI 转换器未适配该协议类型: ${(node as any).type}`);
    }
  }
}

export function generateBase64Subscription(nodes: ProxyNode[]): string {
  const uris = nodes.map(convertNodeToUri).filter(Boolean);
  return safeBase64Encode(uris.join('\n'));
}

export function sanitizeLineConfigName(rawName?: string, defaultName = 'Proxy'): string {
  if (!rawName || typeof rawName !== 'string') return defaultName;
  // Strip control characters, newlines, carriage returns
  let name = rawName.replace(/[\r\n\0\x0B\x0C]+/g, ' ').trim();
  // Strip commas, equal signs, and leading brackets that break line format
  name = name.replace(/[,=]/g, ' ').replace(/^\[+|\]+$/g, '').trim();
  if (!name || /^\[.*\]$/.test(name)) {
    return defaultName;
  }
  return name;
}

function cleanField(val?: string | number | null): string {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[\r\n\0]+/g, '').trim();
}

export function generateSurgeConfig(nodes: ProxyNode[]): string {
  const lines: string[] = ['[Proxy]'];
  for (const node of nodes) {
    const name = sanitizeLineConfigName(node.name);
    const server = cleanField(node.server);
    const port = cleanField(node.port);
    const password = cleanField(node.password);
    const sni = cleanField(node.sni);
    const uuid = cleanField(node.uuid);
    const cipher = cleanField(node.cipher) || 'aes-128-gcm';

    switch (node.type) {
      case 'ss': {
        lines.push(`${name} = ss, ${server}, ${port}, encrypt-method=${cipher}, password=${password}`);
        break;
      }
      case 'trojan': {
        lines.push(`${name} = trojan, ${server}, ${port}, password=${password}${sni ? `, sni=${sni}` : ''}${node.skipCertVerify ? ', skip-cert-verify=true' : ''}`);
        break;
      }
      case 'vmess': {
        lines.push(`${name} = vmess, ${server}, ${port}, username=${uuid}${node.tls ? ', tls=true' : ''}${node.wsOpts ? `, ws=true, ws-path=${cleanField(node.wsOpts.path)}` : ''}`);
        break;
      }
      case 'vless': {
        let line = `${name} = vless, ${server}, ${port}, username=${uuid}`;
        if (node.tls) line += ', tls=true';
        if (sni) line += `, sni=${sni}`;
        if (node.skipCertVerify) line += ', skip-cert-verify=true';
        if (node.wsOpts?.path) line += `, ws=true, ws-path=${cleanField(node.wsOpts.path)}`;
        if (node.wsOpts?.headers?.Host) line += `, ws-headers=Host:${cleanField(node.wsOpts.headers.Host)}`;
        lines.push(line);
        break;
      }
      case 'hysteria2': {
        lines.push(`${name} = hysteria2, ${server}, ${port}, password=${password}${sni ? `, sni=${sni}` : ''}${node.skipCertVerify ? ', skip-cert-verify=true' : ''}`);
        break;
      }
      case 'socks5': {
        let line = `${name} = socks5, ${server}, ${port}`;
        if (password) {
          line += `, username=${uuid}, password=${password}`;
        }
        lines.push(line);
        break;
      }
      case 'http': {
        let line = `${name} = http, ${server}, ${port}`;
        if (password) {
          line += `, username=${uuid}, password=${password}`;
        }
        lines.push(line);
        break;
      }
      case 'anytls':
      case 'wireguard': {
        // Surge 客户端原生语法不支持此类协议，生成安全跳过注释
        lines.push(`# [Skipped] ${name} (${node.type}) - Surge 客户端原生语法暂不支持`);
        break;
      }
      default: {
        assertNever(node.type, `Surge 转换器未适配该协议类型: ${(node as any).type}`);
      }
    }
  }
  return lines.join('\n');
}

export function generateLoonConfig(nodes: ProxyNode[]): string {
  const lines: string[] = ['[Proxy]'];
  for (const node of nodes) {
    const name = sanitizeLineConfigName(node.name);
    const server = cleanField(node.server);
    const port = cleanField(node.port);
    const password = cleanField(node.password);
    const sni = cleanField(node.sni);
    const uuid = cleanField(node.uuid);
    const cipher = cleanField(node.cipher) || 'aes-128-gcm';

    switch (node.type) {
      case 'ss': {
        lines.push(`${name} = Shadowsocks,${server},${port},${cipher},"${password}"`);
        break;
      }
      case 'trojan': {
        lines.push(`${name} = Trojan,${server},${port},"${password}"${sni ? `,sni=${sni}` : ''}`);
        break;
      }
      case 'vmess': {
        lines.push(`${name} = vmess,${server},${port},${cleanField(node.cipher) || 'auto'},"${uuid}"${node.network === 'ws' ? ',transport=ws' : ''}${node.wsOpts ? `,path=${cleanField(node.wsOpts.path)}` : ''}${node.tls ? ',over-tls=true' : ''}`);
        break;
      }
      case 'vless': {
        let line = `${name} = vless,${server},${port},"${uuid}"`;
        if (node.tls) line += ',over-tls=true';
        if (sni) line += `,sni=${sni}`;
        if (node.network === 'ws') line += ',transport=ws';
        if (node.wsOpts?.path) line += `,path=${cleanField(node.wsOpts.path)}`;
        if (node.wsOpts?.headers?.Host) line += `,host=${cleanField(node.wsOpts.headers.Host)}`;
        lines.push(line);
        break;
      }
      case 'hysteria2': {
        lines.push(`${name} = Hysteria2,${server},${port},auth=${password}${sni ? `,sni=${sni}` : ''}`);
        break;
      }
      case 'socks5': {
        let line = `${name} = socks5,${server},${port}`;
        if (uuid || password) {
          line += `,"${uuid}","${password}"`;
        }
        lines.push(line);
        break;
      }
      case 'http': {
        let line = `${name} = http,${server},${port}`;
        if (uuid || password) {
          line += `,"${uuid}","${password}"`;
        }
        lines.push(line);
        break;
      }
      case 'anytls':
      case 'wireguard': {
        // Loon 客户端原生语法不支持此类协议，生成安全跳过注释
        lines.push(`# [Skipped] ${name} (${node.type}) - Loon 客户端原生语法暂不支持`);
        break;
      }
      default: {
        assertNever(node.type, `Loon 转换器未适配该协议类型: ${(node as any).type}`);
      }
    }
  }
  return lines.join('\n');
}

export * from './toClash.js';
export * from './toSingbox.js';

