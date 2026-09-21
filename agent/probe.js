#!/usr/bin/env node

/**
 * SubHub Probe Agent (边缘真实网络测速探针)
 *
 * 作用：在本地软路由、NAS、个人电脑等真实用户网络环境下运行，
 * 内嵌或对接 Mihomo (Clash.Meta) 内核，对全协议代理节点（包括 Hysteria2、TUIC、VLESS Reality 等）
 * 执行真实 URL-Test 测速并将准确的全链路延迟与存活状态回传云端落库。
 *
 * 无需任何外部 npm 依赖，基于 Node.js 原生模块构建。
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import stream from 'node:stream';
import util from 'node:util';
import { spawn, execSync } from 'node:child_process';

const streamPipeline = util.promisify(stream.pipeline);

// 强制刷新输出流缓冲区，防止在 Docker 容器或无 TTY 环境中出现输出卡顿
if (process.stdout._handle && process.stdout._handle.setBlocking) {
  process.stdout._handle.setBlocking(true);
}

const SUBHUB_URL = (process.env.SUBHUB_URL || process.argv[2] || '').replace(/\/+$/, '');
const AGENT_SECRET = (process.env.AGENT_SECRET || process.argv[3] || '').trim();
const INTERVAL_MINUTES = parseInt(process.env.INTERVAL_MINUTES || '15', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '20', 10);
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '8000', 10);
const TEST_URL = process.env.TEST_URL || 'https://cp.cloudflare.com/generate_204';
const MIHOMO_BIN = process.env.MIHOMO_PATH || (process.platform === 'win32' ? 'mihomo.exe' : 'mihomo');
const MIHOMO_PORT = parseInt(process.env.MIHOMO_PORT || '9090', 10);
const MIHOMO_API = `http://127.0.0.1:${MIHOMO_PORT}`;

const PROBE_TMP_DIR = path.join(os.tmpdir(), 'subhub_probe');
const PROBE_CONFIG_PATH = path.join(PROBE_TMP_DIR, 'config.yaml');

let mihomoProcess = null;

console.log('====================================================');
console.log('📡 SubHub 边缘网络测速探针 (Edge Mihomo Probe Agent)');
console.log(`🔗 目标云端地址: ${SUBHUB_URL || '(未指定)'}`);
console.log(`🔑 探针密钥状态: ${AGENT_SECRET ? '已配置 (' + AGENT_SECRET.slice(0, 10) + '...)' : '❌ 未配置'}`);
console.log(`⏱️ 测速周期: 每 ${INTERVAL_MINUTES} 分钟自动执行一次`);
console.log(`⚡ 探测并发: ${CONCURRENCY} 线程 | 超时: ${TIMEOUT_MS}ms`);
console.log(`🎯 测速基准 URL: ${TEST_URL}`);
console.log(`⚙️ 控制器端口: ${MIHOMO_PORT}`);
console.log('====================================================');

if (!SUBHUB_URL || !AGENT_SECRET) {
  console.error('\n❌ 启动失败: 缺少必要配置参数！');
  console.error('使用方法:');
  console.error('  SUBHUB_URL="https://subhub.hiz.one" AGENT_SECRET="subprobe_xxx" node probe.js\n');
  process.exit(1);
}

// 保证退出时清理子进程
function cleanupAndExit(code = 0) {
  if (mihomoProcess && !mihomoProcess.killed) {
    try {
      console.log('🛑 正在关闭 Mihomo 内核进程...');
      mihomoProcess.kill('SIGTERM');
    } catch {}
  }
  process.exit(code);
}

process.on('SIGINT', () => cleanupAndExit(0));
process.on('SIGTERM', () => cleanupAndExit(0));
process.on('exit', () => cleanupAndExit(0));

/**
 * 自动定位或下载适配当前系统架构的 Mihomo 内核二进制
 */
