import { Hono } from 'hono';
import {
  getAllSubscriptions,
  createSubscription,
  updateSubscriptionSettings,
  deleteSubscription,
  refreshSubscription,
  getSyncLogs,
  clearSyncLogs,
} from '../services/subscriptionService.js';
import {
  getAllNodes,
  getPaginatedNodes,
  deleteNode,
  pingSingleNode,
  pingAllNodes,
} from '../services/nodeService.js';
import {
  getAllAggregates,
  createAggregate,
  updateAggregate,
  deleteAggregate,
  rotateAggregateToken,
  getAggregateLogs,
  clearAggregateLogs,
} from '../services/aggregateService.js';
import { getDashboardStats } from '../services/statsService.js';
import { getSystemCapabilities } from '../config/capabilities.js';
import {
  getAuthStatus,
  initOrUpdatePassword,
  verifyPassword,
  createSessionToken,
  validateSessionToken,
  revokeSessionToken,
} from '../services/authService.js';
import { checkRateLimit, getClientIpFromContext } from '../utils/rateLimiter.js';

export const api = new Hono();

// ================= System & Capabilities (Public) =================
api.get('/system/capabilities', (c) => {
  const capabilities = getSystemCapabilities();
  return c.json({ success: true, data: capabilities });
});

// ================= Auth Routes (Public) =================
api.get('/auth/status', async (c) => {
  const status = await getAuthStatus();
  const authHeader = c.req.header('Authorization');
  const isAuthenticated = await validateSessionToken(authHeader);

  return c.json({
    success: true,
    data: {
      initialized: status.initialized,
      hasPasswordEnv: status.hasPasswordEnv,
      authenticated: isAuthenticated,
    },
  });
});

