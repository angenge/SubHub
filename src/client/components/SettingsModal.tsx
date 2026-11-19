import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Download,
  Upload,
  Loader2,
  ShieldAlert,
  FileJson,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  DatabaseBackup,
} from 'lucide-react';
import { exportBackup, importBackup, BackupImportResult } from '../api/index.js';

const MAX_BYTES = 5 * 1024 * 1024;

interface Preview {
  version: number;
  exportedAt: string;
  appVersion: string;
  build: string;
  platform: string;
  subscriptions: number;
  aggregates: number;
  settings: number;
}

interface SelectedFile {
  name: string;
  size: number;
  raw: string;
  preview: Preview;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful import so the dashboard reloads its data. */
  onImported: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

function parsePreview(raw: string): Preview {
  let doc: any;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new Error('文件不是合法的 JSON（可能已损坏或被截断）');
  }

  if (!doc || doc.format !== 'subhub-backup') {
    throw new Error('这不是 SubHub 备份文件（format 字段不匹配）');
  }
  if (typeof doc.version !== 'number' || doc.version < 1) {
    throw new Error('备份文件的 version 字段无效');
  }
  if (doc.version > 1) {
    throw new Error(`该备份由更新版本的 SubHub 导出（version ${doc.version}），请先升级`);
  }

  const data = doc.data || {};
  const subscriptions = Array.isArray(data.subscriptions) ? data.subscriptions.length : 0;
  const aggregates = Array.isArray(data.aggregates) ? data.aggregates.length : 0;
  const settings = Array.isArray(data.settings) ? data.settings.length : 0;

  if (!subscriptions && !aggregates && !settings) {
    throw new Error('备份文件中没有任何可导入的数据');
  }

