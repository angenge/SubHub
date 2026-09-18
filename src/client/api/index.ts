import { Subscription, ProxyNode, AggregateGroup, DashboardStats, PingResult, AccessLog, SyncLog, SystemCapabilities } from '../../core/types/index.js';

const API_BASE = '/api';
const TOKEN_KEY = 'subhub_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function safeFetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options?.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const res = await fetch(url, { ...options, headers });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`服务器响应异常 (HTTP ${res.status}): ${text.slice(0, 100) || '无法连接到后端服务'}`);
    }

    if (res.status === 401 && json.code === 'UNAUTHORIZED') {
      clearStoredToken();
      window.dispatchEvent(new Event('subhub:unauthorized'));
    }

    if (!res.ok || json.success === false) {
      throw new Error(json.message || `请求失败 (HTTP ${res.status})`);
    }

    return json.data as T;
  } catch (err: any) {
    if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
      throw new Error('无法连接到 SubHub 后端服务，请确认服务端已启动 (端口 3000)');
    }
    throw err;
  }
}

// ================= System API =================
export async function getCapabilities(): Promise<SystemCapabilities> {
  return safeFetchJson<SystemCapabilities>(`${API_BASE}/system/capabilities`);
}

// ================= Auth API =================
export interface AuthStatus {
  initialized: boolean;
  hasPasswordEnv: boolean;
  authenticated: boolean;
}

export async function checkAuthStatus(): Promise<AuthStatus> {
  return safeFetchJson<AuthStatus>(`${API_BASE}/auth/status`);
}

export async function initPassword(password: string): Promise<{ token: string }> {
  const res = await safeFetchJson<{ token: string }>(`${API_BASE}/auth/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.token) {
    setStoredToken(res.token);
  }
  return res;
}

export async function login(password: string): Promise<{ token: string }> {
  const res = await safeFetchJson<{ token: string }>(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.token) {
    setStoredToken(res.token);
  }
  return res;
}

export async function logout(): Promise<void> {
  try {
    await safeFetchJson<void>(`${API_BASE}/auth/logout`, { method: 'POST' });
  } finally {
    clearStoredToken();
  }
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<{ token?: string }> {
  const res = await safeFetchJson<{ token?: string }>(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  if (res?.token) {
    setStoredToken(res.token);
  }
  return res;
}

// ================= Business API =================

export async function getStats(): Promise<DashboardStats> {
  return safeFetchJson<DashboardStats>(`${API_BASE}/stats`);
}

export async function getSubscriptions(): Promise<Subscription[]> {
  return safeFetchJson<Subscription[]>(`${API_BASE}/subscriptions`);
}

export async function createSubscription(payload: {
  name: string;
  url: string;
  customUserAgent?: string;
  autoUpdate?: boolean;
  updateInterval?: number;
}): Promise<Subscription> {
  return safeFetchJson<Subscription>(`${API_BASE}/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateSubscription(id: string, payload: Partial<Subscription>): Promise<Subscription> {
  return safeFetchJson<Subscription>(`${API_BASE}/subscriptions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteSubscription(id: string): Promise<void> {
  await safeFetchJson<void>(`${API_BASE}/subscriptions/${id}`, { method: 'DELETE' });
}

export async function refreshSubscription(id: string): Promise<Subscription> {
  return safeFetchJson<Subscription>(`${API_BASE}/subscriptions/${id}/refresh`, { method: 'POST' });
}

export async function refreshAllSubscriptions(): Promise<void> {
  await safeFetchJson<void>(`${API_BASE}/subscriptions/refresh-all`, { method: 'POST' });
}

export async function getNodes(subscriptionId?: string): Promise<ProxyNode[]> {
  const url = subscriptionId ? `${API_BASE}/nodes?subscriptionId=${subscriptionId}` : `${API_BASE}/nodes`;
  return safeFetchJson<ProxyNode[]>(url);
}

export async function deleteNode(id: string): Promise<void> {
  await safeFetchJson<void>(`${API_BASE}/nodes/${id}`, { method: 'DELETE' });
}

export async function pingNode(id: string): Promise<PingResult> {
  return safeFetchJson<PingResult>(`${API_BASE}/nodes/${id}/ping`, { method: 'POST' });
}

export async function pingAllNodes(subscriptionId?: string): Promise<PingResult[]> {
  const url = subscriptionId ? `${API_BASE}/nodes/ping-all?subscriptionId=${subscriptionId}` : `${API_BASE}/nodes/ping-all`;
  return safeFetchJson<PingResult[]>(url, { method: 'POST' });
}

export async function getAggregates(): Promise<AggregateGroup[]> {
  return safeFetchJson<AggregateGroup[]>(`${API_BASE}/aggregates`);
}

export async function createAggregate(payload: Partial<AggregateGroup> & { name: string }): Promise<AggregateGroup> {
  return safeFetchJson<AggregateGroup>(`${API_BASE}/aggregates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateAggregate(id: string, payload: Partial<AggregateGroup>): Promise<AggregateGroup> {
  return safeFetchJson<AggregateGroup>(`${API_BASE}/aggregates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteAggregate(id: string): Promise<void> {
  await safeFetchJson<void>(`${API_BASE}/aggregates/${id}`, { method: 'DELETE' });
}

export async function rotateAggregateToken(id: string): Promise<AggregateGroup> {
  return safeFetchJson<AggregateGroup>(`${API_BASE}/aggregates/${id}/rotate-token`, { method: 'POST' });
}

export async function getAggregateLogs(id: string): Promise<AccessLog[]> {
  return safeFetchJson<AccessLog[]>(`${API_BASE}/aggregates/${id}/logs`);
}

export async function clearAggregateLogs(id: string): Promise<void> {
  await safeFetchJson<void>(`${API_BASE}/aggregates/${id}/logs`, { method: 'DELETE' });
}

export async function getSyncLogs(subscriptionId?: string, limit: number = 100): Promise<SyncLog[]> {
  const url = subscriptionId
    ? `${API_BASE}/sync-logs?subscriptionId=${subscriptionId}&limit=${limit}`
    : `${API_BASE}/sync-logs?limit=${limit}`;
  return safeFetchJson<SyncLog[]>(url);
}

export async function clearSyncLogs(subscriptionId?: string): Promise<void> {
  const url = subscriptionId ? `${API_BASE}/sync-logs?subscriptionId=${subscriptionId}` : `${API_BASE}/sync-logs`;
  await safeFetchJson<void>(url, { method: 'DELETE' });
}
