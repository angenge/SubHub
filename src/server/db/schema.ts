import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  customUserAgent: text('custom_user_agent'),
  autoUpdate: integer('auto_update', { mode: 'boolean' }).notNull().default(true),
  updateInterval: integer('update_interval').notNull().default(180), // default 3 hours
  lastUpdatedAt: text('last_updated_at'),
  upload: integer('upload').default(0),
  download: integer('download').default(0),
  total: integer('total').default(0),
  expire: integer('expire').default(0),
  nodeCount: integer('node_count').notNull().default(0),
  etag: text('etag'),
  lastModified: text('last_modified'),
  status: text('status', { enum: ['active', 'error', 'disabled'] }).notNull().default('active'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const nodes = sqliteTable('nodes', {
  id: text('id').primaryKey(),
  subscriptionId: text('subscription_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  server: text('server').notNull(),
  port: integer('port').notNull(),
  uuid: text('uuid'),
  password: text('password'),
  cipher: text('cipher'),
  alterId: integer('alter_id'),
  network: text('network'),
  tls: integer('tls', { mode: 'boolean' }).default(false),
  sni: text('sni'),
  alpn: text('alpn'), // JSON string array
  skipCertVerify: integer('skip_cert_verify', { mode: 'boolean' }).default(false),
  flow: text('flow'),
  reality: text('reality'), // JSON string
  wsOpts: text('ws_opts'), // JSON string
  grpcOpts: text('grpc_opts'), // JSON string
  hy2Opts: text('hy2_opts'), // JSON string
  udp: integer('udp', { mode: 'boolean' }).default(true),
  country: text('country'),
  countryCode: text('country_code'),
  ping: integer('ping'), // ms, -1 for timeout
  lastCheckedAt: text('last_checked_at'),
  status: text('status', { enum: ['online', 'slow', 'timeout', 'unknown'] }).default('unknown'),
  rawUri: text('raw_uri'),
  rawData: text('raw_data'), // JSON object for full fidelity
});

export const aggregates = sqliteTable('aggregates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  token: text('token').notNull().unique(),
  subscriptionIds: text('subscription_ids').notNull().default('[]'), // JSON array
  filterKeywords: text('filter_keywords').notNull().default('[]'), // JSON array
  excludeKeywords: text('exclude_keywords').notNull().default('[]'), // JSON array
  protocols: text('protocols').notNull().default('[]'), // JSON array
  renameRules: text('rename_rules').notNull().default('[]'), // JSON array
  deduplicate: integer('deduplicate', { mode: 'boolean' }).notNull().default(true),
  filterOnlineOnly: integer('filter_online_only', { mode: 'boolean' }).notNull().default(false),
  maxPing: integer('max_ping'),
  targetFormat: text('target_format').notNull().default('clash'),
  clashTemplate: text('clash_template').default('default'),
  singboxTemplate: text('singbox_template').default('default'),
  customRuleConfig: text('custom_rule_config'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  accessCount: integer('access_count').default(0),
  lastAccessedAt: text('last_accessed_at'),
  lastAccessedIp: text('last_accessed_ip'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const accessLogs = sqliteTable('access_logs', {
  id: text('id').primaryKey(),
  aggregateId: text('aggregate_id').notNull(),
  aggregateToken: text('aggregate_token').notNull(),
  ip: text('ip').notNull(),
  userAgent: text('user_agent'),
  targetFormat: text('target_format'),
  nodeCount: integer('node_count').notNull().default(0),
  accessedAt: text('accessed_at').notNull(),
});

export const syncLogs = sqliteTable('sync_logs', {
  id: text('id').primaryKey(),
  subscriptionId: text('subscription_id').notNull(),
  subscriptionName: text('subscription_name').notNull(),
  triggerType: text('trigger_type', { enum: ['manual', 'cron'] }).notNull().default('manual'),
  status: text('status', { enum: ['success', 'failed'] }).notNull().default('success'),
  httpStatus: integer('http_status'),
  durationMs: integer('duration_ms').notNull().default(0),
  nodeCount: integer('node_count').notNull().default(0),
  nodeDiff: integer('node_diff').default(0),
  errorMessage: text('error_message'),
  createdAt: text('created_at').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});
