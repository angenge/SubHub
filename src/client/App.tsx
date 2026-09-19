import React, { useState, useEffect } from 'react';
import { Navbar, TabType } from './components/Navbar.js';
import { OverviewTab } from './pages/OverviewTab.js';
import { SubscriptionsTab } from './pages/SubscriptionsTab.js';
import { NodesTab } from './pages/NodesTab.js';
import { AggregatesTab } from './pages/AggregatesTab.js';
import { LoginPage } from './pages/LoginPage.js';
import { SubscriptionModal } from './components/SubscriptionModal.js';
import { AggregateModal } from './components/AggregateModal.js';
import { ExportModal } from './components/ExportModal.js';
import { ChangePasswordModal } from './components/ChangePasswordModal.js';
import { ProbeModal } from './components/ProbeModal.js';
import { SyncProgressModal, SyncProgressState, SyncItemLog } from './components/SyncProgressModal.js';
import {
  checkAuthStatus,
  getCapabilities,
  getAgentConfig,
  logout,
  getStats,
  getSubscriptions,
  getNodes,
  getAggregates,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  refreshSubscription,
  refreshAllSubscriptions,
  deleteNode,
  pingNode,
  pingAllNodes,
  createAggregate,
  updateAggregate,
  deleteAggregate,
  rotateAggregateToken,
} from './api/index.js';
import { Subscription, ProxyNode, AggregateGroup, DashboardStats, SystemCapabilities } from '../core/types/index.js';

