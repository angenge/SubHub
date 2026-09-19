import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import path from 'path';
import fs from 'fs';

export function initNodeDatabase() {
  const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const dbPath = path.join(DATA_DIR, 'subhub.db');
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');

  // Ensure tables exist on startup
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      custom_user_agent TEXT,
      auto_update INTEGER NOT NULL DEFAULT 1,
      update_interval INTEGER NOT NULL DEFAULT 180,
      last_updated_at TEXT,
      upload INTEGER DEFAULT 0,
      download INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      expire INTEGER DEFAULT 0,
      node_count INTEGER NOT NULL DEFAULT 0,
      etag TEXT,
      last_modified TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      server TEXT NOT NULL,
      port INTEGER NOT NULL,
      uuid TEXT,
      password TEXT,
      cipher TEXT,
      alter_id INTEGER,
      network TEXT,
      tls INTEGER DEFAULT 0,
      sni TEXT,
      alpn TEXT,
      skip_cert_verify INTEGER DEFAULT 0,
      flow TEXT,
      reality TEXT,
      ws_opts TEXT,
      grpc_opts TEXT,
      hy2_opts TEXT,
      udp INTEGER DEFAULT 1,
      country TEXT,
      country_code TEXT,
      ping INTEGER,
      last_checked_at TEXT,
      status TEXT DEFAULT 'unknown',
      raw_uri TEXT,
      raw_data TEXT
    );

    CREATE TABLE IF NOT EXISTS aggregates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      subscription_ids TEXT NOT NULL DEFAULT '[]',
      filter_keywords TEXT NOT NULL DEFAULT '[]',
      exclude_keywords TEXT NOT NULL DEFAULT '[]',
      protocols TEXT NOT NULL DEFAULT '[]',
      rename_rules TEXT NOT NULL DEFAULT '[]',
      deduplicate INTEGER NOT NULL DEFAULT 1,
      filter_online_only INTEGER NOT NULL DEFAULT 0,
      max_ping INTEGER,
      target_format TEXT NOT NULL DEFAULT 'clash',
      clash_template TEXT DEFAULT 'default',
      singbox_template TEXT DEFAULT 'default',
      custom_rule_config TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      access_count INTEGER DEFAULT 0,
      last_accessed_at TEXT,
      last_accessed_ip TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS access_logs (
      id TEXT PRIMARY KEY,
      aggregate_id TEXT NOT NULL,
      aggregate_token TEXT NOT NULL,
      ip TEXT NOT NULL,
      user_agent TEXT,
      target_format TEXT,
      node_count INTEGER NOT NULL DEFAULT 0,
      accessed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL,
      subscription_name TEXT NOT NULL,
      trigger_type TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'success',
      http_status INTEGER,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      node_count INTEGER NOT NULL DEFAULT 0,
      node_diff INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const nodeDb = drizzle(sqlite, { schema });
  return { db: nodeDb, sqlite };
}
