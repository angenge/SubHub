import React, { useState } from 'react';
import {
  Shuffle,
  Plus,
  Copy,
  Check,
  ExternalLink,
  Edit,
  Trash2,
  KeyRound,
  Filter,
  Sparkles,
  Zap,
  ShieldCheck,
  History,
  Activity,
  Globe,
  QrCode,
} from 'lucide-react';
import { AggregateGroup, Subscription } from '../../core/types/index.js';
import { AuditLogModal } from '../components/AuditLogModal.js';
import { formatDate } from '../lib/utils.js';

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

  const handleQuickCopy = (agg: AggregateGroup) => {
    const origin = window.location.origin;
    const url = `${origin}/sub/${agg.token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(agg.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Shuffle className="w-5 h-5 text-indigo-400" />
            聚合分发中心
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            将多个机场的节点按规则智能聚合、过滤去重，支持访问审计日志与统一订阅分发
          </p>
        </div>

        <button
          onClick={onAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition active:scale-95"
        >
          <Plus className="w-4 h-4" />
          创建新聚合
        </button>
      </div>

      {/* Aggregate Cards */}
      {aggregates.length === 0 ? (
        <div className="text-center py-16 rounded-2xl bg-slate-900/50 border border-slate-800 border-dashed space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-500">
            <Shuffle className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-slate-300">暂未创建任何聚合分发配置</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            点击上方「创建新聚合」定制你的专属订阅（如纯香港/日本高速聚合、低倍率精选等）
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {aggregates.map((agg) => {
            const isCopied = copiedId === agg.id;
            return (
              <div
                key={agg.id}
                className="relative rounded-2xl bg-slate-900 border border-slate-800 p-5 hover:border-slate-700 transition space-y-4 shadow-sm"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-white text-base tracking-tight">{agg.name}</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase font-mono">
                        {agg.targetFormat}
                      </span>
                      {agg.enabled ? (
                        <span className="w-2 h-2 rounded-full bg-emerald-400" title="已启用" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-slate-600" title="已禁用" />
                      )}
                    </div>
                    <p className="text-xs font-mono text-slate-500">
                      Token: {agg.token.slice(0, 8)}...{agg.token.slice(-6)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onExport(agg)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition"
                      title="获取订阅链接与手机二维码"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>获取订阅 / 扫码</span>
                    </button>
                    <button
                      onClick={() => setSelectedAggForLogs(agg)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-purple-400 hover:bg-slate-800 transition"
                      title="查看订阅访问审计日志"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onEdit(agg)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                      title="编辑聚合规则"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onRotateToken(agg.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition"
                      title="轮换访问 Token"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDelete(agg.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      title="删除聚合"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Audit & Access Statistics summary */}
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/60 font-mono text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <span className="text-slate-500">调用统计:</span>
                    <span className="text-purple-400 font-bold">{agg.accessCount || 0} 次请求</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400 truncate">
                    <span className="text-slate-500">最近来源:</span>
                    <span className="text-slate-200 truncate" title={agg.lastAccessedIp}>
                      {agg.lastAccessedIp || '暂无请求'}
                    </span>
                  </div>
                </div>

                {/* Rules & Filters Summary */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Filter className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="text-slate-400">来源:</span>
                    <span className="font-medium">
                      {agg.subscriptionIds.length === 0 ? '全部订阅源' : `${agg.subscriptionIds.length} 个指定订阅`}
                    </span>
                  </div>

                  {agg.filterKeywords.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400">包含词:</span>
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
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400">排除词:</span>
                      <div className="flex flex-wrap gap-1">
                        {agg.excludeKeywords.map((kw, i) => (
                          <span key={i} className="px-1.5 py-0.2 rounded text-[10px] bg-rose-950 text-rose-400 border border-rose-800/60">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1">
                    {agg.deduplicate && <span className="text-emerald-400">✓ 智能去重</span>}
                    {agg.filterOnlineOnly && <span className="text-emerald-400">✓ 仅在线节点</span>}
                    {agg.renameRules.length > 0 && (
                      <span className="text-amber-400 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        {agg.renameRules.length} 条重命名规则
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick Link bar */}
                <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
                  <div className="text-[11px]">
                    {agg.lastAccessedAt ? `最后请求: ${formatDate(agg.lastAccessedAt)}` : `创建于: ${formatDate(agg.createdAt)}`}
                  </div>
                  <button
                    onClick={() => handleQuickCopy(agg)}
                    className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition"
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">已复制快捷直链</span>
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
