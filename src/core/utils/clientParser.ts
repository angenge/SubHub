/**
 * Client User-Agent identification and device parser
 */

export interface ClientDeviceProfile {
  clientName: string;         // e.g. "Clash Verge", "Shadowrocket", "Sing-box", "Surge"
  clientCategory: 'clash' | 'shadowrocket' | 'singbox' | 'surge' | 'loon' | 'quantumult' | 'v2ray' | 'browser' | 'unknown';
  clientVersion?: string;     // e.g. "v1.7.0"
  osName: 'iOS' | 'macOS' | 'Windows' | 'Android' | 'Linux' | 'Unknown';
  osVersion?: string;
  iconType: 'apple' | 'windows' | 'android' | 'linux' | 'router' | 'generic';
  rawUA: string;
}

export interface ClientAccessSummary {
  clientId: string;           // Unique key (e.g. "Shadowrocket@iOS#1.2.3.4" or UA-hash)
  profile: ClientDeviceProfile;
  lastIp: string;
  lastTargetFormat: string;
  lastAccessedAt: string;
  accessCount: number;
  // Status: online (within 30 mins), active (within 24h), idle (>24h)
  status: 'online' | 'active' | 'idle';
}

export function parseUserAgent(ua?: string): ClientDeviceProfile {
  const rawUA = (ua || '').trim();
  if (!rawUA) {
    return {
      clientName: 'Unknown Client',
      clientCategory: 'unknown',
      osName: 'Unknown',
      iconType: 'generic',
      rawUA: '',
    };
  }

  const lower = rawUA.toLowerCase();

  // 1. Detect OS
  let osName: ClientDeviceProfile['osName'] = 'Unknown';
  let iconType: ClientDeviceProfile['iconType'] = 'generic';

  if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ios')) {
    osName = 'iOS';
    iconType = 'apple';
  } else if (lower.includes('macintosh') || lower.includes('mac os') || lower.includes('darwin')) {
    osName = 'macOS';
    iconType = 'apple';
  } else if (lower.includes('windows') || lower.includes('win64') || lower.includes('win32')) {
    osName = 'Windows';
    iconType = 'windows';
  } else if (lower.includes('android')) {
    osName = 'Android';
    iconType = 'android';
  } else if (lower.includes('linux') || lower.includes('openwrt') || lower.includes('lede')) {
    osName = 'Linux';
    iconType = lower.includes('openwrt') || lower.includes('lede') ? 'router' : 'linux';
  }

  // 2. Detect Client Software & Version
  let clientName = 'Custom Agent';
  let clientCategory: ClientDeviceProfile['clientCategory'] = 'unknown';
  let clientVersion: string | undefined;

  if (lower.includes('clash-verge')) {
    clientCategory = 'clash';
    const vMatch = rawUA.match(/clash-verge\/([^\s]+)/i);
    clientVersion = vMatch ? vMatch[1] : undefined;
    clientName = `Clash Verge${clientVersion ? ' ' + clientVersion : ''}`;
  } else if (lower.includes('clashmeta') || lower.includes('mihomo')) {
    clientCategory = 'clash';
    const vMatch = rawUA.match(/(?:clashmeta|mihomo)(?:\/|\s+)([^\s;)]+)/i);
    clientVersion = vMatch ? vMatch[1] : undefined;
    clientName = `Mihomo / Clash Meta${clientVersion ? ' ' + clientVersion : ''}`;
  } else if (lower.includes('clash')) {
    clientCategory = 'clash';
    const vMatch = rawUA.match(/clash(?:\/|\s+)([^\s;)]+)/i);
    clientVersion = vMatch ? vMatch[1] : undefined;
    clientName = `Clash${clientVersion ? ' ' + clientVersion : ''}`;
  } else if (lower.includes('shadowrocket')) {
    clientCategory = 'shadowrocket';
    const vMatch = rawUA.match(/shadowrocket\/([^\s]+)/i);
    clientVersion = vMatch ? vMatch[1] : undefined;
    clientName = `Shadowrocket${clientVersion ? ' ' + clientVersion : ''}`;
    if (osName === 'Unknown') osName = 'iOS';
    if (iconType === 'generic') iconType = 'apple';
  } else if (lower.includes('sing-box') || lower.includes('singbox') || lower.includes('sfm')) {
    clientCategory = 'singbox';
    const vMatch = rawUA.match(/(?:sing-box|singbox|sfm)\/([^\s]+)/i);
    clientVersion = vMatch ? vMatch[1] : undefined;
    clientName = `Sing-box${clientVersion ? ' ' + clientVersion : ''}`;
  } else if (lower.includes('surge')) {
    clientCategory = 'surge';
    const vMatch = rawUA.match(/surge(?:\/|\s+)([^\s;)]+)/i);
    clientVersion = vMatch ? vMatch[1] : undefined;
    clientName = `Surge${clientVersion ? ' ' + clientVersion : ''}`;
    if (osName === 'Unknown') osName = 'iOS';
    if (iconType === 'generic') iconType = 'apple';
  } else if (lower.includes('loon')) {
    clientCategory = 'loon';
    const vMatch = rawUA.match(/loon\/([^\s]+)/i);
    clientVersion = vMatch ? vMatch[1] : undefined;
    clientName = `Loon${clientVersion ? ' ' + clientVersion : ''}`;
    if (osName === 'Unknown') osName = 'iOS';
    if (iconType === 'generic') iconType = 'apple';
  } else if (lower.includes('quantumult')) {
    clientCategory = 'quantumult';
    const vMatch = rawUA.match(/quantumult(?:%20|\s*)x?\/([^\s]+)/i);
    clientVersion = vMatch ? vMatch[1] : undefined;
    clientName = `Quantumult X${clientVersion ? ' ' + clientVersion : ''}`;
    if (osName === 'Unknown') osName = 'iOS';
    if (iconType === 'generic') iconType = 'apple';
  } else if (lower.includes('v2rayn') || lower.includes('v2rayng') || lower.includes('v2ray')) {
    clientCategory = 'v2ray';
    const vMatch = rawUA.match(/(?:v2rayn|v2rayng|v2ray)\/([^\s]+)/i);
    clientVersion = vMatch ? vMatch[1] : undefined;
    if (lower.includes('v2rayng')) {
      clientName = `v2rayNG${clientVersion ? ' ' + clientVersion : ''}`;
      if (osName === 'Unknown') osName = 'Android';
      if (iconType === 'generic') iconType = 'android';
    } else if (lower.includes('v2rayn')) {
      clientName = `v2rayN${clientVersion ? ' ' + clientVersion : ''}`;
      if (osName === 'Unknown') osName = 'Windows';
      if (iconType === 'generic') iconType = 'windows';
    } else {
      clientName = `V2Ray Client${clientVersion ? ' ' + clientVersion : ''}`;
    }
  } else if (lower.includes('stash')) {
    clientCategory = 'clash';
    const vMatch = rawUA.match(/stash\/([^\s]+)/i);
    clientVersion = vMatch ? vMatch[1] : undefined;
    clientName = `Stash${clientVersion ? ' ' + clientVersion : ''}`;
    if (osName === 'Unknown') osName = 'iOS';
    if (iconType === 'generic') iconType = 'apple';
  } else if (lower.includes('mozilla') || lower.includes('chrome') || lower.includes('safari')) {
    clientCategory = 'browser';
    clientName = 'Web Browser';
  } else if (lower.includes('curl') || lower.includes('wget')) {
    clientName = rawUA.split('/')[0] || 'CLI Tool';
  }

  return {
    clientName,
    clientCategory,
    clientVersion,
    osName,
    iconType,
    rawUA,
  };
}

