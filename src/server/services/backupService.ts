import crypto from 'node:crypto';
import { db, schema, getRawSqlite } from '../db/index.js';
import { APP_VERSION } from '../../core/version.js';
import {
  BackupDocument,
  createBackupDocument,
  parseBackup,
  serializeBackup,
} from '../../core/backup/format.js';

export type BackupImportMode = 'merge' | 'replace';

export interface BackupImportResult {
  mode: BackupImportMode;
  platform: 'node' | 'cloudflare';
  imported: { subscriptions: number; aggregates: number; settings: number };
  skipped: { subscriptions: number; aggregates: number; settings: number };
  renamed: Array<{ type: 'subscription' | 'aggregate'; from: string; to: string }>;
  regeneratedTokens: Array<{ name: string; reason: string }>;
  warnings: string[];
  /** Only possible on D1, where interactive transactions do not exist. */
  partial?: boolean;
  failed?: number;
  durationMs: number;
}

export interface BackupExportResult {
  filename: string;
  body: string;
  counts: { subscriptions: number; aggregates: number; settings: number };
}

interface ImportPlan {
  subscriptions: Record<string, unknown>[];
  aggregates: Record<string, unknown>[];
  settings: Array<{ key: string; value: string; updatedAt: string }>;
  skipped: { subscriptions: number; aggregates: number; settings: number };
  renamed: Array<{ type: 'subscription' | 'aggregate'; from: string; to: string }>;
  regeneratedTokens: Array<{ name: string; reason: string }>;
}

function emptyPlan(): ImportPlan {
  return {
    subscriptions: [],
    aggregates: [],
    settings: [],
    skipped: { subscriptions: 0, aggregates: 0, settings: 0 },
    renamed: [],
    regeneratedTokens: [],
  };
}

function backupFilename(now = new Date()): string {
  const stamp = now.toISOString().replace(/\.\d+Z$/, '').replace(/[-:]/g, '').replace('T', '-');
  return `subhub-backup-${stamp}.json`;
}

function currentBuild(): string {
  try {
    return (typeof process !== 'undefined' && process.env?.SUBHUB_BUILD_ID) || 'dev';
  } catch {
    return 'dev';
  }
}

function uniqueName(desired: string, takenLowerNames: Set<string>): string {
  let counter = 2;
  let candidate = `${desired} (${counter})`;
  while (takenLowerNames.has(candidate.trim().toLowerCase())) {
    counter += 1;
    candidate = `${desired} (${counter})`;
  }
  return candidate;
}

export async function exportBackup(): Promise<BackupExportResult> {
  const [subscriptions, aggregates, settings] = await Promise.all([
    db.select().from(schema.subscriptions),
    db.select().from(schema.aggregates),
    db.select().from(schema.settings),
  ]);

  const document = createBackupDocument({
    app: {
      version: APP_VERSION,
      build: currentBuild(),
      platform: getRawSqlite() ? 'node' : 'cloudflare',
    },
    subscriptions,
    aggregates,
    settings,
  });

  return {
    filename: backupFilename(),
    body: serializeBackup(document),
    counts: document.counts,
  };
}

