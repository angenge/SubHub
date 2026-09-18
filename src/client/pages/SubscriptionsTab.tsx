import React, { useState } from 'react';
import { Plus, RefreshCw, Trash2, Edit, Radio, Clock, ShieldAlert, CheckCircle, Globe, ExternalLink, Loader2, History, Power, PowerOff } from 'lucide-react';
import { Subscription } from '../../core/types/index.js';
import { formatBytes, formatDate, formatExpireDate } from '../lib/utils.js';
import { SyncLogModal } from '../components/SyncLogModal.js';

interface SubscriptionsTabProps {
  subscriptions: Subscription[];
  onAdd: () => void;
  onEdit: (sub: Subscription) => void;
  onToggleStatus?: (sub: Subscription) => void;
  onDelete: (id: string) => void;
  onRefresh: (id: string) => Promise<void>;
  onViewNodes: (subId: string) => void;
}

export const SubscriptionsTab: React.FC<SubscriptionsTabProps> = ({
  subscriptions,
  onAdd,
  onEdit,
  onToggleStatus,
  onDelete,
  onRefresh,
  onViewNodes,
}) => {
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [selectedSubForLog, setSelectedSubForLog] = useState<Subscription | null>(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);

  const handleRefresh = async (id: string) => {
    setRefreshingId(id);
    try {
      await onRefresh(id);
    } finally {
      setRefreshingId(null);
    }
  };

  const openLogModal = (sub: Subscription | null) => {
    setSelectedSubForLog(sub);
    setIsLogModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Radio className="w-5 h-5 text-sky-400" />
            订阅源管理
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            配置机场订阅地址，SubHub 会自动同步流量信息并提取节点
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => openLogModal(null)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition"
            title="查看所有订阅的历史同步记录"
          >
            <History className="w-4 h-4 text-sky-400" />
            <span>全局同步日志</span>
          </button>
          <button
            onClick={onAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/20 transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            添加订阅源
          </button>
        </div>
      </div>

      {/* Subscriptions Grid */}
      {subscriptions.length === 0 ? (
        <div className="text-center py-16 rounded-2xl bg-slate-900/50 border border-slate-800 border-dashed space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-500">
            <Radio className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-slate-300">暂未添加任何订阅源</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            点击上方「添加订阅源」输入你的机场订阅链接，即可一键解析所有节点并进行聚合
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {subscriptions.map((sub) => {
            const isDisabled = sub.status === 'disabled';
            const isRefreshing = refreshingId === sub.id;
            const used = (sub.upload || 0) + (sub.download || 0);
            const total = sub.total || 0;
            const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

            return (
              <div
                key={sub.id}
                className={`relative rounded-2xl bg-slate-900 border transition space-y-4 shadow-sm p-5 ${
                  isDisabled
                    ? 'border-slate-800/60 opacity-65 bg-slate-900/60'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className={`font-semibold text-base tracking-tight ${isDisabled ? 'text-slate-400 line-through' : 'text-white'}`}>
                        {sub.name}
                      </h3>
                      {isDisabled ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                          已禁用
                        </span>
                      ) : sub.status === 'error' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          拉取失败
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          正常
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-slate-500 truncate max-w-xs">{sub.url}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    {onToggleStatus && (
                      <button
                        onClick={() => onToggleStatus(sub)}
                        className={`p-1.5 rounded-lg transition ${
                          isDisabled
                            ? 'text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10'
                            : 'text-emerald-400 hover:text-slate-400 hover:bg-slate-800'
                        }`}
                        title={isDisabled ? '点击启用该订阅' : '点击禁用该订阅'}
                      >
                        {isDisabled ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                      </button>
                    )}
                    <button
                      onClick={() => openLogModal(sub)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition"
                      title="查看该订阅同步日志"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleRefresh(sub.id)}
                      disabled={isRefreshing || isDisabled}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition disabled:opacity-40"
                      title="刷新此订阅"
                    >
                      <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
                    </button>
                    <button
                      onClick={() => onEdit(sub)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                      title="编辑配置"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDelete(sub.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      title="删除订阅"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Error Banner if any */}
                {sub.errorMessage && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{sub.errorMessage}</span>
                  </div>
                )}

                {/* Traffic Details */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="text-slate-400">已用流量:</span>
                    <span className="font-mono font-semibold text-white">{formatBytes(used)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="text-slate-400">总配额:</span>
                    <span className="font-mono text-slate-400">{total > 0 ? formatBytes(total) : '无上限'}</span>
                  </div>
                  {total > 0 && (
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-sky-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Meta info & View Nodes button */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs text-slate-400">
                  <div className="space-y-0.5">
                    <div>到期: {formatExpireDate(sub.expire)}</div>
                    <div>更新于: {formatDate(sub.lastUpdatedAt)}</div>
                  </div>

                  <button
                    onClick={() => onViewNodes(sub.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
                  >
                    <span>{sub.nodeCount} 节点</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sync Log Audit Modal */}
      <SyncLogModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        subscription={selectedSubForLog}
      />
    </div>
  );
};