/**
 * Summarize access logs into aggregated client devices
 */
export function summarizeClientDevices(logs: Array<{
  ip: string;
  userAgent?: string;
  targetFormat?: string;
  accessedAt: string;
}>): ClientAccessSummary[] {
  const deviceMap = new Map<string, {
    profile: ClientDeviceProfile;
    lastIp: string;
    lastTargetFormat: string;
    lastAccessedAt: string;
    accessCount: number;
  }>();

  const now = Date.now();
  const THIRTY_MINUTES_MS = 30 * 60 * 1000;
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  for (const log of logs) {
    const profile = parseUserAgent(log.userAgent);
    // Key by clientCategory + osName + ip to group unique instances accurately
    const key = `${profile.clientCategory}_${profile.osName}_${log.ip}`;

    const existing = deviceMap.get(key);
    if (!existing) {
      deviceMap.set(key, {
        profile,
        lastIp: log.ip,
        lastTargetFormat: log.targetFormat || 'clash',
        lastAccessedAt: log.accessedAt,
        accessCount: 1,
      });
    } else {
      existing.accessCount += 1;
      // If this log is newer, update timestamp and ip
      if (new Date(log.accessedAt).getTime() > new Date(existing.lastAccessedAt).getTime()) {
        existing.lastAccessedAt = log.accessedAt;
        existing.lastIp = log.ip;
        if (log.targetFormat) existing.lastTargetFormat = log.targetFormat;
      }
    }
  }

  const summaries: ClientAccessSummary[] = [];

  for (const [clientId, item] of deviceMap.entries()) {
    const accessTime = new Date(item.lastAccessedAt).getTime();
    const diff = now - accessTime;

    let status: ClientAccessSummary['status'] = 'idle';
    if (diff <= THIRTY_MINUTES_MS) {
      status = 'online';
    } else if (diff <= TWENTY_FOUR_HOURS_MS) {
      status = 'active';
    }

    summaries.push({
      clientId,
      profile: item.profile,
      lastIp: item.lastIp,
      lastTargetFormat: item.lastTargetFormat,
      lastAccessedAt: item.lastAccessedAt,
      accessCount: item.accessCount,
      status,
    });
  }

  // Sort by most recently accessed first
  summaries.sort((a, b) => new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime());

  return summaries;
}
