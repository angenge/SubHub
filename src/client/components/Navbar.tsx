import React from 'react';
import { Layers, Activity, Radio, Shuffle, RefreshCw, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
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
    { id: 'overview', label: '状态概览', icon: Activity },
    { id: 'subscriptions', label: '订阅源管理', icon: Radio },
    { id: 'nodes', label: '节点工作台', icon: Layers },
    { id: 'aggregates', label: '聚合分发中心', icon: Shuffle },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 ring-1 ring-white/20">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white tracking-tight">SubHub</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                v1.0
              </span>
            </div>
            <p className="text-xs text-slate-400">VPN 订阅聚合与节点探针中心</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id as TabType)}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                  isActive
                    ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Quick Actions & Auth controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onRefreshAll}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition-all hover:border-slate-600 disabled:opacity-50"
            title="刷新全部订阅源与节点"
          >
            <RefreshCw className={cn('w-3.5 h-3.5 text-sky-400', isRefreshing && 'animate-spin')} />
            <span className="hidden sm:inline">全量同步</span>
          </button>

          <div className="h-5 w-px bg-slate-800 hidden sm:block mx-1" />

          <button
            onClick={onChangePasswordClick}
            className={cn(
              'p-1.5 rounded-lg transition border border-transparent',
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
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-900 transition border border-transparent hover:border-slate-800"
            title="退出登录"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mobile Nav Bar */}
      <div className="md:hidden flex border-t border-slate-800 bg-slate-950 px-2 py-1 justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id as TabType)}
              className={cn(
                'flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-[11px]',
                isActive ? 'text-sky-400 font-semibold' : 'text-slate-400'
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </div>
    </header>
  );
};