async function buildMergePlan(document: BackupDocument): Promise<ImportPlan> {
  const [existingSubs, existingAggs, existingSettings] = await Promise.all([
    db.select({ id: schema.subscriptions.id, name: schema.subscriptions.name, url: schema.subscriptions.url }).from(schema.subscriptions),
    db.select({ id: schema.aggregates.id, name: schema.aggregates.name, token: schema.aggregates.token }).from(schema.aggregates),
    db.select({ key: schema.settings.key }).from(schema.settings),
  ]);

  const takenSubIds = new Set<string>(existingSubs.map((row: any) => String(row.id)));
  const takenSubUrls = new Set<string>(existingSubs.map((row: any) => String(row.url || '').trim().toLowerCase()));
  const takenSubNames = new Set<string>(existingSubs.map((row: any) => String(row.name || '').trim().toLowerCase()));
  const takenAggIds = new Set<string>(existingAggs.map((row: any) => String(row.id)));
  const takenAggNames = new Set<string>(existingAggs.map((row: any) => String(row.name || '').trim().toLowerCase()));
  const takenAggTokens = new Set<string>(existingAggs.map((row: any) => String(row.token)));
  const existingSettingKeys = new Set<string>(existingSettings.map((row: any) => String(row.key)));

  const plan = emptyPlan();
  const subIdRemap = new Map<string, string>();
  const existingSubByUrl = new Map<string, any>();
  for (const row of existingSubs as any[]) {
    existingSubByUrl.set(String(row.url || '').trim().toLowerCase(), row);
  }

  for (const raw of document.data.subscriptions) {
    const id = String(raw.id);
    const url = String(raw.url).trim().toLowerCase();

    // Never create duplicates: the app itself rejects duplicate URLs, and a
    // merge is meant to be idempotent when the same file is imported twice.
    if (takenSubIds.has(id)) {
      plan.skipped.subscriptions += 1;
      continue;
    }
    if (takenSubUrls.has(url)) {
      plan.skipped.subscriptions += 1;
      // Same URL but a different local id: remember the mapping so aggregates
      // from the backup keep pointing at a subscription that actually exists.
      const existing = existingSubByUrl.get(url);
      if (existing) subIdRemap.set(id, String(existing.id));
      continue;
    }

    let row = { ...raw };
    let name = String(row.name).trim();
    if (takenSubNames.has(name.toLowerCase())) {
      const renamed = uniqueName(name, takenSubNames);
      plan.renamed.push({ type: 'subscription', from: name, to: renamed });
      row = { ...row, name: renamed };
      name = renamed;
    }

    takenSubIds.add(id);
    takenSubUrls.add(url);
    takenSubNames.add(name.toLowerCase());
    plan.subscriptions.push(row);
  }

  for (const raw of document.data.aggregates) {
    const id = String(raw.id);
    if (takenAggIds.has(id)) {
      plan.skipped.aggregates += 1;
      continue;
    }

    const name = String(raw.name).trim();
    if (takenAggNames.has(name.toLowerCase())) {
      plan.skipped.aggregates += 1;
      continue;
    }

    let row = { ...raw };

    if (subIdRemap.size > 0 && typeof row.subscriptionIds === 'string') {
      try {
        const referenced = JSON.parse(row.subscriptionIds);
        if (Array.isArray(referenced)) {
          row.subscriptionIds = JSON.stringify(
            referenced.map((value) => subIdRemap.get(String(value)) ?? value)
          );
        }
      } catch {
        // Already validated by parseBackup; never let remapping break an import.
      }
    }

    let token = String(row.token);
    if (takenAggTokens.has(token)) {      const regenerated = crypto.randomBytes(16).toString('hex');
      plan.regeneratedTokens.push({
        name,
        reason: 'token 与现有聚合规则冲突，已生成新的分发链接',
      });
      row = { ...row, token: regenerated };
      token = regenerated;
    }

    takenAggIds.add(id);
    takenAggNames.add(name.toLowerCase());
    takenAggTokens.add(token);
    plan.aggregates.push(row);
  }

  for (const setting of document.data.settings) {
    if (existingSettingKeys.has(setting.key)) {
      plan.skipped.settings += 1;
      continue;
    }
    existingSettingKeys.add(setting.key);
    plan.settings.push(setting);
  }

  return plan;
}

function buildReplacePlan(document: BackupDocument): ImportPlan {
  const plan = emptyPlan();
  plan.subscriptions = document.data.subscriptions.map((row) => ({ ...row }));
  plan.aggregates = document.data.aggregates.map((row) => ({ ...row }));
  plan.settings = document.data.settings.map((row) => ({ ...row }));
  return plan;
}

type StatementKind = 'delete' | 'subscription' | 'aggregate' | 'setting';

interface PlannedStatement {
  query: any;
  kind: StatementKind;
}

