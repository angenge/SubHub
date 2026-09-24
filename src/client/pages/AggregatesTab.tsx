import React, { useState } from 'react';
import {
  Shuffle,
  Plus,
  Copy,
  Check,
  Edit,
  Trash2,
  KeyRound,
  Filter,
  Sparkles,
  History,
  QrCode,
} from 'lucide-react';
import { AggregateGroup, Subscription } from '../../core/types/index.js';
import { AuditLogModal } from '../components/AuditLogModal.js';
import { formatDate, copyToClipboard } from '../lib/utils.js';

interface AggregatesTabProps {
  aggregates: AggregateGroup[];
  subscriptions: Subscription[];
  onAdd: () => void;
  onEdit: (agg: AggregateGroup) => void;
  onDelete: (id: string) => void;
  onRotateToken: (id: string) => Promise<void>;
  onExport: (agg: AggregateGroup) => void;
  onToggleEnabled: (id: string, enabled: boolean) => Promise<void>;
}

export const AggregatesTab: React.FC<AggregatesTabProps> = ({
  aggregates,
  subscriptions,
  onAdd,
  onEdit,
  onDelete,
  onRotateToken,
  onExport,
  onToggleEnabled,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedAggForLogs, setSelectedAggForLogs] = useState<AggregateGroup | null>(null);

  const handleQuickCopy = async (agg: AggregateGroup) => {
    const origin = window.location.origin;
    const url = `${origin}/sub/${agg.token}`;
    await copyToClipboard(url);
    setCopiedId(agg.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Shuffle className="w-5 h-5 text-indigo-400" />
            聚合分发中心
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 sm:mt-1">
            将多个机场的节点按规则智能聚合、过滤去重，支持访问审计日志与统一订阅分发
          </p>
        </div>

        <button
          onClick={onAdd}
          className="w-full sm:w-auto justify-center flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>创建新聚合</span>
        </button>
      </div>

      {/* Aggregate Cards */}
      {aggregates.length === 0 ? (
        <div className="text-center py-12 sm:py-16 rounded-2xl bg-slate-900/50 border border-slate-800 border-dashed space-y-3 p-4">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-500">
            <Shuffle className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-slate-300">暂未创建任何聚合分发配置</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            点击上方「创建新聚合」定制你的专属订阅（如纯香港/日本高速聚合、低倍率精选等）
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          {aggregates.map((agg) => {
            const isCopied = copiedId === agg.id;
            return (
              <div
                key={agg.id}
                className="relative rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5 hover:border-slate-700 transition space-y-3 sm:space-y-4 shadow-sm"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-white text-sm sm:text-base tracking-tight truncate max-w-[200px] sm:max-w-xs">{agg.name}</h3>
                      <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase font-mono">
                        {agg.targetFormat}
                      </span>
                      {agg.enabled ? (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="已启用" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" title="已禁用" />
                      )}
                    </div>
                    <p className="text-[11px] sm:text-xs font-mono text-slate-500 truncate">
                      Token: {agg.token.slice(0, 8)}...{agg.token.slice(-6)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onExport(agg)}
                      className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition active:scale-95"
                      title="获取订阅链接与手机二维码"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">订阅 / 扫码</span>
                    </button>
                    <button
                      onClick={() => setSelectedAggForLogs(agg)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-purple-400 hover:bg-slate-800 transition active:scale-95"
                      title="查看订阅访问审计日志"
                    >
                      <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                    <button
                      onClick={() => onEdit(agg)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition active:scale-95"
                      title="编辑聚合规则"
                    >
                      <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                    <button
                      onClick={() => onRotateToken(agg.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition active:scale-95"
                      title="轮换访问 Token"
                    >
                      <KeyRound className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                    <button
                      onClick={() => onDelete(agg.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition active:scale-95"
                      title="删除聚合"
                    >
                      <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                  </div>
                </div>

                {/* Audit & Access Statistics summary */}
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/60 font-mono text-[10px] sm:text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <span className="text-slate-500">调用统计:</span>
                    <span className="text-purple-400 font-bold">{agg.accessCount || 0} 次</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400 truncate">
                    <span className="text-slate-500 shrink-0">最近来源:</span>
                    <span className="text-slate-200 truncate" title={agg.lastAccessedIp}>
                      {agg.lastAccessedIp || '暂无请求'}
                    </span>
                  </div>
                </div>

                {/* Rules & Filters Summary */}
                <div className="p-3 sm:p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Filter className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="text-slate-400">来源:</span>
                    <span className="font-medium">
                      {agg.subscriptionIds.length === 0 ? '全部订阅源' : `${agg.subscriptionIds.length} 个指定订阅`}
                    </span>
                  </div>

                  {agg.filterKeywords.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-slate-400 shrink-0">包含:</span>
                      <div className="flex flex-wrap gap-1">
                        {agg.filterKeywords.map((kw, i) => (
                          <span key={i} className="px-1.5 py-0.2 rounded text-[10px] bg-sky-950 text-sky-400 border border-sky-800/60">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {agg.excludeKeywords.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-slate-400 shrink-0">排除:</span>
                      <div className="flex flex-wrap gap-1">
                        {agg.excludeKeywords.map((kw, i) => (
                          <span key={i} className="px-1.5 py-0.2 rounded text-[10px] bg-rose-950 text-rose-400 border border-rose-800/60">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2.5 sm:gap-3 text-[10px] sm:text-[11px] text-slate-400 pt-1 flex-wrap">
                    {agg.deduplicate && <span className="text-emerald-400">✓ 智能去重</span>}
                    {agg.filterOnlineOnly && <span className="text-emerald-400">✓ 仅在线</span>}
                    {agg.renameRules.length > 0 && (
                      <span className="text-amber-400 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        {agg.renameRules.length} 条正则改名
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick Link bar */}
                <div className="flex items-center justify-between pt-1 text-[11px] sm:text-xs text-slate-400 gap-2">
                  <div className="truncate">
                    {agg.lastAccessedAt ? `最后请求: ${formatDate(agg.lastAccessedAt)}` : `创建: ${formatDate(agg.createdAt)}`}
                  </div>
                  <button
                    onClick={() => handleQuickCopy(agg)}
                    className="flex items-center gap-1 text-[11px] sm:text-xs text-indigo-400 hover:text-indigo-300 transition shrink-0 active:scale-95"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">已复制直链</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>快捷复制链接</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Audit Log Modal */}
      <AuditLogModal
        isOpen={!!selectedAggForLogs}
        onClose={() => setSelectedAggForLogs(null)}
        aggregate={selectedAggForLogs}
      />
    </div>
  );
};
