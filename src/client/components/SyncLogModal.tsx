import React, { useState, useEffect } from 'react';
import { X, History, Trash2, RefreshCw, Loader2, CheckCircle, AlertCircle, Clock, Zap, Layers } from 'lucide-react';
import { Subscription, SyncLog } from '../../core/types/index.js';
import { getSyncLogs, clearSyncLogs } from '../api/index.js';
import { formatDate } from '../lib/utils.js';

interface SyncLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: Subscription | null; // null means all subscriptions
}

export const SyncLogModal: React.FC<SyncLogModalProps> = ({ isOpen, onClose, subscription }) => {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await getSyncLogs(subscription?.id);
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch sync logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
    }
  }, [isOpen, subscription]);

  if (!isOpen) return null;

  const handleClear = async () => {
    const msg = subscription
      ? `确定要清空订阅【${subscription.name}】的同步审计日志吗？`
      : '确定要清空所有订阅源的历史同步审计日志吗？';
    if (!confirm(msg)) return;

    setClearing(true);
    try {
      await clearSyncLogs(subscription?.id);
      setLogs([]);
    } catch (err) {
      console.error('Failed to clear sync logs:', err);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-4xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-100 space-y-4 my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-start justify-between pr-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">订阅同步审计日志</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  {logs.length} 条记录
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                {subscription ? (
                  <>
                    订阅源: <span className="text-slate-200 font-sans">{subscription.name}</span>
                  </>
                ) : (
                  '全部订阅源的历史同步与更新审计'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              title="刷新日志"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-400' : ''}`} />
            </button>
            {logs.length > 0 && (
              <button
                onClick={handleClear}
                disabled={clearing}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition disabled:opacity-50"
                title="清空同步日志"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空</span>
              </button>
            )}
          </div>
        </div>

        {/* Logs Table */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
            <span className="text-xs text-slate-500">正在加载同步日志...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 rounded-xl bg-slate-950/60 border border-slate-800/80 border-dashed text-slate-500 text-xs">
            暂无订阅同步或拉取的历史记录
          </div>
        ) : (
          <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 uppercase font-mono text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">同步时间</th>
                    {!subscription && <th className="py-2.5 px-3">订阅源</th>}
                    <th className="py-2.5 px-3">触发方式</th>
                    <th className="py-2.5 px-3">状态/响应码</th>
                    <th className="py-2.5 px-3">拉取耗时</th>
                    <th className="py-2.5 px-3">节点变化</th>
                    <th className="py-2.5 px-3">结果详情 / 错误信息</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {logs.map((log) => {
                    const isSuccess = log.status === 'success';
                    return (
                      <tr key={log.id} className="hover:bg-slate-900/60 transition">
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-400">
                          {formatDate(log.createdAt)}
                        </td>
                        {!subscription && (
                          <td className="py-2.5 px-3 whitespace-nowrap font-sans font-medium text-slate-200">
                            {log.subscriptionName}
                          </td>
                        )}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {log.triggerType === 'cron' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                              <Clock className="w-3 h-3" />
                              定时任务
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                              <Zap className="w-3 h-3 text-amber-400" />
                              手动触发
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {isSuccess ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>{log.httpStatus === 304 ? '304 未变动' : `成功 (${log.httpStatus || 200})`}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>失败 {log.httpStatus ? `(${log.httpStatus})` : ''}</span>
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-400">
                          {log.durationMs} ms
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-200">
                          <span className="font-semibold">{log.nodeCount} 节点</span>
                          {log.nodeDiff !== undefined && log.nodeDiff !== 0 && (
                            <span className={`ml-1.5 text-[10px] font-bold ${log.nodeDiff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {log.nodeDiff > 0 ? `+${log.nodeDiff}` : log.nodeDiff}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 truncate max-w-xs select-all" title={log.errorMessage || '同步正常'}>
                          {log.errorMessage ? (
                            <span className="text-rose-400">{log.errorMessage}</span>
                          ) : log.httpStatus === 304 ? (
                            <span className="text-slate-500 font-sans">HTTP ETag 缓存命中，无需重构节点</span>
                          ) : (
                            <span className="text-emerald-400/80 font-sans">已拉取并刷新节点</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
          <span>💡 记录每次手动和 Cron 定时同步的历史详情、耗时、节点变动与失败原因，便于运维审计。</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