export const App: React.FC = () => {
  // Auth & Capabilities state
  const [authLoading, setAuthLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(true);
  const [hasPasswordEnv, setHasPasswordEnv] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [capabilities, setCapabilities] = useState<SystemCapabilities | null>(null);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);

  // Business state
  const [currentTab, setCurrentTab] = useState<TabType>(() => {
    const hash = window.location.hash.replace('#', '');
    if (['overview', 'subscriptions', 'nodes', 'aggregates'].includes(hash)) {
      return hash as TabType;
    }
    return 'overview';
  });

  const handleSelectTab = (tab: TabType) => {
    setCurrentTab(tab);
    window.location.hash = tab;
  };
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [nodes, setNodes] = useState<ProxyNode[]>([]);
  const [aggregates, setAggregates] = useState<AggregateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [isPingingAllNodesState, setIsPingingAllNodesState] = useState(false);

  // Filter state for Nodes Tab
  const [selectedSubIdForNodes, setSelectedSubIdForNodes] = useState<string | undefined>(undefined);

  // Modals
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);

  const [isAggModalOpen, setIsAggModalOpen] = useState(false);
  const [editingAgg, setEditingAgg] = useState<AggregateGroup | null>(null);

  const [isProbeModalOpen, setIsProbeModalOpen] = useState(false);
  const [probeOnline, setProbeOnline] = useState(false);

  const [exportAgg, setExportAgg] = useState<AggregateGroup | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgressState | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const verifyAuth = async () => {
    try {
      const [status, caps] = await Promise.all([
        checkAuthStatus(),
        getCapabilities().catch(() => ({ platform: 'node', features: { tcpPing: true, cronScheduler: true, d1Storage: false } } as SystemCapabilities)),
      ]);
      setIsInitialized(status.initialized);
      setHasPasswordEnv(status.hasPasswordEnv);
      setIsAuthenticated(status.authenticated);
      setCapabilities(caps);
      if (status.authenticated) {
        await loadAllData();
      }
    } catch (err: any) {
      console.error('Auth status check error:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    verifyAuth();

    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      showToast('登录会话已过期，请重新登录', 'error');
    };

    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (['overview', 'subscriptions', 'nodes', 'aggregates'].includes(hash)) {
        setCurrentTab(hash as TabType);
      }
    };

    window.addEventListener('subhub:unauthorized', handleUnauthorized);
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('subhub:unauthorized', handleUnauthorized);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [sData, subsData, nodesData, aggsData, probeData] = await Promise.all([
        getStats(),
        getSubscriptions(),
        getNodes(),
        getAggregates(),
        getAgentConfig().catch(() => null),
      ]);
      setStats(sData);
      setSubscriptions(subsData);
      setNodes(nodesData);
      setAggregates(aggsData);
      if (probeData) {
        setProbeOnline(probeData.isOnline);
      }
    } catch (err: any) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = async () => {
    setIsAuthenticated(true);
    setIsInitialized(true);
    await loadAllData();
    showToast('登录成功，欢迎使用 SubHub');
  };

  const handleLogout = async () => {
    await logout();
    setIsAuthenticated(false);
    showToast('已退出登录');
  };

  const handleRefreshAll = async () => {
    if (subscriptions.length === 0) {
      showToast('暂无订阅源可同步');
      return;
    }

    setIsRefreshingAll(true);
    setIsSyncModalOpen(true);

    const initialLogs: SyncItemLog[] = subscriptions.map((s) => ({
      id: s.id,
      name: s.name,
      status: 'pending',
    }));

    const progressState: SyncProgressState = {
      total: subscriptions.length,
      completed: 0,
      successCount: 0,
      errorCount: 0,
      activeName: subscriptions[0]?.name,
      logs: initialLogs,
      isFinished: false,
    };

    setSyncProgress({ ...progressState });

    // Concurrency limit: 4
    const concurrency = 4;
    let index = 0;
    let active = 0;
    let completedCount = 0;
    let successCount = 0;
    let errorCount = 0;

    await new Promise<void>((resolve) => {
      const next = () => {
        if (completedCount >= subscriptions.length) {
          progressState.isFinished = true;
          progressState.activeName = undefined;
          setSyncProgress({ ...progressState });
          return resolve();
        }

        while (active < concurrency && index < subscriptions.length) {
          const currentIndex = index++;
          const sub = subscriptions[currentIndex];
          active++;

          // Mark item running
          progressState.logs = progressState.logs.map((l) =>
            l.id === sub.id ? { ...l, status: 'running' } : l
          );
          progressState.activeName = sub.name;
          setSyncProgress({ ...progressState });

          refreshSubscription(sub.id)
            .then((updatedSub) => {
              successCount++;
              progressState.successCount = successCount;
              progressState.logs = progressState.logs.map((l) =>
                l.id === sub.id
                  ? { ...l, status: 'success', nodeCount: updatedSub.nodeCount }
                  : l
              );
            })
            .catch((err) => {
              errorCount++;
              progressState.errorCount = errorCount;
              progressState.logs = progressState.logs.map((l) =>
                l.id === sub.id
                  ? { ...l, status: 'error', message: err.message || '拉取失败' }
                  : l
              );
            })
            .finally(() => {
              active--;
              completedCount++;
              progressState.completed = completedCount;
              setSyncProgress({ ...progressState });
              next();
            });
        }
      };

      next();
    });

    setIsRefreshingAll(false);
    await loadAllData();
    showToast(`全量同步完成: ${successCount} 成功，${errorCount} 失败`);
  };

  // Subscriptions Actions
  const handleCreateOrUpdateSub = async (payload: any) => {
    if (editingSub) {
      await updateSubscription(editingSub.id, payload);
      showToast('订阅更新成功');
    } else {
      const created = await createSubscription(payload);
      if (created && created.status === 'error') {
        showToast(`订阅已添加，但拉取失败: ${created.errorMessage || '请检查订阅链接是否有效'}`, 'error');
      } else {
        showToast('订阅已添加并成功解析节点');
      }
    }
    await loadAllData();
  };

  const handleToggleSubStatus = async (sub: Subscription) => {
    const nextStatus = sub.status === 'disabled' ? 'active' : 'disabled';
    try {
      await updateSubscription(sub.id, { status: nextStatus });
      showToast(nextStatus === 'disabled' ? `已禁用订阅「${sub.name}」` : `已启用订阅「${sub.name}」`);
      await loadAllData();
    } catch (err: any) {
      showToast(err.message || '切换订阅状态失败', 'error');
    }
  };

  const handleDeleteSub = async (id: string) => {
    if (!confirm('确定要删除此订阅源及其所有节点吗？')) return;
    try {
      await deleteSubscription(id);
      showToast('订阅已删除');
      await loadAllData();
    } catch (err: any) {
      showToast(err.message || '删除失败', 'error');
    }
  };

  const handleRefreshSub = async (id: string) => {
    try {
      await refreshSubscription(id);
      showToast('订阅刷新成功');
      await loadAllData();
    } catch (err: any) {
      showToast(err.message || '刷新失败', 'error');
      await loadAllData();
    }
  };

  // Nodes Actions
  const handlePingNode = async (id: string) => {
    try {
      const res = await pingNode(id);
      setNodes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ping: res.ping, status: res.status, lastCheckedAt: res.checkedAt } : n))
      );
      const updatedStats = await getStats();
      setStats(updatedStats);
    } catch (err: any) {
      showToast('测速失败', 'error');
    }
  };

  const handlePingAllNodes = async (subId?: string) => {
    setIsPingingAllNodesState(true);
    try {
      const results = await pingAllNodes(subId);
      const resultMap = new Map(results.map((r) => [r.nodeId, r]));
      setNodes((prev) =>
        prev.map((n) => {
          const r = resultMap.get(n.id);
          return r ? { ...n, ping: r.ping, status: r.status, lastCheckedAt: r.checkedAt } : n;
        })
      );
      const updatedStats = await getStats();
      setStats(updatedStats);
      showToast(`测速完成，已测试 ${results.length} 个节点`);
    } catch (err: any) {
      showToast('批量测速失败', 'error');
    } finally {
      setIsPingingAllNodesState(false);
    }
  };

  const handleDeleteNode = async (id: string) => {
    try {
      await deleteNode(id);
      setNodes((prev) => prev.filter((n) => n.id !== id));
      showToast('节点已删除');
      const updatedStats = await getStats();
      setStats(updatedStats);
    } catch (err: any) {
      showToast(err.message || '删除失败', 'error');
    }
  };

  // Aggregates Actions
  const handleCreateOrUpdateAgg = async (payload: any) => {
    if (editingAgg) {
      await updateAggregate(editingAgg.id, payload);
      showToast('聚合配置已更新');
    } else {
      await createAggregate(payload);
      showToast('新聚合配置已创建');
    }
    await loadAllData();
  };

  const handleDeleteAgg = async (id: string) => {
    if (!confirm('确定要删除此聚合配置吗？此操作将使外部订阅链接失效。')) return;
    try {
      await deleteAggregate(id);
      showToast('聚合配置已删除');
      await loadAllData();
    } catch (err: any) {
      showToast(err.message || '删除失败', 'error');
    }
  };

  const handleRotateToken = async (id: string) => {
    if (!confirm('轮换 Token 后，旧的订阅链接将立即失效，确定继续吗？')) return;
    try {
      await rotateAggregateToken(id);
      showToast('Token 轮换成功');
      await loadAllData();
    } catch (err: any) {
      showToast(err.message || '轮换失败', 'error');
    }
  };

  const handleToggleAggEnabled = async (id: string, enabled: boolean) => {
    try {
      await updateAggregate(id, { enabled });
      await loadAllData();
    } catch (err: any) {
      showToast('更新状态失败', 'error');
    }
  };

  const handleViewNodesForSub = (subId: string) => {
    setSelectedSubIdForNodes(subId);
    handleSelectTab('nodes');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  // Not authenticated or not initialized
  if (!isAuthenticated) {
    return (
      <>
        {toast && (
          <div className="fixed top-6 right-6 z-50 animate-in fade-in">
            <div
              className={`px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold border ${
                toast.type === 'error'
                  ? 'bg-rose-950 text-rose-300 border-rose-800'
                  : 'bg-emerald-950 text-emerald-300 border-emerald-800'
              }`}
            >
              {toast.message}
            </div>
          </div>
        )}
        <LoginPage isInitialized={isInitialized} onLoginSuccess={handleLoginSuccess} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-4">
          <div
            className={`px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold border ${
              toast.type === 'error'
                ? 'bg-rose-950 text-rose-300 border-rose-800'
                : 'bg-emerald-950 text-emerald-300 border-emerald-800'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      {/* Navbar */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        onRefreshAll={handleRefreshAll}
        isRefreshing={isRefreshingAll}
        hasPasswordEnv={hasPasswordEnv}
        onChangePasswordClick={() => setIsChangePasswordModalOpen(true)}
        onLogoutClick={handleLogout}
      />

      {/* Main Container (Extra bottom padding on mobile for bottom navigation bar) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 md:pb-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
            <span className="text-xs text-slate-400">正在加载 SubHub 工作区...</span>
          </div>
        ) : (
          <>
            {currentTab === 'overview' && (
              <OverviewTab
                stats={stats}
                subscriptions={subscriptions}
                enableTcpPing={capabilities?.features.tcpPing !== false}
                onNavigateTab={handleSelectTab}
                onRefreshAll={handleRefreshAll}
                onOpenAddSubscription={() => {
                  setEditingSub(null);
                  setIsSubModalOpen(true);
                }}
                onOpenAddAggregate={() => {
                  setEditingAgg(null);
                  setIsAggModalOpen(true);
                }}
                onPingAllNodes={() => handlePingAllNodes()}
                isPingingAll={isPingingAllNodesState}
              />
            )}

            {currentTab === 'subscriptions' && (
              <SubscriptionsTab
                subscriptions={subscriptions}
                onAdd={() => {
                  setEditingSub(null);
                  setIsSubModalOpen(true);
                }}
                onEdit={(sub) => {
                  setEditingSub(sub);
                  setIsSubModalOpen(true);
                }}
                onToggleStatus={handleToggleSubStatus}
                onDelete={handleDeleteSub}
                onRefresh={handleRefreshSub}
                onViewNodes={handleViewNodesForSub}
              />
            )}

            {currentTab === 'nodes' && (
              <NodesTab
                nodes={nodes}
                subscriptions={subscriptions}
                enableTcpPing={capabilities?.features.tcpPing !== false}
                selectedSubscriptionId={selectedSubIdForNodes}
                onSelectSubscription={setSelectedSubIdForNodes}
                onPingNode={handlePingNode}
                onPingAll={handlePingAllNodes}
                onDeleteNode={handleDeleteNode}
                onOpenProbeConfig={() => setIsProbeModalOpen(true)}
                probeOnline={probeOnline}
              />
            )}

            {currentTab === 'aggregates' && (
              <AggregatesTab
                aggregates={aggregates}
                subscriptions={subscriptions}
                onAdd={() => {
                  setEditingAgg(null);
                  setIsAggModalOpen(true);
                }}
                onEdit={(agg) => {
                  setEditingAgg(agg);
                  setIsAggModalOpen(true);
                }}
                onDelete={handleDeleteAgg}
                onRotateToken={handleRotateToken}
                onExport={setExportAgg}
                onToggleEnabled={handleToggleAggEnabled}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="hidden md:block border-t border-slate-800/60 py-6 text-center text-xs text-slate-500">
        <p>SubHub &copy; 2026 - 智能 VPN 订阅管理聚合与探针平台</p>
      </footer>

      {/* Subscription Modal */}
      <SubscriptionModal
        isOpen={isSubModalOpen}
        onClose={() => {
          setIsSubModalOpen(false);
          setEditingSub(null);
        }}
        onSubmit={handleCreateOrUpdateSub}
        initialData={editingSub}
      />

      {/* Aggregate Modal */}
      <AggregateModal
        isOpen={isAggModalOpen}
        onClose={() => {
          setIsAggModalOpen(false);
          setEditingAgg(null);
        }}
        onSubmit={handleCreateOrUpdateAgg}
        initialData={editingAgg}
        subscriptions={subscriptions}
        enableTcpPing={capabilities?.features.tcpPing !== false}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={!!exportAgg}
        onClose={() => setExportAgg(null)}
        aggregate={exportAgg}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
        onSuccess={() => showToast('密码修改成功')}
        hasPasswordEnv={hasPasswordEnv}
      />

      {/* Probe Config Modal */}
      <ProbeModal
        isOpen={isProbeModalOpen}
        onClose={() => setIsProbeModalOpen(false)}
        onSecretChanged={loadAllData}
      />

      {/* Sync Progress Modal */}
      <SyncProgressModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        progress={syncProgress}
      />
    </div>
  );
};
