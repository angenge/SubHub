import React, { useState, useMemo } from 'react';
import {
  Layers,
  Search,
  Zap,
  Trash2,
  Filter,
  LayoutGrid,
  List,
  Loader2,
  Code2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { ProxyNode, Subscription } from '../../core/types/index.js';
import { LatencyBadge } from '../components/LatencyBadge.js';
import { CountryBadge } from '../components/CountryBadge.js';
import { NodeDetailModal } from '../components/NodeDetailModal.js';
import { formatDate } from '../lib/utils.js';

interface NodesTabProps {
  nodes: ProxyNode[];
  subscriptions: Subscription[];
  selectedSubscriptionId?: string;
  enableTcpPing?: boolean;
  onSelectSubscription: (id?: string) => void;
  onPingNode: (id: string) => Promise<void>;
  onPingAll: (subscriptionId?: string) => Promise<void>;
  onDeleteNode: (id: string) => void;
}

export const NodesTab: React.FC<NodesTabProps> = ({
  nodes,
  subscriptions,
  selectedSubscriptionId,
  enableTcpPing = true,
  onSelectSubscription,
  onPingNode,
  onPingAll,
  onDeleteNode,
}) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedProtocol, setSelectedProtocol] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  // Default to grid on mobile/pad for best touch experience, table on larger screens
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
    return window.innerWidth < 768 ? 'grid' : 'table';
  });
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [isPingingAll, setIsPingingAll] = useState(false);
  const [pingingNodeId, setPingingNodeId] = useState<string | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  // Detail Modal state
  const [selectedNodeForDetail, setSelectedNodeForDetail] = useState<ProxyNode | null>(null);

  // Extract all unique countries in the nodes
  const availableCountries = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of nodes) {
      if (n.country) {
        map.set(n.country, n.countryCode || 'OTHER');
      }
    }
    return Array.from(map.entries()).map(([country, code]) => ({ country, code }));
  }, [nodes]);

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    return nodes.filter((n) => {
      if (selectedSubscriptionId && n.subscriptionId !== selectedSubscriptionId) return false;
      if (selectedProtocol !== 'all' && n.type.toLowerCase() !== selectedProtocol.toLowerCase()) return false;
      if (selectedCountry !== 'all' && n.country !== selectedCountry) return false;
      if (selectedStatus !== 'all') {
        if (selectedStatus === 'online' && n.status !== 'online') return false;
        if (selectedStatus === 'slow' && n.status !== 'slow') return false;
        if (selectedStatus === 'timeout' && n.status !== 'timeout') return false;
        if (selectedStatus === 'unknown' && n.status !== 'unknown' && n.ping !== undefined) return false;
      }
      if (query) {
        const matchName = n.name.toLowerCase().includes(query);
        const matchServer = n.server.toLowerCase().includes(query);
        if (!matchName && !matchServer) return false;
      }
      return true;
    });
  }, [nodes, selectedSubscriptionId, selectedProtocol, selectedCountry, selectedStatus, debouncedSearch]);

  // Reset page when filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedSubscriptionId, selectedProtocol, selectedCountry, selectedStatus, debouncedSearch, pageSize]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredNodes.length / pageSize));
  const paginatedNodes = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredNodes.slice(start, start + pageSize);
  }, [filteredNodes, currentPage, pageSize]);

  const handlePingAll = async () => {
    setIsPingingAll(true);
    try {
      await onPingAll(selectedSubscriptionId);
    } finally {
      setIsPingingAll(false);
    }
  };

  const handlePingSingle = async (id: string) => {
    setPingingNodeId(id);
    try {
      await onPingNode(id);
    } finally {
      setPingingNodeId(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & Main Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            节点工作台
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 sm:mt-1">
            实时监测所有代理节点连通性与 TCP 握手延迟，支持查看复制原生配置与单节点调试
          </p>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs transition ${
                viewMode === 'table' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="表格视图"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs transition ${
                viewMode === 'grid' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="卡片网格"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {enableTcpPing && (
            <button
              onClick={handlePingAll}
              disabled={isPingingAll || nodes.length === 0}
              className="flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition active:scale-95 disabled:opacity-50"
            >
              {isPingingAll ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                  <span>测速中...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span>一键测速</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 sm:gap-3">
          {/* Search input */}
          <div className="sm:col-span-2 md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="搜索节点名、服务器或端口..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 text-xs text-slate-100 placeholder:text-slate-600 outline-none"
            />
          </div>

          {/* Subscription select */}
          <div>
            <select
              value={selectedSubscriptionId || 'all'}
              onChange={(e) => onSelectSubscription(e.target.value === 'all' ? undefined : e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-emerald-500"
            >
              <option value="all">所有订阅源 ({subscriptions.length})</option>
              {subscriptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.nodeCount})
                </option>
              ))}
            </select>
          </div>

          {/* Protocol select */}
          <div>
            <select
              value={selectedProtocol}
              onChange={(e) => setSelectedProtocol(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-emerald-500"
            >
              <option value="all">所有协议</option>
              <option value="vless">VLESS</option>
              <option value="vmess">VMess</option>
              <option value="trojan">Trojan</option>
              <option value="hysteria2">Hysteria2</option>
              <option value="ss">Shadowsocks</option>
            </select>
          </div>

          {/* Country select */}
          <div>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-emerald-500"
            >
              <option value="all">所有地区</option>
              {availableCountries.map((c) => (
                <option key={c.country} value={c.country}>
                  {c.country}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Status quick tabs */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-2 border-t border-slate-800/80 text-[11px] sm:text-xs">
          <span className="text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" />
            状态:
          </span>
          {[
            { id: 'all', label: `全部 (${nodes.length})` },
            { id: 'online', label: '🟢 在线' },
            { id: 'slow', label: '🟡 缓慢' },
            { id: 'timeout', label: '🔴 超时' },
            { id: 'unknown', label: '⚪ 未测' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedStatus(tab.id)}
              className={`px-2 sm:px-2.5 py-1 rounded-lg transition active:scale-95 ${
                selectedStatus === tab.id
                  ? 'bg-emerald-600/20 text-emerald-400 font-semibold border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <span className="ml-auto text-slate-500 text-[10px] sm:text-xs">
            匹配 <span className="text-white font-semibold">{filteredNodes.length}</span> 节点
          </span>
        </div>
      </div>

      {/* Content: Table or Grid */}
      {filteredNodes.length === 0 ? (
        <div className="text-center py-12 sm:py-16 rounded-2xl bg-slate-900/50 border border-slate-800 border-dashed text-slate-500 text-xs">
          未找到符合条件的节点
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW (with horizontal scroll on small devices) */
        <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 min-w-[640px]">
              <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 uppercase font-mono text-[10px] sm:text-[11px]">
                <tr>
                  <th className="py-3 px-3 sm:px-4">地区 / 节点名称</th>
                  <th className="py-3 px-3 sm:px-4">协议</th>
                  <th className="py-3 px-3 sm:px-4">服务器 : 端口</th>
                  <th className="py-3 px-3 sm:px-4">传输 / 加密</th>
                  <th className="py-3 px-3 sm:px-4">延迟状态</th>
                  <th className="py-3 px-3 sm:px-4">上次检测</th>
                  <th className="py-3 px-3 sm:px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {paginatedNodes.map((node) => {
                  const isPinging = pingingNodeId === node.id;
                  return (
                    <tr key={node.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 sm:py-3 px-3 sm:px-4">
                        <div className="flex items-center gap-2">
                          <CountryBadge country={node.country} code={node.countryCode} />
                          <span className="font-medium text-white truncate max-w-[160px] sm:max-w-xs">{node.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 sm:py-3 px-3 sm:px-4">
                        <span className="px-1.5 sm:px-2 py-0.5 rounded font-mono text-[10px] sm:text-[11px] bg-slate-800 text-sky-400 border border-slate-700/60 font-semibold uppercase">
                          {node.type}
                        </span>
                      </td>
                      <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-mono text-slate-400">
                        {node.server}:{node.port}
                      </td>
                      <td className="py-2.5 sm:py-3 px-3 sm:px-4 font-mono text-slate-400">
                        {node.network || 'tcp'} {node.tls ? '+ TLS' : ''}
                      </td>
                      <td className="py-2.5 sm:py-3 px-3 sm:px-4">
                        <LatencyBadge ping={node.ping} status={node.status} />
                      </td>
                      <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-slate-500 text-[11px]">{formatDate(node.lastCheckedAt)}</td>
                      <td className="py-2.5 sm:py-3 px-3 sm:px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelectedNodeForDetail(node)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition active:scale-95"
                            title="查看配置与一键复制"
                          >
                            <Code2 className="w-3.5 h-3.5" />
                          </button>
                          {enableTcpPing && (
                            <button
                              onClick={() => handlePingSingle(node.id)}
                              disabled={isPinging}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition disabled:opacity-50 active:scale-95"
                              title="测速"
                            >
                              <Zap className={`w-3.5 h-3.5 ${isPinging ? 'animate-bounce text-emerald-400' : ''}`} />
                            </button>
                          )}
                          <button
                            onClick={() => onDeleteNode(node.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition active:scale-95"
                            title="删除节点"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* GRID VIEW (Mobile/Pad Optimized Cards) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {paginatedNodes.map((node) => {
            const isPinging = pingingNodeId === node.id;
            return (
              <div
                key={node.id}
                className="rounded-2xl bg-slate-900 border border-slate-800 p-3.5 sm:p-4 hover:border-slate-700 transition space-y-2.5 sm:space-y-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 truncate">
                    <CountryBadge country={node.country} code={node.countryCode} />
                    <span className="font-semibold text-white text-xs truncate">{node.name}</span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded font-mono text-[9px] sm:text-[10px] bg-slate-800 text-sky-400 border border-slate-700 font-semibold uppercase shrink-0">
                    {node.type}
                  </span>
                </div>

                <div className="p-2 sm:p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1 font-mono text-[10px] sm:text-[11px] text-slate-400">
                  <div className="truncate">Host: {node.server}:{node.port}</div>
                  <div>Transport: {node.network || 'tcp'} {node.tls ? '+ TLS' : ''}</div>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <LatencyBadge ping={node.ping} status={node.status} />

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedNodeForDetail(node)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition active:scale-95"
                      title="查看配置与一键复制"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                    </button>
                    {enableTcpPing && (
                      <button
                        onClick={() => handlePingSingle(node.id)}
                        disabled={isPinging}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition active:scale-95"
                        title="单独测速"
                      >
                        <Zap className={`w-3.5 h-3.5 ${isPinging ? 'animate-bounce text-emerald-400' : ''}`} />
                      </button>
                    )}
                    <button
                      onClick={() => onDeleteNode(node.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition active:scale-95"
                      title="删除节点"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Bar */}
      {filteredNodes.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 text-[11px] sm:text-xs text-slate-400 border-t border-slate-800/80">
          <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
            <span>
              第 <strong className="text-white">{(currentPage - 1) * pageSize + 1}</strong>-
              <strong className="text-white">{Math.min(currentPage * pageSize, filteredNodes.length)}</strong> 条，共{' '}
              <strong className="text-white">{filteredNodes.length}</strong> 条
            </span>
            <span className="text-slate-600">|</span>
            <div className="flex items-center gap-1">
              <span>每页</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
              <span>条</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:hover:bg-slate-900 flex items-center gap-1 transition active:scale-95"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> 上页
            </button>
            <span className="px-2.5 py-1 font-mono text-slate-300">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:hover:bg-slate-900 flex items-center gap-1 transition active:scale-95"
            >
              下页 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Node Detail & Copy Modal */}
      <NodeDetailModal
        isOpen={!!selectedNodeForDetail}
        onClose={() => setSelectedNodeForDetail(null)}
        node={selectedNodeForDetail}
      />
    </div>
  );
};
