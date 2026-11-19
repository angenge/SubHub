/**
 * Backup document format (pure logic, no database access).
 *
 * A backup only contains data that cannot be rebuilt automatically:
 *   - subscriptions  (source of truth, contains the airport credentials)
 *   - aggregates     (rules + distribution tokens)
 *   - a small whitelist of settings
 *
 * Nodes, access logs and sync logs are derived/history data and are excluded.
 * Authentication material (password hash, session secret) is NEVER exported.
 *
 * Keeping this module free of `node:*` imports lets the very same validation
 * run on Node.js (Docker) and Cloudflare Workers (D1).
 */

export const BACKUP_FORMAT = 'subhub-backup';
export const BACKUP_VERSION = 1;

/** 5 MB is roughly 100x a realistic backup, but caps pathological uploads. */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export const MAX_BACKUP_RECORDS = 500;
export const MAX_BACKUP_SETTINGS = 50;

/**
 * Settings that are safe and useful to carry across machines.
 * Everything else is dropped, which means a future sensitive key is excluded
 * by default instead of leaking by accident.
 */
export const BACKUP_SETTING_KEYS = [
  'clash_api_secret',
  'dashboard_connection_config',
  'agent_probe_secret',
] as const;

export type BackupSettingKey = (typeof BACKUP_SETTING_KEYS)[number];

/** Keys that must never leave the machine; used for user-facing warnings. */
export const SENSITIVE_SETTING_KEYS = ['admin_auth', 'session_secret', 'agent_probe_heartbeat'];

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

export interface BackupSetting {
  key: string;
  value: string;
  updatedAt: string;
}

export interface BackupAppInfo {
  version: string;
  build: string;
  platform: string;
}

export interface BackupCounts {
  subscriptions: number;
  aggregates: number;
  settings: number;
}

export interface BackupDocument {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  app: BackupAppInfo;
  counts: BackupCounts;
  data: {
    subscriptions: Record<string, unknown>[];
    aggregates: Record<string, unknown>[];
    settings: BackupSetting[];
  };
}

export interface ParsedBackup {
  document: BackupDocument;
  warnings: string[];
}

type Row = Record<string, unknown>;

interface FieldSpec {
  kind: 'string' | 'nullable-string' | 'number' | 'nullable-number' | 'boolean' | 'json';
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  fallback?: string | number | boolean | null;
  allowed?: readonly string[];
}

function fail(message: string): never {
  throw new BackupValidationError(message);
}