async function resolveMihomoBinary() {
  // 1. 如果用户显式指定了环境变量 MIHOMO_PATH，优先使用
  if (process.env.MIHOMO_PATH) {
    if (fs.existsSync(process.env.MIHOMO_PATH)) {
      return process.env.MIHOMO_PATH;
    }
  }

  // 2. 检查系统 PATH 中是否存在 mihomo
  const binName = process.platform === 'win32' ? 'mihomo.exe' : 'mihomo';
  try {
    const checkCmd = process.platform === 'win32' ? `where ${binName}` : `which ${binName}`;
    const result = execSync(checkCmd, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf-8' }).trim();
    if (result) return binName;
  } catch {}

  // 3. 检查当前工作目录或探针临时目录中是否已有内核
  const localBin = path.join(PROBE_TMP_DIR, binName);
  if (fs.existsSync(localBin)) {
    try {
      fs.accessSync(localBin, fs.constants.X_OK);
      return localBin;
    } catch {
      try { fs.chmodSync(localBin, 0o755); return localBin; } catch {}
    }
  }

  const cwdBin = path.join(process.cwd(), binName);
  if (fs.existsSync(cwdBin)) {
    try {
      fs.accessSync(cwdBin, fs.constants.X_OK);
      return cwdBin;
    } catch {
      try { fs.chmodSync(cwdBin, 0o755); return cwdBin; } catch {}
    }
  }

  // 4. Windows 平台提示手动下载
  if (process.platform === 'win32') {
    throw new Error('未在当前目录或 PATH 中找到 mihomo.exe，请从 https://github.com/MetaCubeX/mihomo/releases 下载并放置在当前目录。');
  }

  // 5. Linux / macOS 自动拉取官方最新稳定内核并解压
  if (!fs.existsSync(PROBE_TMP_DIR)) {
    fs.mkdirSync(PROBE_TMP_DIR, { recursive: true });
  }

  const archMap = { x64: 'amd64', arm64: 'arm64', arm: 'armv7', ia32: '386' };
  const arch = archMap[process.arch] || 'amd64';
  const osType = process.platform === 'darwin' ? 'darwin' : 'linux';
  const ver = 'v1.19.31';
  const fileName = `mihomo-${osType}-${arch}-${ver}.gz`;

  console.log(`📥 未在本地检测到 Mihomo 内核，正在自动下载适配 [${osType}/${arch}] 的稳定内核...`);

  const mirrors = [
    `https://github.com/MetaCubeX/mihomo/releases/download/${ver}/${fileName}`,
    `https://ghfast.top/https://github.com/MetaCubeX/mihomo/releases/download/${ver}/${fileName}`,
    `https://ghproxy.net/https://github.com/MetaCubeX/mihomo/releases/download/${ver}/${fileName}`,
  ];

  let downloaded = false;
  for (const url of mirrors) {
    try {
      const hostname = new URL(url).hostname;
      console.log(`  ➔ 正在通过 ${hostname} 下载内核...`);
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(45000) });
      if (res.ok && res.body) {
        await streamPipeline(
          stream.Readable.fromWeb(res.body),
          zlib.createGunzip(),
          fs.createWriteStream(localBin)
        );
        fs.chmodSync(localBin, 0o755);
        downloaded = true;
        console.log(`✅ Mihomo 内核已成功就绪: ${localBin}`);
        break;
      }
    } catch (err) {
      console.warn(`  ⚠️ 下载尝试遇到问题 (${err.message})，尝试切换下一源...`);
    }
  }

  if (!downloaded || !fs.existsSync(localBin)) {
    throw new Error(`自动下载 Mihomo 内核失败，请手动下载 ${fileName} 解压并放置为当前目录下的 mihomo。`);
  }

  return localBin;
}

/**
 * 检查并确保 Mihomo 内核正在后台运行
 */
