import React from 'react';
import { Layers, Activity, Radio, Shuffle, RefreshCw, KeyRound, LogOut } from 'lucide-react';
import { cn } from '../lib/utils.js';

export type TabType = 'overview' | 'subscriptions' | 'nodes' | 'aggregates';

interface NavbarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onRefreshAll: () => void;
  isRefreshing?: boolean;
  hasPasswordEnv?: boolean;
  onChangePasswordClick: () => void;
  onLogoutClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  onRefreshAll,
  isRefreshing,
  hasPasswordEnv,
  onChangePasswordClick,
  onLogoutClick,
}) => {
  const navItems = [
    { id: 'overview', label: '概览', fullLabel: '状态概览', icon: Activity },
    { id: 'subscriptions', label: '订阅源', fullLabel: '订阅源管理', icon: Radio },
    { id: 'nodes', label: '节点', fullLabel: '节点工作台', icon: Layers },
    { id: 'aggregates', label: '聚合', fullLabel: '聚合分发中心', icon: Shuffle },
  ];

  return (
    <>
      {/* Top Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 ring-1 ring-white/20 shrink-0">
              <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-bold text-base sm:text-lg text-white tracking-tight">SubHub</span>
                <span className="px-1.5 py-0.2 sm:py-0.5 rounded text-[9px] sm:text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  v1.0
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400 hidden sm:block truncate sm:max-w-none">
                订阅聚合与节点探针
              </p>
            </div>
          </div>

          {/* Desktop & Pad Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id as TabType)}
                  className={cn(
                    'flex items-center gap-1.5 lg:gap-2 px-3 lg:px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                    isActive
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">{item.fullLabel}</span>
                  <span className="lg:hidden">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Quick Actions & Auth controls */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={onRefreshAll}
              disabled={isRefreshing}
              className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition-all hover:border-slate-600 disabled:opacity-50 active:scale-95"
              title="刷新全部订阅源与节点"
            >
              <RefreshCw className={cn('w-3.5 h-3.5 text-sky-400', isRefreshing && 'animate-spin')} />
              <span className="hidden sm:inline">全量同步</span>
            </button>

            <div className="h-4 sm:h-5 w-px bg-slate-800 mx-0.5 sm:mx-1" />

            <button
              onClick={onChangePasswordClick}
              className={cn(
                'p-1.5 sm:p-2 rounded-lg transition border border-transparent active:scale-95',
                hasPasswordEnv
                  ? 'text-slate-500 hover:text-slate-400 hover:bg-slate-900 cursor-not-allowed opacity-75'
                  : 'text-slate-400 hover:text-amber-400 hover:bg-slate-900 hover:border-slate-800'
              )}
              title={hasPasswordEnv ? '密码由环境变量 ADMIN_PASSWORD 管理 (只读)' : '修改管理员密码'}
            >
              <KeyRound className="w-4 h-4" />
            </button>

            <button
              onClick={onLogoutClick}
              className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-900 transition border border-transparent hover:border-slate-800 active:scale-95"
              title="退出登录"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (Fixed for thumb reachability) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/90 bg-slate-950/95 backdrop-blur-lg px-2 py-1.5 pb-safe flex items-center justify-around shadow-2xl">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id as TabType)}
              className={cn(
                'flex flex-col items-center justify-center flex-1 py-1 px-2 rounded-xl text-[11px] transition-all',
                isActive
                  ? 'text-sky-400 font-semibold bg-sky-500/10 border border-sky-500/20'
                  : 'text-slate-400 hover:text-slate-200 active:scale-95'
              )}
            >
              <Icon className={cn('w-4 h-4 mb-0.5', isActive && 'text-sky-400')} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
};