function isPlainObject(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceString(
  raw: unknown,
  label: string,
  spec: FieldSpec,
  nowIso: string
): string | null {
  if (raw === undefined || raw === null || raw === '') {
    if (spec.required) fail(`${label} 不能为空`);
    if (spec.fallback === null || spec.fallback === undefined) return null;
    return String(spec.fallback);
  }
  if (typeof raw !== 'string') fail(`${label} 必须是字符串`);
  const value = raw.trim();
  if (spec.required && !value) fail(`${label} 不能为空`);
  if (value.length > (spec.maxLength ?? 4000)) {
    fail(`${label} 长度超过 ${spec.maxLength ?? 4000} 个字符`);
  }
  if (spec.allowed && value && !spec.allowed.includes(value)) {
    fail(`${label} 的取值 “${value}” 不受支持`);
  }
  return value;
}

function coerceNumber(raw: unknown, label: string, spec: FieldSpec): number | null {
  if (raw === undefined || raw === null || raw === '') {
    if (spec.fallback === null || spec.fallback === undefined) return null;
    return Number(spec.fallback);
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) fail(`${label} 必须是数字`);
  let value = Math.trunc(raw);
  if (spec.min !== undefined && value < spec.min) value = spec.min;
  if (spec.max !== undefined && value > spec.max) value = spec.max;
  return value;
}

function coerceBoolean(raw: unknown, label: string, spec: FieldSpec): boolean {
  if (raw === undefined || raw === null) {
    return spec.fallback === undefined ? false : Boolean(spec.fallback);
  }
  if (typeof raw === 'boolean') return raw;
  if (raw === 0 || raw === 1) return raw === 1;
  if (raw === 'true' || raw === 'false') return raw === 'true';
  fail(`${label} 必须是布尔值`);
}

function coerceJsonString(raw: unknown, label: string, spec: FieldSpec): string {
  if (raw === undefined || raw === null || raw === '') return String(spec.fallback ?? '[]');
  if (typeof raw === 'string') {
    try {
      JSON.parse(raw);
    } catch {
      fail(`${label} 不是合法的 JSON 字符串`);
    }
    return raw;
  }
  if (Array.isArray(raw) || isPlainObject(raw)) return JSON.stringify(raw);
  fail(`${label} 必须是 JSON 字符串、数组或对象`);
}

const SUBSCRIPTION_FIELDS: Record<string, FieldSpec> = {
  id: { kind: 'string', required: true, maxLength: 64 },
  name: { kind: 'string', required: true, maxLength: 200 },
  url: { kind: 'string', required: true, maxLength: 4000 },
  customUserAgent: { kind: 'nullable-string', maxLength: 512, fallback: null },
  autoUpdate: { kind: 'boolean', fallback: true },
  updateInterval: { kind: 'number', min: 1, max: 10080, fallback: 180 },
  lastUpdatedAt: { kind: 'nullable-string', maxLength: 40, fallback: null },
  upload: { kind: 'nullable-number', min: 0, fallback: 0 },
  download: { kind: 'nullable-number', min: 0, fallback: 0 },
  total: { kind: 'nullable-number', min: 0, fallback: 0 },
  expire: { kind: 'nullable-number', min: 0, fallback: 0 },
  nodeCount: { kind: 'number', min: 0, fallback: 0 },
  etag: { kind: 'nullable-string', maxLength: 512, fallback: null },
  lastModified: { kind: 'nullable-string', maxLength: 128, fallback: null },
  status: { kind: 'string', maxLength: 16, fallback: 'active', allowed: ['active', 'error', 'disabled'] },
  errorMessage: { kind: 'nullable-string', maxLength: 2000, fallback: null },
  createdAt: { kind: 'string', maxLength: 40 },
  updatedAt: { kind: 'string', maxLength: 40 },
};

const AGGREGATE_FIELDS: Record<string, FieldSpec> = {
  id: { kind: 'string', required: true, maxLength: 64 },
  name: { kind: 'string', required: true, maxLength: 200 },
  token: { kind: 'string', required: true, maxLength: 128 },
  subscriptionIds: { kind: 'json', fallback: '[]' },
  filterKeywords: { kind: 'json', fallback: '[]' },
  excludeKeywords: { kind: 'json', fallback: '[]' },
  protocols: { kind: 'json', fallback: '[]' },
  renameRules: { kind: 'json', fallback: '[]' },
  deduplicate: { kind: 'boolean', fallback: true },
  filterOnlineOnly: { kind: 'boolean', fallback: false },
  maxPing: { kind: 'nullable-number', min: 0, max: 60000, fallback: null },
  targetFormat: { kind: 'string', maxLength: 32, fallback: 'clash' },
  clashTemplate: { kind: 'nullable-string', maxLength: 64, fallback: 'default' },
  singboxTemplate: { kind: 'nullable-string', maxLength: 64, fallback: 'default' },
  customRuleConfig: { kind: 'nullable-string', maxLength: 20000, fallback: null },
  enabled: { kind: 'boolean', fallback: true },
  accessCount: { kind: 'number', min: 0, fallback: 0 },
  lastAccessedAt: { kind: 'nullable-string', maxLength: 40, fallback: null },
  lastAccessedIp: { kind: 'nullable-string', maxLength: 64, fallback: null },
  createdAt: { kind: 'string', maxLength: 40 },
  updatedAt: { kind: 'string', maxLength: 40 },
};

function sanitizeRow(
  raw: unknown,
  fields: Record<string, FieldSpec>,
  tableLabel: string,
  index: number,
  nowIso: string
): Row {
  if (!isPlainObject(raw)) fail(`${tableLabel} 第 ${index + 1} 条记录格式不正确`);
  const row: Row = {};

  for (const [field, spec] of Object.entries(fields)) {
    const label = `${tableLabel} 第 ${index + 1} 条的 ${field}`;
    const value = raw[field];
    switch (spec.kind) {
      case 'string':
      case 'nullable-string': {
        const coerced = coerceString(value, label, spec, nowIso);
        row[field] = coerced === null ? null : coerced;
        break;
      }
      case 'number':
      case 'nullable-number':
        row[field] = coerceNumber(value, label, spec);
        break;
      case 'boolean':
        row[field] = coerceBoolean(value, label, spec);
        break;
      case 'json':
        row[field] = coerceJsonString(value, label, spec);
        break;
    }
  }

  if (!row.createdAt) row.createdAt = nowIso;
  if (!row.updatedAt) row.updatedAt = row.createdAt;
  return row;
}

function assertHttpUrl(url: unknown, label: string): void {
  if (typeof url !== 'string' || !url) fail(`${label} 不能为空`);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail(`${label} 不是合法的 URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    fail(`${label} 只支持 http/https 协议`);
  }
}

function assertUniqueIds(rows: Row[], label: string): void {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const id = String(row.id);
    if (seen.has(id)) {
      fail(`${label} 第 ${index + 1} 条的 id 与前面的记录重复（${id}）`);
    }
    seen.add(id);
  });
}

function sanitizeSettings(raw: unknown, warnings: string[]): BackupSetting[] {  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) fail('备份中的 data.settings 必须是数组');
  if (raw.length > MAX_BACKUP_SETTINGS) {
    fail(`备份中的设置项超过上限（${MAX_BACKUP_SETTINGS} 项）`);
  }

  const allowed = new Set<string>(BACKUP_SETTING_KEYS);
  const seen = new Set<string>();
  const settings: BackupSetting[] = [];
  const nowIso = new Date().toISOString();

  raw.forEach((item, index) => {
    if (!isPlainObject(item)) fail(`设置项第 ${index + 1} 条记录格式不正确`);
    const key = item.key;
    if (typeof key !== 'string' || !key) fail(`设置项第 ${index + 1} 条缺少 key`);
    if (!allowed.has(key)) {
      if (SENSITIVE_SETTING_KEYS.includes(key)) {
        warnings.push(`已忽略认证/运行时数据 “${key}”，该数据永远不会被导入`);
      } else {
        warnings.push(`已忽略不受支持的设置项 “${key}”`);
      }
      return;
    }
    if (seen.has(key)) {
      warnings.push(`设置项 “${key}” 重复出现，仅保留第一条`);
      return;
    }
    const value = item.value;
    if (typeof value !== 'string') fail(`设置项 “${key}” 的 value 必须是字符串`);
    if (value.length > 100000) fail(`设置项 “${key}” 的内容过大`);

    const updatedAt =
      typeof item.updatedAt === 'string' && item.updatedAt.trim()
        ? item.updatedAt.trim()
        : nowIso;

    seen.add(key);
    settings.push({ key, value, updatedAt });
  });

  return settings;
}

export interface CreateBackupInput {
  app: Partial<BackupAppInfo>;
  subscriptions: unknown[];
  aggregates: unknown[];
  settings: unknown[];
  exportedAt?: string;
}

/**
 * Build a validated backup document from database rows.
 * Aggregates have their `lastAccessedIp` blanked: it is client PII and is not
 * needed to restore functionality.
 */
export function createBackupDocument(input: CreateBackupInput): BackupDocument {
  const nowIso = input.exportedAt || new Date().toISOString();

  const subscriptions = input.subscriptions.map((row, index) =>
    sanitizeRow(row, SUBSCRIPTION_FIELDS, '订阅源', index, nowIso)
  );

  const aggregates = input.aggregates.map((row, index) => {
    const sanitized = sanitizeRow(row, AGGREGATE_FIELDS, '聚合规则', index, nowIso);
    sanitized.lastAccessedIp = null;
    return sanitized;
  });

  // Unknown/unsupported settings are dropped silently on export: the local
  // database may legitimately contain keys this version does not know about.
  const settings = sanitizeSettings(input.settings, []);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: nowIso,
    app: {
      version: String(input.app.version ?? 'unknown'),
      build: String(input.app.build ?? 'dev'),
      platform: String(input.app.platform ?? 'unknown'),
    },
    counts: {
      subscriptions: subscriptions.length,
      aggregates: aggregates.length,
      settings: settings.length,
    },
    data: { subscriptions, aggregates, settings },
  };
}

export function serializeBackup(document: BackupDocument): string {
  return JSON.stringify(document, null, 2);
}

function assertRecordArray(raw: unknown, label: string): unknown[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) fail(`${label} 必须是数组`);
  if (raw.length > MAX_BACKUP_RECORDS) {
    fail(`${label} 数量超过上限（${MAX_BACKUP_RECORDS} 条）`);
  }
  return raw;
}

/**
 * Validate and normalise an uploaded backup.
 * Throws BackupValidationError for anything a user can fix by picking another
 * file; callers translate that into HTTP 400 and write nothing.
 */
export function parseBackup(raw: string): ParsedBackup {
  if (typeof raw !== 'string' || !raw.trim()) {
    fail('备份文件内容为空');
  }
  if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) {
    fail(`备份文件超过大小上限（${Math.round(MAX_BACKUP_BYTES / 1024 / 1024)} MB）`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail('备份文件不是合法的 JSON（可能已损坏或被截断）');
  }

  if (!isPlainObject(parsed)) fail('备份文件的顶层结构必须是对象');
  if (parsed.format !== BACKUP_FORMAT) {
    fail(`不是 SubHub 备份文件（format=${String(parsed.format)}）`);
  }

  const version = parsed.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    fail('备份文件的 version 字段无效');
  }
  if (version > BACKUP_VERSION) {
    fail(`该备份由更新版本的 SubHub 导出（version ${version}），请先升级后再导入`);
  }

  const data = parsed.data;
  if (!isPlainObject(data)) fail('备份文件缺少 data 字段');

  const nowIso = new Date().toISOString();
  const warnings: string[] = [];

  const subscriptions = assertRecordArray(data.subscriptions, 'data.subscriptions').map(
    (row, index) => {
      const sanitized = sanitizeRow(row, SUBSCRIPTION_FIELDS, '订阅源', index, nowIso);
      assertHttpUrl(sanitized.url, `订阅源第 ${index + 1} 条的 url`);
      return sanitized;
    }
  );

  const aggregates = assertRecordArray(data.aggregates, 'data.aggregates').map((row, index) =>
    sanitizeRow(row, AGGREGATE_FIELDS, '聚合规则', index, nowIso)
  );

  assertUniqueIds(subscriptions, '订阅源');
  assertUniqueIds(aggregates, '聚合规则');

  const settings = sanitizeSettings(data.settings, warnings);

  const exportedAt =
    typeof parsed.exportedAt === 'string' && parsed.exportedAt.trim()
      ? parsed.exportedAt.trim()
      : nowIso;

  const app = isPlainObject(parsed.app) ? parsed.app : {};

  return {
    document: {
      format: BACKUP_FORMAT,
      version,
      exportedAt,
      app: {
        version: typeof app.version === 'string' ? app.version : 'unknown',
        build: typeof app.build === 'string' ? app.build : 'unknown',
        platform: typeof app.platform === 'string' ? app.platform : 'unknown',
      },
      counts: {
        subscriptions: subscriptions.length,
        aggregates: aggregates.length,
        settings: settings.length,
      },
      data: { subscriptions, aggregates, settings },
    },
    warnings,
  };
}