async function ensureMihomoRunning() {
  // 1. 检查是否已经有活跃的 Mihomo API 监听对应端口
  try {
    const res = await fetch(`${MIHOMO_API}/version`, { signal: AbortSignal.timeout(1000) });
    if (res.ok) {
      const data = await res.json();
      console.log(`✨ 检测到现存 Mihomo 实例: version ${data.version || 'unknown'}`);
      return;
    }
  } catch {}

  // 2. 查找或自动下载 Mihomo 二进制
  const binPath = await resolveMihomoBinary();

  // 3. 准备初始目录与配置
  if (!fs.existsSync(PROBE_TMP_DIR)) {
    fs.mkdirSync(PROBE_TMP_DIR, { recursive: true });
  }

  // 写入初始空配置，允许外控 API 启动
  const initialConfig = `
mixed-port: 0
allow-lan: false
mode: direct
log-level: silent
external-controller: 127.0.0.1:${MIHOMO_PORT}
dns:
  enable: false
proxies: []
rules:
  - MATCH,DIRECT
`;
  fs.writeFileSync(PROBE_CONFIG_PATH, initialConfig.trim(), 'utf-8');

  console.log(`🚀 正在启动后台 Mihomo 内核 (${binPath})...`);

  try {
    mihomoProcess = spawn(binPath, ['-d', PROBE_TMP_DIR, '-f', PROBE_CONFIG_PATH], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    mihomoProcess.stdout.on('data', (d) => {
      const msg = d.toString().trim();
      if (process.env.DEBUG) console.log(`[Mihomo] ${msg}`);
    });

    mihomoProcess.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (process.env.DEBUG || msg.includes('level=error') || msg.includes('level=fatal')) {
        console.error(`[Mihomo Error] ${msg}`);
      }
    });

    mihomoProcess.on('error', (err) => {
      console.error(`\n❌ 无法启动 Mihomo 内核: ${err.message}`);
      cleanupAndExit(1);
    });

    mihomoProcess.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        console.error(`\n❌ Mihomo 进程意外退出 (code: ${code}, signal: ${signal})`);
      }
    });

    // 等待启动就绪 (最多等待 15 秒，轮询间隔动态递增)
    const maxRetries = 30;
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const res = await fetch(`${MIHOMO_API}/version`, { signal: AbortSignal.timeout(1000) });
        if (res.ok) {
          const data = await res.json();
          console.log(`✅ Mihomo 内核就绪: version ${data.version || 'Meta'}`);
          return;
        }
      } catch {}
    }
    throw new Error(`Mihomo 启动超时 (已等待 15s)，未能响应 ${MIHOMO_API}/version`);
  } catch (err) {
    console.error(`❌ 启动 Mihomo 失败: ${err.message}`);
    cleanupAndExit(1);
  }
}

/**
 * 重新加载 Mihomo 代理配置
 */
async function reloadMihomoConfig(clashYaml) {
  // 确保外控端口与配置要求一致
  let configToSave = clashYaml;
  if (!configToSave.includes('external-controller')) {
    configToSave = `external-controller: 127.0.0.1:${MIHOMO_PORT}\n` + configToSave;
  }

  fs.writeFileSync(PROBE_CONFIG_PATH, configToSave, 'utf-8');

  const res = await fetch(`${MIHOMO_API}/configs?force=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: PROBE_CONFIG_PATH }),
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Mihomo 配置重载失败: HTTP ${res.status} ${errText}`);
  }
}

let apiErrorLogged = false;

/**
 * 通过 Mihomo 官方 URL-Test 接口单节点测速
 */
