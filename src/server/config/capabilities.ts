export interface SystemCapabilities {
  platform: 'node' | 'cloudflare';
  features: {
    tcpPing: boolean;
    cronScheduler: boolean;
    d1Storage: boolean;
  };
}

export function getSystemCapabilities(): SystemCapabilities {
  // Check if explicitly running on Cloudflare Workers or Node.js
  const isCloudflare = typeof (globalThis as any).WebSocketPair !== 'undefined' || process.env.CF_PAGES === '1';

  // Default: on VPS/Node.js, tcpPing defaults to TRUE unless explicitly disabled.
  // On Cloudflare Workers, tcpPing defaults to FALSE.
  let tcpPing = !isCloudflare;
  if (process.env.ENABLE_TCP_PING !== undefined) {
    tcpPing = process.env.ENABLE_TCP_PING === 'true' || process.env.ENABLE_TCP_PING === '1';
  }

  return {
    platform: isCloudflare ? 'cloudflare' : 'node',
    features: {
      tcpPing,
      cronScheduler: true,
      d1Storage: isCloudflare,
    },
  };
}
