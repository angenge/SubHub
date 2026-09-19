#!/usr/bin/env node

/**
 * SubHub Probe Agent (边缘真实网络测速探针)
 *
 * 作用：在本地软路由、NAS、个人电脑等真实用户网络环境下运行，
 * 定期向云端 SubHub 拉取节点，进行并发 TCP 握手测速并将真实延迟回传落库。
 *
 * 无任何外部依赖，基于 Node.js 原生 net 与 fetch 模块构建。
 */

const net = require('net');

const SUBHUB_URL = (process.env.SUBHUB_URL || process.argv[2] || '').replace(/\/+$/, '');
const AGENT_SECRET = process.env.AGENT_SECRET || process.argv[3] || '';
const INTERVAL_MINUTES = parseInt(process.env.INTERVAL_MINUTES || '15', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '25', 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '2500', 10);

if (!SUBHUB_URL || !AGENT_SECRET) {
  console.error('\n❌ 缺少必要配置参数！');
  console.error('使用方法:');
  console.error('  方式 1 (环境变量):');
  console.error('    SUBHUB_URL="https://subhub.yourdomain.com" AGENT_SECRET="subprobe_xxx" node probe.js');
  console.error('  方式 2 (CLI 参数):');
  console.error('    node probe.js "https://subhub.yourdomain.com" "subprobe_xxx"\n');
  process.exit(1);
}

/**
 * TCP Ping 探针函数
 */
function tcpPing(host, port, timeout = TIMEOUT_MS) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      if (!settled) {
        settled = true;
        const duration = Date.now() - start;
        cleanup();
        resolve({ ping: duration });
      }
    });

    socket.on('timeout', () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve({ ping: -1, error: 'ETIMEDOUT' });
      }
    });

    socket.on('error', (err) => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve({ ping: -1, error: err.message || 'ECONNREFUSED' });
      }
    });

    try {
      socket.connect(port, host);
    } catch (e) {
      if (!settled) {
        settled = true;
        cleanup();
        resolve({ ping: -1, error: e.message });
      }
    }
  });
}

/**
 * 并发池执行测速
 */
async function batchPingNodes(nodes, concurrency = CONCURRENCY) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < nodes.length) {
      const currentIndex = index++;
      const node = nodes[currentIndex];
      try {
        const { ping, error } = await tcpPing(node.server, node.port);
        let status = 'unknown';
        if (ping === -1) {
          status = 'timeout';
        } else if (ping < 180) {
          status = 'online';
        } else if (ping < 350) {
          status = 'slow';
        } else {
          status = 'timeout';
        }

        results.push({
          nodeId: node.id,
          ping: ping >= 0 ? ping : null,
          status,
          checkedAt: new Date().toISOString(),
        });
      } catch (err) {
        results.push({
          nodeId: node.id,
          ping: null,
          status: 'timeout',
          checkedAt: new Date().toISOString(),
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, nodes.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * 执行单次拉取 ➔ 测速 ➔ 上报流程
 */
async function runProbeCycle() {
  const nowStr = new Date().toLocaleString();
  console.log(`\n[${nowStr}] 🚀 开始执行新一轮边缘网络节点测速...`);

  // 1. 获取待测节点列表
  let nodes = [];
  try {
    const res = await fetch(`${SUBHUB_URL}/api/agent/nodes`, {
      headers: {
        'Authorization': `Bearer ${AGENT_SECRET}`,
        'User-Agent': 'SubHub-Probe-Agent/1.0',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) {
      throw new Error(json.message || '获取节点数据异常');
    }
    nodes = json.data;
  } catch (err) {
    console.error(`❌ 获取节点列表失败: ${err.message}`);
    return;
  }

  if (nodes.length === 0) {
    console.log('ℹ️ 当前暂无待测节点（或所有订阅源均处于禁用状态）。');
    return;
  }

  console.log(`📦 成功拉取 ${nodes.length} 个待测节点，正在启动并发探针 (${CONCURRENCY} 并发)...`);
  const startTime = Date.now();

  // 2. 并发测速
  const pingResults = await batchPingNodes(nodes, CONCURRENCY);
  const durationMs = Date.now() - startTime;

  const onlineCount = pingResults.filter((r) => r.status === 'online').length;
  const slowCount = pingResults.filter((r) => r.status === 'slow').length;
  const timeoutCount = pingResults.filter((r) => r.status === 'timeout').length;

  console.log(`⚡ 测速完成 (耗时 ${durationMs}ms): 🟢 极速在线 ${onlineCount} | 🟡 良好缓慢 ${slowCount} | 🔴 超时不可用 ${timeoutCount}`);

  // 3. 打包批量回传落库
  console.log('📤 正在将测试结果批量回传至 SubHub 云端...');
  try {
    const reportRes = await fetch(`${SUBHUB_URL}/api/agent/report`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AGENT_SECRET}`,
        'Content-Type': 'application/json',
        'User-Agent': 'SubHub-Probe-Agent/1.0',
      },
      body: JSON.stringify({ results: pingResults }),
    });

    if (!reportRes.ok) {
      const errText = await reportRes.text();
      throw new Error(`HTTP ${reportRes.status}: ${errText}`);
    }

    const reportJson = await reportRes.json();
    if (!reportJson.success) {
      throw new Error(reportJson.message || '上报结果保存失败');
    }

    console.log(`✅ 成功同步 ${reportJson.data?.updatedCount || pingResults.length} 个节点的真实网络延迟至云端！`);
  } catch (err) {
    console.error(`❌ 上报测速结果失败: ${err.message}`);
  }
}

async function main() {
  console.log('====================================================');
  console.log('📡 SubHub 边缘网络测速探针 (Edge Probe Agent) 已启动');
  console.log(`🔗 目标 SubHub 服务: ${SUBHUB_URL}`);
  console.log(`⏱️ 探测轮询周期: ${INTERVAL_MINUTES} 分钟`);
  console.log(`⚡ 并发探测线程: ${CONCURRENCY}`);
  console.log('====================================================');

  // 立即执行首轮
  await runProbeCycle();

  // 定时执行后续轮次
  if (INTERVAL_MINUTES > 0) {
    setInterval(runProbeCycle, INTERVAL_MINUTES * 60 * 1000);
  }
}

main().catch((err) => {
  console.error('Fatal Probe Error:', err);
  process.exit(1);
});