async function testNodeDelay(nodeName, timeoutMs = TIMEOUT_MS) {
  const url = `${MIHOMO_API}/proxies/${encodeURIComponent(nodeName)}/delay?timeout=${timeoutMs}&url=${encodeURIComponent(TEST_URL)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs + 2000) });
    if (!res.ok) {
      return { ping: -1, status: 'timeout' };
    }
    const data = await res.json();
    const delay = typeof data.delay === 'number' ? data.delay : -1;

    if (delay <= 0) {
      return { ping: -1, status: 'timeout' };
    } else if (delay < 450) {
      return { ping: delay, status: 'online' };
    } else {
      return { ping: delay, status: 'slow' };
    }
  } catch (err) {
    if (!apiErrorLogged && (err.code === 'ECONNREFUSED' || (err.cause && err.cause.code === 'ECONNREFUSED'))) {
      apiErrorLogged = true;
      console.error(`\n⚠️ 警告: 无法连接本地 Mihomo API (${MIHOMO_API})，请确认内核进程是否存活！`);
    }
    return { ping: -1, status: 'timeout' };
  }
}

/**
 * 并发池执行测速
 */
async function batchTestNodes(nodes, concurrency = CONCURRENCY) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < nodes.length) {
      const currentIndex = index++;
      const node = nodes[currentIndex];
      try {
        const { ping, status } = await testNodeDelay(node.name, TIMEOUT_MS);
        results.push({
          nodeId: node.id,
          ping: ping >= 0 ? ping : null,
          status,
          checkedAt: new Date().toISOString(),
        });
      } catch {
        results.push({
          nodeId: node.id,
          ping: null,
          status: 'timeout',
          checkedAt: new Date().toISOString(),
        });
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, nodes.length));
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * 执行单次拉取 ➔ 测速 ➔ 上报流程
 */
async function runProbeCycle() {
  const nowStr = new Date().toLocaleString();
  console.log(`\n[${nowStr}] 🚀 正在连接云端拉取待测节点...`);

  // 1. 获取待测节点列表及 Clash 格式配置
  let nodes = [];
  let clashConfig = '';
  try {
    const res = await fetch(`${SUBHUB_URL}/api/agent/nodes`, {
      headers: {
        'Authorization': `Bearer ${AGENT_SECRET}`,
        'User-Agent': 'SubHub-Probe-Agent/2.0',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const json = await res.json();
    if (!json.success || !json.data) {
      throw new Error(json.message || '获取节点数据异常');
    }

    // 兼容数组（旧协议）与对象格式（新协议）
    if (Array.isArray(json.data)) {
      nodes = json.data;
    } else {
      nodes = json.data.nodes || [];
      clashConfig = json.data.clashConfig || '';
    }
  } catch (err) {
    console.error(`❌ 拉取失败: ${err.message}`);
    return;
  }

  if (nodes.length === 0) {
    console.log('ℹ️ 当前暂无可用待测节点（或所有订阅源均处于禁用状态）。');
    return;
  }

  // 2. 将配置热加载到 Mihomo 内核
  if (clashConfig) {
    try {
      await reloadMihomoConfig(clashConfig);
    } catch (err) {
      console.error(`❌ 加载配置到 Mihomo 失败: ${err.message}`);
      return;
    }
  }

  console.log(`📦 成功拉取 ${nodes.length} 个节点，正在执行本地真实 URL-Test 并发探针 (${CONCURRENCY} 并发)...`);
  const startTime = Date.now();

  // 3. 并发测速
  const pingResults = await batchTestNodes(nodes, CONCURRENCY);
  const durationMs = Date.now() - startTime;

  const onlineCount = pingResults.filter((r) => r.status === 'online').length;
  const slowCount = pingResults.filter((r) => r.status === 'slow').length;
  const timeoutCount = pingResults.filter((r) => r.status === 'timeout').length;

  console.log(`⚡ 本地 URL-Test 完成 (耗时 ${(durationMs / 1000).toFixed(1)}s): 🟢 极速可用 ${onlineCount} | 🟡 良好缓慢 ${slowCount} | 🔴 超时不可用 ${timeoutCount}`);

  // 4. 打包批量回传落库
  console.log('📤 正在将测速与健康度结果上报至云端 SubHub...');
  try {
    const reportRes = await fetch(`${SUBHUB_URL}/api/agent/report`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AGENT_SECRET}`,
        'Content-Type': 'application/json',
        'User-Agent': 'SubHub-Probe-Agent/2.0',
      },
      body: JSON.stringify({ results: pingResults }),
      signal: AbortSignal.timeout(15000),
    });

    if (!reportRes.ok) {
      const errText = await reportRes.text();
      throw new Error(`HTTP ${reportRes.status}: ${errText}`);
    }

    const reportJson = await reportRes.json();
    if (!reportJson.success) {
      throw new Error(reportJson.message || '上报结果保存失败');
    }

    console.log(`✅ 同步成功！已更新 ${reportJson.data?.updatedCount || pingResults.length} 个节点的真实网络延迟。`);
    console.log(`💤 进入休眠，将在 ${INTERVAL_MINUTES} 分钟后执行下一轮测速...\n`);
  } catch (err) {
    console.error(`❌ 上报失败: ${err.message}`);
  }
}

async function main() {
  // 确保 Mihomo 内核已就绪
  await ensureMihomoRunning();

  // 立即执行首轮测速
  await runProbeCycle();

  // 定时执行后续轮次
  if (INTERVAL_MINUTES > 0) {
    setInterval(runProbeCycle, INTERVAL_MINUTES * 60 * 1000);
  }
}

main().catch((err) => {
  console.error('Fatal Probe Error:', err);
  cleanupAndExit(1);
});