  return {
    version: doc.version,
    exportedAt: typeof doc.exportedAt === 'string' ? doc.exportedAt : '',
    appVersion: doc.app?.version || 'unknown',
    build: doc.app?.build || 'unknown',
    platform: doc.app?.platform || 'unknown',
    subscriptions,
    aggregates,
    settings,
  };
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onImported }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<SelectedFile | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [result, setResult] = useState<BackupImportResult | null>(null);

  useEffect(() => {
    if (isOpen) {
      setBusy(null);
      setError('');
      setSelected(null);
      setMode('merge');
      setReplaceConfirmed(false);
      setResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExport = async () => {
    setError('');
    setResult(null);
    setBusy('export');
    try {
      await exportBackup();
    } catch (err: any) {
      setError(err.message || '导出失败');
    } finally {
      setBusy(null);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError('');
    setResult(null);

    if (file.size > MAX_BYTES) {
      setSelected(null);
      setError(`文件超过大小上限（${formatBytes(MAX_BYTES)}）`);
      return;
    }

    try {
      const raw = await file.text();
      const preview = parsePreview(raw);
      setSelected({ name: file.name, size: file.size, raw, preview });
    } catch (err: any) {
      setSelected(null);
      setError(err.message || '无法读取备份文件');
    }
  };

  const handleImport = async () => {
    if (!selected) return;
    if (mode === 'replace' && !replaceConfirmed) return;

    setError('');
    setResult(null);
    setBusy('import');

    try {
      const res = await importBackup(selected.raw, mode);
      setResult(res);
      setSelected(null);
      setReplaceConfirmed(false);
      onImported();
    } catch (err: any) {
      setError(err.message || '导入失败');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-4 sm:p-6 text-slate-100 my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 mb-5">
          <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <DatabaseBackup className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">系统设置 · 数据备份</h3>
            <p className="text-xs text-slate-400">迁移服务器或灾难恢复时使用</p>
          </div>
        </div>

        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs leading-relaxed flex gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            备份文件包含<b>订阅链接</b>（等同于机场账号密码）和<b>聚合分发 token</b>。
            请勿提交到公开仓库或转发到聊天群。密码哈希与会话密钥<b>不会</b>被导出。
          </span>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
            {error}
          </div>
        )}

        {/* Export */}
        <section className="mb-5 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-200">导出备份</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                订阅源、聚合规则、控制台/探针配置；不含节点与日志
              </p>
            </div>
            <button
              onClick={handleExport}
              disabled={busy !== null}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/20 transition active:scale-95 disabled:opacity-50 shrink-0"
            >
              {busy === 'export' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              导出
            </button>
          </div>
        </section>

        {/* Import */}
        <section className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-200">导入备份</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                先在本地解析预览，确认后才会写入数据库
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy !== null}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition active:scale-95 disabled:opacity-50 shrink-0"
            >
              <Upload className="w-4 h-4" />
              选择文件
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {selected && (
            <div className="mt-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
              <div className="flex items-center gap-2 text-xs text-slate-200">
                <FileJson className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="truncate font-medium">{selected.name}</span>
                <span className="text-slate-500 shrink-0">{formatBytes(selected.size)}</span>
              </div>

              <dl className="mt-2.5 grid grid-cols-2 gap-y-1 text-[11px] text-slate-400">
                <dt>导出时间</dt>
                <dd className="text-right text-slate-300">
                  {selected.preview.exportedAt ? formatTime(selected.preview.exportedAt) : '未知'}
                </dd>
                <dt>来源版本</dt>
                <dd className="text-right text-slate-300">
                  {selected.preview.appVersion} / {selected.preview.build}
                </dd>
                <dt>包含数据</dt>
                <dd className="text-right text-slate-300">
                  订阅 {selected.preview.subscriptions} · 聚合 {selected.preview.aggregates} · 设置{' '}
                  {selected.preview.settings}
                </dd>
              </dl>

              <div className="mt-3 space-y-2">
                <label className="flex items-start gap-2 p-2 rounded-lg border border-slate-800 cursor-pointer hover:bg-slate-900">
                  <input
                    type="radio"
                    name="backup-mode"
                    checked={mode === 'merge'}
                    onChange={() => {
                      setMode('merge');
                      setReplaceConfirmed(false);
                    }}
                    className="mt-0.5 accent-sky-500"
                  />
                  <span className="text-xs">
                    <span className="font-medium text-slate-200">合并（推荐）</span>
                    <span className="block text-[11px] text-slate-400">
                      已存在的记录按 id / URL 跳过，不删除任何现有数据
                    </span>
                  </span>
                </label>

                <label className="flex items-start gap-2 p-2 rounded-lg border border-rose-900/60 cursor-pointer hover:bg-rose-950/30">
                  <input
                    type="radio"
                    name="backup-mode"
                    checked={mode === 'replace'}
                    onChange={() => setMode('replace')}
                    className="mt-0.5 accent-rose-500"
                  />
                  <span className="text-xs">
                    <span className="font-medium text-rose-300">覆盖（危险）</span>
                    <span className="block text-[11px] text-slate-400">
                      清空现有订阅、聚合、节点与日志后全量写入
                    </span>
                  </span>
                </label>
              </div>

              {mode === 'replace' && (
                <label className="mt-2 flex items-start gap-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceConfirmed}
                    onChange={(e) => setReplaceConfirmed(e.target.checked)}
                    className="mt-0.5 accent-rose-500"
                  />
                  我已知晓：此操作会删除现有数据，且无法撤销
                </label>
              )}

              <div className="mt-3 flex items-center justify-end">
                <button
                  onClick={handleImport}
                  disabled={busy !== null || (mode === 'replace' && !replaceConfirmed)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition active:scale-95 disabled:opacity-40 ${
                    mode === 'replace'
                      ? 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-600/20'
                      : 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20'
                  }`}
                >
                  {busy === 'import' && <Loader2 className="w-4 h-4 animate-spin" />}
                  {mode === 'replace' ? '覆盖导入' : '合并导入'}
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-200">
              <div className="flex items-center gap-1.5 font-semibold mb-1.5">
                <CheckCircle2 className="w-4 h-4" />
                导入完成（{result.mode === 'replace' ? '覆盖' : '合并'}）
              </div>
              <ul className="space-y-0.5 text-[11px] text-emerald-100/90">
                <li>
                  新增：订阅 {result.imported.subscriptions} · 聚合 {result.imported.aggregates} · 设置{' '}
                  {result.imported.settings}
                </li>
                <li>
                  跳过：订阅 {result.skipped.subscriptions} · 聚合 {result.skipped.aggregates} · 设置{' '}
                  {result.skipped.settings}
                </li>
                {result.renamed.length > 0 && (
                  <li className="text-amber-200">
                    自动改名：{result.renamed.map((r) => `${r.from} → ${r.to}`).join('；')}
                  </li>
                )}
                {result.regeneratedTokens.length > 0 && (
                  <li className="text-amber-200">
                    重建 token：{result.regeneratedTokens.map((r) => r.name).join('、')}
                    （这些聚合的分发链接已变化）
                  </li>
                )}
                {result.warnings.map((warning, index) => (
                  <li key={index} className="text-amber-200">
                    {warning}
                  </li>
                ))}
              </ul>

              {result.partial && (
                <p className="mt-2 flex items-start gap-1.5 text-rose-300">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  部分数据未能写入（D1 不支持跨批事务）。请重新导入一次，已存在的记录会被自动跳过。
                </p>
              )}

              <p className="mt-2 flex items-start gap-1.5 text-slate-300">
                <RefreshCw className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                建议关闭本窗口后点击顶部「全量同步」，重新拉取节点列表。
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