api.post('/auth/init', async (c) => {
  try {
    const status = await getAuthStatus();
    if (status.initialized && !status.hasPasswordEnv) {
      return c.json({ success: false, message: '系统已初始化密码，请直接登录' }, 400);
    }
    const body = await c.req.json();
    if (!body.password || body.password.length < 4) {
      return c.json({ success: false, message: '密码长度至少为 4 位' }, 400);
    }
    await initOrUpdatePassword(body.password);
    const token = await createSessionToken();
    return c.json({ success: true, data: { token, message: '管理员密码初始化成功' } });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

api.post('/auth/login', async (c) => {
  try {
    const clientIp = getClientIpFromContext(c);
    // Max 8 login attempts per minute per IP
    const rateLimit = checkRateLimit('auth_login', clientIp, { maxRequests: 8, windowMs: 60 * 1000 });
    if (!rateLimit.allowed) {
      return c.json({
        success: false,
        message: `尝试次数过多，请在 ${rateLimit.retryAfterSec} 秒后重试`,
      }, 429);
    }

    const body = await c.req.json();
    const { password } = body;
    if (!password) {
      return c.json({ success: false, message: '请输入密码' }, 400);
    }

    const isValid = await verifyPassword(password);
    if (!isValid) {
      return c.json({ success: false, message: '密码错误，请重试' }, 401);
    }

    const token = await createSessionToken();
    return c.json({ success: true, data: { token, message: '登录成功' } });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

api.post('/auth/logout', (c) => {
  const authHeader = c.req.header('Authorization');
  revokeSessionToken(authHeader);
  return c.json({ success: true, message: '已退出登录' });
});

api.post('/auth/change-password', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!(await validateSessionToken(authHeader))) {
      return c.json({ success: false, message: '未授权或登录已过期' }, 401);
    }

    const authStatus = await getAuthStatus();
    if (authStatus.hasPasswordEnv) {
      return c.json({
        success: false,
        message: '当前密码由环境变量 ADMIN_PASSWORD 管理，不支持在线修改',
      }, 400);
    }

    const body = await c.req.json();
    const { oldPassword, newPassword } = body;
    if (!newPassword || newPassword.length < 4) {
      return c.json({ success: false, message: '新密码长度至少为 4 位' }, 400);
    }

    if (!(await verifyPassword(oldPassword))) {
      return c.json({ success: false, message: '原密码错误' }, 400);
    }

    await initOrUpdatePassword(newPassword);
    const token = await createSessionToken();
    return c.json({ success: true, data: { token }, message: '密码修改成功' });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// ================= Auth Middleware for Protected API =================
api.use('*', async (c, next) => {
  if (c.req.path.startsWith('/auth') || c.req.path.startsWith('/system')) {
    return next();
  }

  const authStatus = await getAuthStatus();
  if (!authStatus.initialized) {
    return c.json({
      success: false,
      message: '系统尚未初始化管理员密码，请先完成初始化',
      code: 'UNINITIALIZED',
    }, 403);
  }

  const authHeader = c.req.header('Authorization');
  if (!(await validateSessionToken(authHeader))) {
    return c.json({ success: false, message: '未授权，请先登录', code: 'UNAUTHORIZED' }, 401);
  }

  return next();
});

// ================= Protected Routes =================

// Dashboard Stats
api.get('/stats', async (c) => {
  const stats = await getDashboardStats();
  return c.json({ success: true, data: stats });
});

// Subscriptions CRUD
api.get('/subscriptions', async (c) => {
  const subs = await getAllSubscriptions();
  return c.json({ success: true, data: subs });
});

api.post('/subscriptions', async (c) => {
  try {
    const body = await c.req.json();
    if (!body.name || !body.url) {
      return c.json({ success: false, message: 'Name and URL are required' }, 400);
    }
    const sub = await createSubscription(body);
    return c.json({ success: true, data: sub });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

api.put('/subscriptions/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const updated = await updateSubscriptionSettings(id, body);
    return c.json({ success: true, data: updated });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

api.delete('/subscriptions/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await deleteSubscription(id);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

api.post('/subscriptions/:id/refresh', async (c) => {
  try {
    const id = c.req.param('id');
    const updated = await refreshSubscription(id, 'manual');
    return c.json({ success: true, data: updated });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

api.post('/subscriptions/refresh-all', async (c) => {
  try {
    const subs = await getAllSubscriptions();
    const tasks = subs.map(async (sub: any) => {
      try {
        const res = await refreshSubscription(sub.id, 'manual');
        return { id: sub.id, name: sub.name, success: true, nodeCount: res?.nodeCount || 0, data: res };
      } catch (err: any) {
        return { id: sub.id, name: sub.name, success: false, error: err.message };
      }
    });

    const settled = await Promise.allSettled(tasks);
    const results = settled.map((s) => (s.status === 'fulfilled' ? s.value : { success: false, error: 'Unknown' }));
    return c.json({ success: true, data: results });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// Subscription Sync Logs
api.get('/sync-logs', async (c) => {
  try {
    const subscriptionId = c.req.query('subscriptionId');
    const limitParam = c.req.query('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 100;
    const logs = await getSyncLogs(subscriptionId, limit);
    return c.json({ success: true, data: logs });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

api.delete('/sync-logs', async (c) => {
  try {
    const subscriptionId = c.req.query('subscriptionId');
    await clearSyncLogs(subscriptionId);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// Nodes
api.get('/nodes', async (c) => {
  const subscriptionId = c.req.query('subscriptionId');
  const page = c.req.query('page');
  const pageSize = c.req.query('pageSize');
  const search = c.req.query('search');
  const protocol = c.req.query('protocol');
  const country = c.req.query('country');
  const status = c.req.query('status');

  if (page !== undefined || pageSize !== undefined) {
    const result = await getPaginatedNodes({
      subscriptionId,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      search,
      protocol,
      country,
      status,
    });
    return c.json({ success: true, data: result });
  }

  const nodes = await getAllNodes(subscriptionId);
  return c.json({ success: true, data: nodes });
});

api.delete('/nodes/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await deleteNode(id);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

api.post('/nodes/:id/ping', async (c) => {
  try {
    const capabilities = getSystemCapabilities();
    if (!capabilities.features.tcpPing) {
      return c.json({
        success: false,
        message: '当前环境已关闭服务端 TCP 测速功能，请在客户端中使用自动选择策略组进行延迟探测',
      }, 400);
    }

    const id = c.req.param('id');
    const res = await pingSingleNode(id);
    return c.json({ success: true, data: res });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

api.post('/nodes/ping-all', async (c) => {
  try {
    const capabilities = getSystemCapabilities();
    if (!capabilities.features.tcpPing) {
      return c.json({
        success: false,
        message: '当前环境已关闭服务端 TCP 测速功能，请在客户端中使用自动选择策略组进行延迟探测',
      }, 400);
    }

    const subscriptionId = c.req.query('subscriptionId');
    const results = await pingAllNodes(subscriptionId);
    return c.json({ success: true, data: results });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

// Aggregates CRUD
api.get('/aggregates', async (c) => {
  const aggs = await getAllAggregates();
  return c.json({ success: true, data: aggs });
});

api.post('/aggregates', async (c) => {
  try {
    const body = await c.req.json();
    if (!body.name) {
      return c.json({ success: false, message: 'Name is required' }, 400);
    }
    const agg = await createAggregate(body);
    return c.json({ success: true, data: agg });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

api.put('/aggregates/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const updated = await updateAggregate(id, body);
    return c.json({ success: true, data: updated });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

api.delete('/aggregates/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await deleteAggregate(id);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

api.post('/aggregates/:id/rotate-token', async (c) => {
  try {
    const id = c.req.param('id');
    const updated = await rotateAggregateToken(id);
    return c.json({ success: true, data: updated });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

api.get('/aggregates/:id/logs', async (c) => {
  try {
    const id = c.req.param('id');
    const logs = await getAggregateLogs(id);
    return c.json({ success: true, data: logs });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});

api.delete('/aggregates/:id/logs', async (c) => {
  try {
    const id = c.req.param('id');
    await clearAggregateLogs(id);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ success: false, message: err.message }, 500);
  }
});
