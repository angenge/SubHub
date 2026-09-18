import React from 'react';
import { Activity, Radio, Layers, Shuffle, Zap, ArrowUpRight, Shield, Loader2 } from 'lucide-react';
import { DashboardStats, Subscription } from '../../core/types/index.js';
import { formatBytes, formatExpireDate } from '../lib/utils.js';
import { CountryBadge } from '../components/CountryBadge.js';
import { TabType } from '../components/Navbar.js';

interface OverviewTabProps {
  stats: DashboardStats | null;
  subscriptions: Subscription[];
  enableTcpPing?: boolean;
  onNavigateTab: (tab: TabType) => void;
  onRefreshAll: () => void;
  onOpenAddSubscription: () => void;
  onOpenAddAggregate: () => void;
  onPingAllNodes: () => Promise<void>;
  isPingingAll?: boolean;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  stats,
  subscriptions,
  enableTcpPing = true,
  onNavigateTab,
  onOpenAddSubscription,
  onOpenAddAggregate,
  onPingAllNodes,
  isPingingAll,
}) => {
  if (!stats) return null;

  const onlineRate = stats.totalNodes > 0 ? Math.round((stats.onlineNodes / stats.totalNodes) * 100) : 0;
  const trafficPercent =
    stats.totalTrafficQuota > 0 ? Math.min(100, Math.round((stats.totalTrafficUsed / stats.totalTrafficQuota) * 100)) : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Banner / Welcome */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-r from-sky-950/60 via-indigo-950/50 to-slate-900 border border-slate-800/80 p-4 sm:p-6 md:p-8">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5 sm:gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Zap className="w-3.5 h-3.5" />
              智能聚合 & 节点探针引擎已就绪
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white tracking-tight">
              订阅聚合工作台
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
              已管理 <span className="font-semibold text-sky-400">{stats.totalSubscriptions}</span> 个订阅源，共收录{' '}
              <span className="font-semibold text-emerald-400">{stats.totalNodes}</span> 个代理节点，实时在线率{' '}
              <span className="font-semibold text-indigo-400">{onlineRate}%</span>。
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3">
            <button
              onClick={onOpenAddSubscription}
              className="flex-1 sm:flex-none justify-center flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/30 transition active:scale-95"
            >
              <Radio className="w-4 h-4" />
              <span>添加订阅源</span>
            </button>
            <button
              onClick={onOpenAddAggregate}
              className="flex-1 sm:flex-none justify-center flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition active:scale-95"
            >
              <Shuffle className="w-4 h-4" />
              <span>创建新聚合</span>
            </button>
            {enableTcpPing && (
              <button
                onClick={onPingAllNodes}
                disabled={isPingingAll || stats.totalNodes === 0}
                className="w-full sm:w-auto justify-center flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition active:scale-95 disabled:opacity-50"
              >
                {isPingingAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>测速中...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>一键全网测速</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Subscriptions */}
        <div
          onClick={() => onNavigateTab('subscriptions')}
          className="group cursor-pointer rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5 hover:border-slate-700 transition hover:shadow-lg hover:shadow-sky-500/5 active:scale-[0.98]"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2 sm:mb-3">
            <span className="text-[11px] sm:text-xs font-medium">有效订阅源</span>
            <div className="p-1.5 sm:p-2 rounded-xl bg-sky-500/10 text-sky-400 group-hover:bg-sky-500 group-hover:text-white transition">
              <Radio className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{stats.totalSubscriptions}</span>
            <span className="text-[10px] sm:text-xs text-slate-500">个机场</span>
          </div>
          <div className="mt-2 sm:mt-3 flex items-center text-[11px] sm:text-xs text-sky-400 font-medium">
            <span>管理订阅与流量</span>
            <ArrowUpRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 ml-0.5 group-hover:translate-x-0.5 transition" />
          </div>
        </div>

        {/* Card 2: Total Nodes */}
        <div
          onClick={() => onNavigateTab('nodes')}
          className="group cursor-pointer rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5 hover:border-slate-700 transition hover:shadow-lg hover:shadow-emerald-500/5 active:scale-[0.98]"
        >
          <div className="flex items-center justify-between text-slate-400 mb-2 sm:mb-3">
            <span className="text-[11px] sm:text-xs font-medium">总收录节点</span>
            <div className="p-1.5 sm:p-2 rounded-xl bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition">
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2 truncate">
            <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{stats.totalNodes}</span>
            <span className="text-[10px] sm:text-xs text-emerald-400 font-medium truncate">
              {enableTcpPing ? `(${stats.onlineNodes} 在线)` : '就绪'}
            </span>
          </div>
          <div className="mt-2 sm:mt-3 flex items-center text-[11px] sm:text-xs text-emerald-400 font-medium">
            <span>节点工作台</span>
            <ArrowUpRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 ml-0.5 group-hover:translate-x-0.5 transition" />
          </div>
        </div>

        {/* Card 3: Online rate with Quick Health Check */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5">
          <div className="flex items-center justify-between text-slate-400 mb-2 sm:mb-3">
            <span className="text-[11px] sm:text-xs font-medium">节点健康度</span>
            {enableTcpPing && (
              <button
                onClick={onPingAllNodes}
                disabled={isPingingAll || stats.totalNodes === 0}
                className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] sm:text-xs font-medium border border-emerald-500/20 transition disabled:opacity-50"
                title="一键测速"
              >
                {isPingingAll ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Zap className="w-3 h-3" />
                )}
                <span>{isPingingAll ? '测速中' : '测速'}</span>
              </button>
            )}
          </div>
          <div className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{onlineRate}%</span>
            <span className="text-[10px] sm:text-xs text-slate-400">存活率</span>
          </div>
          <div className="mt-2 sm:mt-3 flex items-center gap-2 text-[10px] sm:text-xs">
            <span className="inline-flex items-center gap-0.5 text-emerald-400">
              🟢 {stats.onlineNodes}
            </span>
            <span className="inline-flex items-center gap-0.5 text-amber-400">
              🟡 {stats.slowNodes}
            </span>
            <span className="inline-flex items-center gap-0.5 text-rose-400">
              🔴 {stats.timeoutNodes}
            </span>
          </div>
        </div>

        {/* Card 4: Total Traffic */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-5">
          <div className="flex items-center justify-between text-slate-400 mb-2 sm:mb-3">
            <span className="text-[11px] sm:text-xs font-medium truncate">总流量已用</span>
            <div className="p-1.5 sm:p-2 rounded-xl bg-purple-500/10 text-purple-400 shrink-0">
              <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-1 sm:gap-2 truncate">
            <span className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {formatBytes(stats.totalTrafficUsed)}
            </span>
            <span className="text-[10px] sm:text-xs text-slate-500 truncate">
              / {stats.totalTrafficQuota > 0 ? formatBytes(stats.totalTrafficQuota) : '不限'}
            </span>
          </div>
          <div className="mt-2 sm:mt-3 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-sky-500 to-indigo-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${trafficPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Grid: Subscriptions Status & Country/Protocol Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Left: Active Subscriptions List */}
        <div className="lg:col-span-2 rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-semibold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-sky-400" />
              机场订阅概况与配额
            </h3>
            <button
              onClick={() => onNavigateTab('subscriptions')}
              className="text-xs text-sky-400 hover:text-sky-300 transition"
            >
              查看全部 ({subscriptions.length})
            </button>
          </div>

          <div className="space-y-3">
            {subscriptions.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                暂无订阅源，点击上方「添加订阅源」开始
              </div>
            ) : (
              subscriptions.slice(0, 5).map((sub) => {
                const used = (sub.upload || 0) + (sub.download || 0);
                const total = sub.total || 0;
                const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

                return (
                  <div
                    key={sub.id}
                    className="p-3.5 sm:p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-semibold text-xs sm:text-sm text-slate-200 truncate">{sub.name}</span>
                        <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold bg-slate-800 text-slate-300 shrink-0">
                          {sub.nodeCount} 节点
                        </span>
                      </div>
                      <span className="text-[10px] sm:text-xs text-slate-400 shrink-0">
                        {formatExpireDate(sub.expire)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-400 font-mono">
                      <span>已用: {formatBytes(used)}</span>
                      <span>总量: {total > 0 ? formatBytes(total) : '无上限'}</span>
                    </div>

                    {total > 0 && (
                      <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-sky-500 h-1.5 rounded-full"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Regions & Protocols Distribution */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 sm:p-6 space-y-5 sm:space-y-6">
          {/* Countries */}
          <div>
            <h3 className="text-xs sm:text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              节点地区分布
            </h3>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {stats.countryDistribution.length === 0 ? (
                <span className="text-xs text-slate-500">暂无数据</span>
              ) : (
                stats.countryDistribution.map((item) => (
                  <div
                    key={item.country}
                    className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] sm:text-xs text-slate-300"
                  >
                    <CountryBadge country={item.country} code={item.code} />
                    <span className="font-bold text-white ml-0.5">{item.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Protocols */}
          <div className="pt-4 border-t border-slate-800">
            <h3 className="text-xs sm:text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              协议构成
            </h3>
            <div className="space-y-2">
              {stats.protocolDistribution.length === 0 ? (
                <span className="text-xs text-slate-500">暂无数据</span>
              ) : (
                stats.protocolDistribution.map((p) => {
                  const percent = stats.totalNodes > 0 ? Math.round((p.count / stats.totalNodes) * 100) : 0;
                  return (
                    <div key={p.protocol} className="space-y-1">
                      <div className="flex justify-between text-[11px] sm:text-xs">
                        <span className="font-mono text-slate-300">{p.protocol}</span>
                        <span className="text-slate-400">
                          {p.count} 节点 ({percent}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                        <div
                          className="bg-indigo-500 h-1 rounded-full"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
