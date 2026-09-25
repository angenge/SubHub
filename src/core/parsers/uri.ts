import { ProxyNode } from '../types/index.js';
import { detectCountry } from '../utils/country.js';

// Safe base64 decoder supporting URL-safe base64 and UTF-8
export function safeBase64Decode(str: string): string {
  try {
    let normalized = str.trim().replace(/^\uFEFF/, '').replace(/[\r\n\s]+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4 !== 0) {
      normalized += '=';
    }
    return Buffer.from(normalized, 'base64').toString('utf-8');
  } catch (e) {
    return '';
  }
}

export function safeBase64Encode(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

export function safeDecodeURIComponent(str: string): string {
  if (!str) return '';
  try {
    return decodeURIComponent(str);
  } catch {
    try {
      // Escape lone % symbols not followed by 2 hex digits
      const sanitized = str.replace(/%(?![0-9a-fA-F]{2})/g, '%25');
      return decodeURIComponent(sanitized);
    } catch {
      try {
        return unescape(str);
      } catch {
        return str;
      }
    }
  }
}

export function generateNodeId(server: string, port: number, type: string, name: string): string {
  const seed = `${type}:${(server || '').toLowerCase()}:${port}:${(name || '').trim()}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const hexHash = Math.abs(hash).toString(16).padStart(8, '0');
  return `node_${hexHash}`;
}

export function parseVlessUri(uri: string): ProxyNode | null {
  try {
    const url = new URL(uri);
    const uuid = url.username;
    const server = url.hostname;
    const port = parseInt(url.port || '443', 10);
    if (!server || isNaN(port) || port <= 0 || port > 65535) return null;

    const name = safeDecodeURIComponent(url.hash ? url.hash.slice(1) : `${server}:${port}`);
    const params = url.searchParams;

    const security = params.get('security') || 'none';
    const type = params.get('type') || 'tcp';
    const flow = params.get('flow') || undefined;
    const sni = params.get('sni') || undefined;
    const fp = params.get('fp') || params.get('client-fingerprint') || undefined;
    const pbk = params.get('pbk') || undefined;
    const sid = params.get('sid') || undefined;
    const spx = params.get('spx') || undefined;
    const path = params.get('path') || undefined;
    const serviceName = params.get('serviceName') || undefined;
    const alpn = params.get('alpn') ? params.get('alpn')!.split(',') : undefined;

    const country = detectCountry(name);

    const node: ProxyNode = {
      id: generateNodeId(server, port, 'vless', name),
      name,
      type: 'vless',
      server,
      port,
      uuid,
      flow,
      network: type as any,
      tls: security === 'tls' || security === 'reality',
      sni,
      alpn,
      fingerprint: fp,
      country: country.name,
      countryCode: country.code,
      status: 'unknown',
      rawUri: uri,
    };

    if (security === 'reality' && pbk) {
      node.reality = {
        publicKey: pbk,
        shortId: sid,
        spiderX: spx,
      };
    }

    if (type === 'ws' && path) {
      const host = params.get('host') || sni;
      node.wsOpts = {
        path,
        headers: host ? { Host: host } : undefined,
      };
    }

    if (type === 'grpc' && serviceName) {
      node.grpcOpts = { serviceName };
    }

    return node;
  } catch (e) {
    return null;
  }
}

export function parseVmessUri(uri: string): ProxyNode | null {
  try {
    const raw = uri.slice(8); // remove vmess://
    const decoded = safeBase64Decode(raw);
    const json = JSON.parse(decoded);

    const server = json.add || json.address || '';
    const port = parseInt(json.port, 10);
    if (!server || isNaN(port) || port <= 0 || port > 65535) return null;

    const uuid = json.id;
    const alterId = parseInt(json.aid || '0', 10);
    const name = json.ps || `${server}:${port}`;
    const net = json.net || 'tcp';
    const tls = json.tls === 'tls';
    const sni = json.sni || json.host || undefined;
    const path = json.path || undefined;
    const cipher = json.scy || 'auto';

    const country = detectCountry(name);

    const node: ProxyNode = {
      id: generateNodeId(server, port, 'vmess', name),
      name,
      type: 'vmess',
      server,
      port,
      uuid,
      alterId,
      cipher,
      network: net as any,
      tls,
      sni,
      country: country.name,
      countryCode: country.code,
      status: 'unknown',
      rawUri: uri,
    };

    if (net === 'ws') {
      node.wsOpts = {
        path: path || '/',
        headers: json.host ? { Host: json.host } : undefined,
      };
    } else if (net === 'grpc') {
      node.grpcOpts = {
        serviceName: path || '',
      };
    }

    return node;
  } catch (e) {
    return null;
  }
}

export function parseTrojanUri(uri: string): ProxyNode | null {
  try {
    const url = new URL(uri);
    const password = safeDecodeURIComponent(url.username);
    const server = url.hostname;
    const port = parseInt(url.port || '443', 10);
    if (!server || isNaN(port) || port <= 0 || port > 65535) return null;

    const name = safeDecodeURIComponent(url.hash ? url.hash.slice(1) : `${server}:${port}`);
    const params = url.searchParams;

    const sni = params.get('sni') || params.get('peer') || server;
    const type = params.get('type') || 'tcp';
    const alpn = params.get('alpn') ? params.get('alpn')!.split(',') : undefined;
    const skipCertVerify = params.get('allowInsecure') === '1' || params.get('insecure') === '1';

    const country = detectCountry(name);

    const node: ProxyNode = {
      id: generateNodeId(server, port, 'trojan', name),
      name,
      type: 'trojan',
      server,
      port,
      password,
      network: type as any,
      tls: true,
      sni,
      alpn,
      skipCertVerify,
      country: country.name,
      countryCode: country.code,
      status: 'unknown',
      rawUri: uri,
    };

    if (type === 'ws') {
      const path = params.get('path') || '/';
      const host = params.get('host') || sni;
      node.wsOpts = { path, headers: host ? { Host: host } : undefined };
    } else if (type === 'grpc') {
      node.grpcOpts = { serviceName: params.get('serviceName') || '' };
    }

    return node;
  } catch (e) {
    return null;
  }
}

export function parseShadowsocksUri(uri: string): ProxyNode | null {
  try {
    const raw = uri.slice(5); // remove ss://
    const hashIndex = raw.indexOf('#');
    let encodedPart = hashIndex !== -1 ? raw.slice(0, hashIndex) : raw;
    const name = hashIndex !== -1 ? safeDecodeURIComponent(raw.slice(hashIndex + 1)) : '';

    let server = '';
    let port = 0;
    let cipher = '';
    let password = '';
    let plugin: string | undefined;
    let pluginOpts: Record<string, any> | undefined;

    if (encodedPart.includes('@')) {
      // SIP002 format: ss://userinfo@host:port/?plugin=...
      const atIdx = encodedPart.lastIndexOf('@');
      const userinfo = encodedPart.slice(0, atIdx);
      let hostPort = encodedPart.slice(atIdx + 1);

      // Extract plugin parameter if present
      const queryIdx = hostPort.indexOf('?');
      if (queryIdx !== -1) {
        const queryStr = hostPort.slice(queryIdx + 1);
        hostPort = hostPort.slice(0, queryIdx);
        try {
          const params = new URLSearchParams(queryStr);
          const rawPlugin = params.get('plugin');
          if (rawPlugin) {
            const decodedPlugin = safeDecodeURIComponent(rawPlugin);
            const [pluginName, ...opts] = decodedPlugin.split(';');
            plugin = pluginName;
            pluginOpts = {};
            for (const opt of opts) {
              if (!opt) continue;
              const eqIdx = opt.indexOf('=');
              if (eqIdx !== -1) {
                pluginOpts[opt.slice(0, eqIdx)] = opt.slice(eqIdx + 1);
              } else {
                pluginOpts[opt] = true;
              }
            }
          }
        } catch {}
      }
      const slashIdx = hostPort.indexOf('/');
      if (slashIdx !== -1) hostPort = hostPort.slice(0, slashIdx);

      const decodedUserinfo = safeBase64Decode(userinfo) || userinfo;
      const colonIdx = decodedUserinfo.indexOf(':');
      if (colonIdx !== -1) {
        cipher = decodedUserinfo.slice(0, colonIdx);
        password = decodedUserinfo.slice(colonIdx + 1);
      }

      const lastColon = hostPort.lastIndexOf(':');
      if (lastColon !== -1) {
        server = hostPort.slice(0, lastColon).replace(/^\[|\]$/g, '');
        port = parseInt(hostPort.slice(lastColon + 1), 10);
      }
    } else {
      // Legacy format: ss://BASE64(method:password@host:port)
      const decoded = safeBase64Decode(encodedPart);
      const atIndex = decoded.lastIndexOf('@');
      if (atIndex !== -1) {
        const userInfo = decoded.slice(0, atIndex);
        let hostPort = decoded.slice(atIndex + 1);

        const queryIdx = hostPort.indexOf('?');
        if (queryIdx !== -1) hostPort = hostPort.slice(0, queryIdx);
        const slashIdx = hostPort.indexOf('/');
        if (slashIdx !== -1) hostPort = hostPort.slice(0, slashIdx);

        const colonIndex = userInfo.indexOf(':');
        if (colonIndex !== -1) {
          cipher = userInfo.slice(0, colonIndex);
          password = userInfo.slice(colonIndex + 1);
        }

        const lastColon = hostPort.lastIndexOf(':');
        if (lastColon !== -1) {
          server = hostPort.slice(0, lastColon).replace(/^\[|\]$/g, '');
          port = parseInt(hostPort.slice(lastColon + 1), 10);
        }
      }
    }

    if (!server || isNaN(port) || port <= 0 || port > 65535) return null;

    const nodeName = name || `${server}:${port}`;
    const country = detectCountry(nodeName);

    return {
      id: generateNodeId(server, port, 'ss', nodeName),
      name: nodeName,
      type: 'ss',
      server,
      port,
      cipher,
      password,
      plugin,
      pluginOpts,
      udp: true,
      country: country.name,
      countryCode: country.code,
      status: 'unknown',
      rawUri: uri,
    };
  } catch (e) {
    return null;
  }
}

export function parseHysteria2Uri(uri: string): ProxyNode | null {
  try {
    const cleanUri = uri.startsWith('hy2://') ? uri.replace('hy2://', 'hysteria2://') : uri;
    const url = new URL(cleanUri);
    const password = safeDecodeURIComponent(url.username || '');
    const server = url.hostname;
    const port = parseInt(url.port || '443', 10);
    if (!server || isNaN(port) || port <= 0 || port > 65535) return null;
    const name = safeDecodeURIComponent(url.hash ? url.hash.slice(1) : `${server}:${port}`);
    const params = url.searchParams;

    const sni = params.get('sni') || server;
    const skipCertVerify = params.get('insecure') === '1' || params.get('allowInsecure') === '1';
    const obfs = params.get('obfs') || undefined;
    const obfsPassword = params.get('obfs-password') || undefined;

    const country = detectCountry(name);

    return {
      id: generateNodeId(server, port, 'hysteria2', name),
      name,
      type: 'hysteria2',
      server,
      port,
      password,
      tls: true,
      sni,
      skipCertVerify,
      hy2Opts: {
        auth: password,
        obfs,
        obfsPassword,
      },
      country: country.name,
      countryCode: country.code,
      status: 'unknown',
      rawUri: uri,
    };
  } catch (e) {
    return null;
  }
}

export function parseAnytlsUri(uri: string): ProxyNode | null {
  try {
    const url = new URL(uri);
    const password = safeDecodeURIComponent(url.username || '');
    const server = url.hostname;
    const port = parseInt(url.port || '443', 10);
    if (!server || isNaN(port) || port <= 0 || port > 65535) return null;
    const name = safeDecodeURIComponent(url.hash ? url.hash.slice(1) : `${server}:${port}`);
    const params = url.searchParams;

    const sni = params.get('sni') || server;
    const skipCertVerify = params.get('insecure') === '1' || params.get('allowInsecure') === '1';
    const fingerprint = params.get('fp') || params.get('client-fingerprint') || undefined;
    const alpnStr = params.get('alpn');
    const alpn = alpnStr ? alpnStr.split(',') : undefined;

    const country = detectCountry(name);

    return {
      id: generateNodeId(server, port, 'anytls', name),
      name,
      type: 'anytls',
      server,
      port,
      password,
      tls: true,
      sni,
      skipCertVerify,
      fingerprint,
      alpn,
      country: country.name,
      countryCode: country.code,
      status: 'unknown',
      rawUri: uri,
    };
  } catch (e) {
    return null;
  }
}

export function parseUri(uri: string): ProxyNode | null {
  const trimmed = uri.trim();
  if (trimmed.startsWith('vless://')) return parseVlessUri(trimmed);
  if (trimmed.startsWith('vmess://')) return parseVmessUri(trimmed);
  if (trimmed.startsWith('trojan://')) return parseTrojanUri(trimmed);
  if (trimmed.startsWith('ss://')) return parseShadowsocksUri(trimmed);
  if (trimmed.startsWith('hysteria2://') || trimmed.startsWith('hy2://')) return parseHysteria2Uri(trimmed);
  if (trimmed.startsWith('anytls://')) return parseAnytlsUri(trimmed);
  return null;
}