function buildStatements(plan: ImportPlan, mode: BackupImportMode): PlannedStatement[] {
  const statements: PlannedStatement[] = [];

  if (mode === 'replace') {
    // Derived data must go too, otherwise nodes keep pointing at deleted
    // subscriptions and log pages show entries that no longer resolve.
    statements.push({ kind: 'delete', query: db.delete(schema.accessLogs) });
    statements.push({ kind: 'delete', query: db.delete(schema.syncLogs) });
    statements.push({ kind: 'delete', query: db.delete(schema.nodes) });
    statements.push({ kind: 'delete', query: db.delete(schema.aggregates) });
    statements.push({ kind: 'delete', query: db.delete(schema.subscriptions) });
  }

  for (const row of plan.subscriptions) {
    statements.push({
      kind: 'subscription',
      query: db.insert(schema.subscriptions).values(row as any).onConflictDoNothing(),
    });
  }
  for (const row of plan.aggregates) {
    statements.push({
      kind: 'aggregate',
      query: db.insert(schema.aggregates).values(row as any).onConflictDoNothing(),
    });
  }
  for (const row of plan.settings) {
    const query =
      mode === 'replace'
        ? db
            .insert(schema.settings)
            .values(row)
            .onConflictDoUpdate({
              target: schema.settings.key,
              set: { value: row.value, updatedAt: row.updatedAt },
            })
        : db.insert(schema.settings).values(row).onConflictDoNothing();
    statements.push({ kind: 'setting', query });
  }

  return statements;
}

function runNodeImport(plan: ImportPlan, mode: BackupImportMode, sqlite: any): void {
  const statements = buildStatements(plan, mode);

  const execute = sqlite.transaction(() => {
    for (const statement of statements) {
      statement.query.run();
    }
  });

  execute();
}

const D1_BATCH_SIZE = 30;

async function runD1Import(
  plan: ImportPlan,
  mode: BackupImportMode
): Promise<{
  imported: { subscriptions: number; aggregates: number; settings: number };
  partial: boolean;
  failed: number;
  warnings: string[];
}> {
  const statements = buildStatements(plan, mode);
  const imported = { subscriptions: 0, aggregates: 0, settings: 0 };
  const warnings: string[] = [];
  let failed = 0;

  for (let offset = 0; offset < statements.length; offset += D1_BATCH_SIZE) {
    const batch = statements.slice(offset, offset + D1_BATCH_SIZE);
    try {
      await db.batch(batch.map((statement) => statement.query));
    } catch (err: any) {
      const message = err?.message || String(err);
      if (offset === 0) {
        // The delete + first inserts share one batch, so nothing changed yet.
        throw new Error(`导入失败，数据库未做任何修改：${message}`);
      }
      failed = batch.length;
      warnings.push(
        `第 ${Math.floor(offset / D1_BATCH_SIZE) + 1} 批写入失败（${message}），` +
          '已写入的数据保持有效，请检查后重新导入或改用覆盖模式。'
      );
      return { imported, partial: true, failed, warnings };
    }

    for (const statement of batch) {
      if (statement.kind === 'subscription') imported.subscriptions += 1;
      else if (statement.kind === 'aggregate') imported.aggregates += 1;
      else if (statement.kind === 'setting') imported.settings += 1;
    }
  }

  return { imported, partial: false, failed, warnings };
}

export async function importBackup(
  raw: string,
  mode: BackupImportMode = 'merge'
): Promise<BackupImportResult> {
  const startedAt = Date.now();
  const { document, warnings } = parseBackup(raw);
  const rawSqlite = getRawSqlite();
  const platform: 'node' | 'cloudflare' = rawSqlite ? 'node' : 'cloudflare';

  const plan =
    mode === 'merge' ? await buildMergePlan(document) : buildReplacePlan(document);

  const skipped = mode === 'merge' ? plan.skipped : { subscriptions: 0, aggregates: 0, settings: 0 };

  if (rawSqlite) {
    runNodeImport(plan, mode, rawSqlite);
    return {
      mode,
      platform,
      imported: {
        subscriptions: plan.subscriptions.length,
        aggregates: plan.aggregates.length,
        settings: plan.settings.length,
      },
      skipped,
      renamed: plan.renamed,
      regeneratedTokens: plan.regeneratedTokens,
      warnings,
      durationMs: Date.now() - startedAt,
    };
  }

  const d1Result = await runD1Import(plan, mode);
  return {
    mode,
    platform,
    imported: d1Result.imported,
    skipped,
    renamed: plan.renamed,
    regeneratedTokens: plan.regeneratedTokens,
    warnings: [...warnings, ...d1Result.warnings],
    partial: d1Result.partial || undefined,
    failed: d1Result.failed || undefined,
    durationMs: Date.now() - startedAt,
  };
}
