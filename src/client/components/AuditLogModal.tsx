import React, { useState, useEffect } from 'react';
import { X, Shield, History, Trash2, RefreshCw, Smartphone, Monitor, Globe, Loader2, KeyRound } from 'lucide-react';
import { AggregateGroup, AccessLog } from '../../core/types/index.js';
import { getAggregateLogs, clearAggregateLogs } from '../api/index.js';
import { formatDate } from '../lib/utils.js';

interface AuditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  aggregate: AggregateGroup | null;
}

export const AuditLogModal: React.FC<AuditLogModalProps> = ({ isOpen, onClose, aggregate }) => {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchLogs = async () => {
    if (!aggregate) return;
    setLoading(true);
    try {
      const data = await getAggregateLogs(aggregate.id);
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && aggregate) {
      fetchLogs();
    }
  }, [isOpen, aggregate]);

  if (!isOpen || !aggregate) return null;

  const handleClear = async () => {
    if (!confirm('确定要清空该聚合订阅的所有访问审计日志吗？')) return;
    setClearing(true);
    try {
      await clearAggregateLogs(aggregate.id);
      setLogs([]);
    } catch (err) {
      console.error('Failed to clear logs:', err);
    } finally {
      setClearing(false);
    }
  };

  const parseClientFromUA = (ua?: string) => {
    if (!ua) return { label: '未知客户端', icon: Globe };
    const lower = ua.toLowerCase();
    if (lower.includes('clash') || lower.includes('mihomo') || lower.includes('stash')) {
      return { label: 'Clash / Mihomo', icon: Monitor };
    }
    if (lower.includes('sing-box') || lower.includes('singbox')) {
      return { label: 'Sing-box', icon: Monitor };
    }
    if (lower.includes('surge')) {
      return { label: 'Surge', icon: Smartphone };
    }
    if (lower.includes('shadowrocket') || lower.includes('quantumult') || lower.includes('loon')) {
      return { label: 'Shadowrocket / Loon', icon: Smartphone };
    }
    if (lower.includes('v2ray') || lower.includes('nekoray')) {
      return { label: 'v2ray / Neko', icon: Monitor };
    }
    return { label: 'HTTP 客户端', icon: Globe };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-slate-100 space-y-4 my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-start justify-between pr-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">订阅调用审计日志</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  累计调用: {aggregate.accessCount || logs.length} 次
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                聚合配置: <span className="text-slate-200 font-sans">{aggregate.name}</span> (Token: {aggregate.token.slice(0, 8)}...)
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
                title="清空历史日志"
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
            <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
            <span className="text-xs text-slate-500">正在加载访问日志...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 rounded-xl bg-slate-950/60 border border-slate-800/80 border-dashed text-slate-500 text-xs">
            暂无此聚合订阅的访问调用记录
          </div>
        ) : (
          <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 uppercase font-mono text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">请求时间</th>
                    <th className="py-2.5 px-3">客户端 IP</th>
                    <th className="py-2.5 px-3">客户端类型</th>
                    <th className="py-2.5 px-3">请求格式</th>
                    <th className="py-2.5 px-3">下发节点</th>
                    <th className="py-2.5 px-3">User-Agent 详情</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {logs.map((log) => {
                    const client = parseClientFromUA(log.userAgent);
                    const ClientIcon = client.icon;
                    return (
                      <tr key={log.id} className="hover:bg-slate-900/60 transition">
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-400">
                          {formatDate(log.accessedAt)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-emerald-400 font-semibold select-all">
                          {log.ip}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-slate-200 font-sans">
                            <ClientIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{client.label}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-purple-300 border border-slate-700 uppercase">
                            {log.targetFormat || 'auto'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-300">
                          {log.nodeCount} 节点
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 truncate max-w-xs select-all" title={log.userAgent}>
                          {log.userAgent || '-'}
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
          <span>💡 记录客户端拉取订阅时的来源 IP、请求 UA 和下发节点数，防止泄露与滥用。</span>
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
