export type ProxyType =
  | 'vless'
  | 'vmess'
  | 'trojan'
  | 'ss'
  | 'hysteria2'
  | 'anytls'
  | 'socks5'
  | 'http'
  | 'wireguard';

/**
 * 编译期穷尽性检查辅助函数
 * 当在 switch (type) 分支中遗漏了某个 ProxyType 分支时，TypeScript 会在此处产生编译报错
 */
export function assertNever(value: never, message?: string): never {
  throw new Error(message || `未受支持或未穷尽的协议类型: ${JSON.stringify(value)}`);
}

export type NodeNetworkType = 'tcp' | 'ws' | 'grpc' | 'h2' | 'http';

export interface ProxyNode {
  id: string;
  subscriptionId?: string;
  subscriptionName?: string;
  name: string;
  type: ProxyType;
  server: string;
  port: number;
  
  // Auth & Keys
  uuid?: string;
  password?: string;
  cipher?: string;
  alterId?: number;
  
  // Transport & TLS
  network?: NodeNetworkType;
  tls?: boolean;
  sni?: string;
  alpn?: string[];
  fingerprint?: string;
  skipCertVerify?: boolean;
  flow?: string;
  
  // Reality
  reality?: {
    publicKey: string;
    shortId?: string;
    spiderX?: string;
  };
  
  // WS / gRPC
  wsOpts?: {
    path?: string;
    headers?: Record<string, string>;
  };
  grpcOpts?: {
    serviceName?: string;
  };
  
  // Hysteria2
  hy2Opts?: {
    auth?: string;
    upMbps?: number;
    downMbps?: number;
    obfs?: string;
    obfsPassword?: string;
  };

  // Shadowsocks Plugin (SIP003)
  plugin?: string;
  pluginOpts?: Record<string, any>;
  
  udp?: boolean;
  country?: string;
  countryCode?: string;
  
  // Health & Speed Status
  ping?: number; // ms, -1 for timeout
  lastCheckedAt?: string;
  status?: 'fast' | 'slow' | 'timeout' | 'unknown' | 'online';
  
  rawUri?: string;
}

export interface SubscriptionInfo {
  upload?: number;    // bytes
  download?: number;  // bytes
  total?: number;     // bytes
  expire?: number;    // unix timestamp (seconds)
}

export interface Subscription {
  id: string;
  name: string;
  url: string;
  customUserAgent?: string;
  autoUpdate: boolean;
  updateInterval: number; // minutes
  lastUpdatedAt?: string;
  upload?: number;
  download?: number;
  total?: number;
  expire?: number;
  nodeCount: number;
  status: 'active' | 'error' | 'disabled';
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RenameRule {
  pattern: string;
  replace: string;
}

export interface AggregateGroup {
  id: string;
  name: string;
  token: string;
  subscriptionIds: string[]; // empty means all active subscriptions
  filterKeywords: string[];
  excludeKeywords: string[];
  protocols: ProxyType[];
  renameRules: RenameRule[];
  deduplicate: boolean;
  filterOnlineOnly: boolean;
  maxPing?: number;
  targetFormat: 'clash' | 'singbox' | 'surge' | 'loon' | 'base64';
  clashTemplate?: 'default' | 'acl4ssr' | 'minimal';
  singboxTemplate?: 'default' | 'minimal';
  customRuleConfig?: string;
  enabled: boolean;
  accessCount?: number;
  lastAccessedAt?: string;
  lastAccessedIp?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccessLog {
  id: string;
  aggregateId: string;
  aggregateToken: string;
  ip: string;
  userAgent?: string;
  targetFormat?: string;
  nodeCount: number;
  accessedAt: string;
}

export interface SyncLog {
  id: string;
  subscriptionId: string;
  subscriptionName: string;
  triggerType: 'manual' | 'cron';
  status: 'success' | 'failed';
  httpStatus?: number;
  durationMs: number;
  nodeCount: number;
  nodeDiff?: number;
  skipped?: number;
  skippedDetail?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface PingResult {
  nodeId: string;
  ping: number; // in ms, -1 if timeout
  status: 'fast' | 'slow' | 'timeout' | 'online';
  checkedAt: string;
  error?: string;
}

export interface DashboardStats {
  totalSubscriptions: number;
  totalNodes: number;
  fastNodes: number;
  slowNodes: number;
  timeoutNodes: number;
  unknownNodes?: number;
  aliveNodes?: number;
  onlineNodes?: number; // compatibility alias for fastNodes
  totalTrafficUsed: number;
  totalTrafficQuota: number;
  countryDistribution: { country: string; code: string; count: number }[];
  protocolDistribution: { protocol: string; count: number }[];
}

export interface SystemCapabilities {
  platform: 'node' | 'cloudflare';
  features: {
    tcpPing: boolean;
    cronScheduler: boolean;
    d1Storage: boolean;
  };
}
