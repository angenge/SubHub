import React, { useEffect, useState } from 'react';
import {
  Smartphone,
  Laptop,
  Monitor,
  Radio,
  Globe,
  Clock,
  RefreshCw,
  Activity,
  Layers,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Trash2,
} from 'lucide-react';
import { AggregateGroup, ClientAccessSummary } from '../../core/types/index.js';
import { getAggregateClients, clearAggregateLogs } from '../api/index.js';
import { formatDate } from '../lib/utils.js';

interface ClientDevicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  aggregate: AggregateGroup | null;
}

export const ClientDevicesModal: React.FC<ClientDevicesModalProps> = ({
  isOpen,
  onClose,
  aggregate,
}) => {
  const [clients, setClients] = useState<ClientAccessSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchClients = async () => {
    if (!aggregate) return;
    setLoading(true);
    try {
      const data = await getAggregateClients(aggregate.id);
      setClients(data);
    } catch (err) {
      console.error('Failed to load clients:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!aggregate) return;
    if (!confirm('确定要清空此聚合订阅的访问记录与设备历史吗？')) return;
    setClearing(true);
    try {
      await clearAggregateLogs(aggregate.id);
      setClients([]);
    } catch (err) {
      console.error('Failed to clear client records:', err);
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    if (isOpen && aggregate) {
      fetchClients();
    }
  }, [isOpen, aggregate]);

  if (!isOpen || !aggregate) return null;

  const getDeviceIcon = (iconType: string) => {
    switch (iconType) {
      case 'apple':
        return <Smartphone className="w-5 h-5 text-indigo-400" />;
      case 'windows':
        return <Laptop className="w-5 h-5 text-sky-400" />;
      case 'android':
        return <Smartphone className="w-5 h-5 text-emerald-400" />;
      case 'linux':
        return <Monitor className="w-5 h-5 text-amber-400" />;
      case 'router':
        return <Radio className="w-5 h-5 text-purple-400" />;
      default:
        return <Globe className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: 'online' | 'active' | 'idle') => {
    switch (status) {
      case 'online':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            当前在线 (30m内)
          </span>
        );
      case 'active':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            24h 内活跃
          </span>
        );
      case 'idle':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            休眠 (&gt;24h)
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-white truncate">
                已订阅客户端画像
              </h3>
              <p className="text-xs text-slate-400 truncate">
                聚合包「{aggregate.name}」的设备类型与拉取在线状态
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {clients.length > 0 && (
              <button
                onClick={handleClear}
                disabled={clearing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition disabled:opacity-50"
                title="清空记录"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">清空记录</span>
              </button>
            )}
            <button
              onClick={fetchClients}
              disabled={loading}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
              title="刷新设备列表"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
          {loading && clients.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <RefreshCw className="w-6 h-6 mx-auto animate-spin text-indigo-400" />
              <p className="text-xs">正在分析设备画像...</p>
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-12 rounded-xl bg-slate-950/40 border border-slate-800/80 p-4 space-y-2">
              <Smartphone className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-sm font-medium text-slate-300">暂未发现订阅客户端</p>
              <p className="text-xs text-slate-500">
                当客户端（如手机小火箭、电脑 Clash、Surge）拉取此聚合链接后，系统将自动识别设备类型并追踪在线状态
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {clients.map((client) => (
                <div
                  key={client.clientId}
                  className="rounded-xl bg-slate-950/70 border border-slate-800/80 p-3.5 sm:p-4 hover:border-slate-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                      {getDeviceIcon(client.profile.iconType)}
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white text-sm tracking-tight">
                          {client.profile.clientName}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                          {client.profile.osName}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] uppercase font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {client.lastTargetFormat}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-3 font-mono flex-wrap">
                        <span title="客户端出口 IP">IP: {client.lastIp}</span>
                        <span>累计更新: {client.accessCount} 次</span>
                      </div>
                      {client.profile.rawUA && (
                        <p className="text-[10px] text-slate-500 font-mono truncate max-w-md" title={client.profile.rawUA}>
                          UA: {client.profile.rawUA}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1.5 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800/60">
                    {getStatusBadge(client.status)}
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(client.lastAccessedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>共识别出 {clients.length} 台独立订阅设备</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
