import React from 'react';
import { X, RefreshCw, CheckCircle2, XCircle, Loader2, Radio, Sparkles } from 'lucide-react';

export interface SyncItemLog {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  nodeCount?: number;
}

export interface SyncProgressState {
  total: number;
  completed: number;
  successCount: number;
  errorCount: number;
  activeName?: string;
  logs: SyncItemLog[];
  isFinished: boolean;
}

interface SyncProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  progress: SyncProgressState | null;
}

export const SyncProgressModal: React.FC<SyncProgressModalProps> = ({ isOpen, onClose, progress }) => {
  if (!isOpen || !progress) return null;

  const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-4 sm:p-6 text-slate-100 space-y-4 sm:space-y-5 my-auto">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <RefreshCw className={`w-5 h-5 ${!progress.isFinished ? 'animate-spin text-sky-400' : ''}`} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {progress.isFinished ? '全量同步已完成' : '正在并发同步订阅源'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {progress.isFinished
                  ? `共完成 ${progress.total} 个订阅源同步：${progress.successCount} 成功，${progress.errorCount} 失败`
                  : `当前进度: ${progress.completed} / ${progress.total} (${percent}%)`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-mono text-slate-400">
            <span>{progress.isFinished ? '100%' : `正在处理: ${progress.activeName || '准备中...'}`}</span>
            <span>{percent}%</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                progress.isFinished
                  ? progress.errorCount > 0
                    ? 'bg-gradient-to-r from-sky-500 via-amber-500 to-emerald-500'
                    : 'bg-emerald-500'
                  : 'bg-gradient-to-r from-sky-500 to-indigo-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Real-time Subscriptions Status List */}
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {progress.logs.map((item) => {
            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs transition"
              >
                <div className="flex items-center gap-2.5 truncate max-w-[70%]">
                  {item.status === 'running' && <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />}
                  {item.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                  {item.status === 'error' && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                  {item.status === 'pending' && <Radio className="w-4 h-4 text-slate-600 shrink-0" />}

                  <span className="font-semibold text-slate-200 truncate">{item.name}</span>
                </div>

                <div className="text-right shrink-0">
                  {item.status === 'running' && (
                    <span className="text-sky-400 text-[11px] animate-pulse">正在拉取与解析...</span>
                  )}
                  {item.status === 'success' && (
                    <span className="text-emerald-400 font-mono text-[11px] font-semibold">
                      +{item.nodeCount || 0} 节点
                    </span>
                  )}
                  {item.status === 'error' && (
                    <span className="text-rose-400 text-[11px] truncate max-w-[140px] block" title={item.message}>
                      {item.message || '拉取失败'}
                    </span>
                  )}
                  {item.status === 'pending' && <span className="text-slate-600 text-[11px]">排队中...</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs text-slate-500">
          <span>💡 支持多机场高并发同时更新与自动降级保护</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
          >
            {progress.isFinished ? '完成' : '后台运行'}
          </button>
        </div>
      </div>
    </div>
  );
};
