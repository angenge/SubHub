#!/usr/bin/env node

/**
 * SubHub Probe Agent (边缘真实网络测速探针)
 *
 * 作用：在本地软路由、NAS、个人电脑等真实用户网络环境下运行，
 * 内嵌或对接 Mihomo (Clash.Meta) 内核，对全协议代理节点（包括 Hysteria2、TUIC、VLESS Reality 等）
 * 执行真实 URL-Test 测速并将准确的全链路延迟与存活状态回传云端落库。
 *
 * 无需任何外部 npm 依赖，零配置开箱即用。
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const stream = require('node:stream');
const util = require('node:util');
const { spawn, execSync, spawnSync } = require('node:child_process');

const streamPipeline = util.promisify(stream.pipeline);

// 强制刷新输出流缓冲区，防止在 Docker 容器或无 TTY 环境中出现输出卡顿
if (process.stdout._handle && process.stdout._handle.setBlocking) {
  process.stdout._handle.setBlocking(true);
}

const SUBHUB_URL = (process.env.SUBHUB_URL || process.argv[2] || '').replace(/\/+$/, '');
const AGENT_SECRET = (process.env.AGENT_SECRET || process.argv[3] || '').trim();
const INTERVAL_MINUTES = parseInt(process.env.INTERVAL_MINUTES || '15', 10);
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '3', 10));
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '8000', 10);
const TEST_URL = process.env.TEST_URL || 'https://cp.cloudflare.com/generate_204';
const MIHOMO_BIN = process.env.MIHOMO_PATH || (process.platform === 'win32' ? 'mihomo.exe' : 'mihomo');
const MIHOMO_PORT = parseInt(process.env.MIHOMO_PORT || '9090', 10);
const MIHOMO_API = `http://127.0.0.1:${MIHOMO_PORT}`;
const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS || '15000', 10);
const FETCH_RETRIES = parseInt(process.env.FETCH_RETRIES || '3', 10);
const FETCH_RETRY_DELAY_MS = parseInt(process.env.FETCH_RETRY_DELAY_MS || '3000', 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PROBE_TMP_DIR = path.join(os.tmpdir(), 'subhub_probe');
const PROBE_CONFIG_PATH = path.join(PROBE_TMP_DIR, 'config.yaml');

// 真实 Mihomo 内核解压后通常 >20MB；2MB 作为最低可信下限，
// 用于识别下载中断/失败留下的损坏或 HTML 报错残留文件。
const MIN_MIHOMO_SIZE = 2 * 1024 * 1024;

let mihomoProcess = null;
let isCycleRunning = false;

console.log('====================================================');
console.log('📡 SubHub 边缘网络测速探针 (Edge Mihomo Probe Agent)');
console.log(`🔗 目标云端地址: ${SUBHUB_URL || '(未指定)'}`);
console.log(`🔑 探针密钥状态: ${AGENT_SECRET ? '已配置 (' + AGENT_SECRET.slice(0, 10) + '...)' : '❌ 未配置'}`);
console.log(`⏱️ 测速周期: 每 ${INTERVAL_MINUTES} 分钟自动执行一次`);
console.log(`⚡ 探测模式: 受控并发池 (${CONCURRENCY} 并发) | 超时: ${TIMEOUT_MS}ms`);
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
function killMihomo() {
  if (mihomoProcess && !mihomoProcess.killed) {
    try {
      console.log('🛑 正在关闭 Mihomo 内核进程...');
      mihomoProcess.kill('SIGTERM');
    } catch {}
  }
}

function cleanupAndExit(code = 0) {
  killMihomo();
  process.exit(code);
}

process.on('SIGINT', () => cleanupAndExit(0));
process.on('SIGTERM', () => cleanupAndExit(0));
process.on('exit', () => {
  killMihomo();
});

/**
 * 校验指定文件是否为可用的 Mihomo 内核二进制。
 * 仅以"存在且可执行"作为准入口会误把上次下载中断留下的
 * 残留文件当成可用内核，导致后续一直启动损坏的二进制。
 *
 * 校验要点：
 * 1. 长度下限（真实内核解压后 >20MB）；
 * 2. 原生可执行文件魔数（ELF / PE / Mach-O），阻断 HTML、压缩包、空文件等残留；
 * 3. 执行 `-v` 仅取 stdout 判定版本信息，避免 ENOEXEC 走 sh 回退时
 *    stderr 错误信息里夹带文件名（路径含 “mihomo”）导致的误判。
 */
function hasBinaryMagic(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
  } catch {
    return false;
  }
  const buf = Buffer.alloc(4);
  try {
    const n = fs.readSync(fd, buf, 0, 4, 0);
    if (n < 4) return false;
  } finally {
    fs.closeSync(fd);
  }
  if (process.platform === 'win32') {
    return buf[0] === 0x4d && buf[1] === 0x5a; // MZ
  }
  if (process.platform === 'darwin') {
    const sig = buf.readUInt32BE(0);
    return sig === 0xfeedface || sig === 0xfeedfacf || sig === 0xcefaedfe || sig === 0xcffaedfe;
  }
  return buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46; // \x7fELF
}

function isValidMihomoBinary(filePath) {
  try {
    const st = fs.statSync(filePath);
    if (!st.isFile() || st.size < MIN_MIHOMO_SIZE) return false;
    if (!hasBinaryMagic(filePath)) {
      // 可能是权限不足导致无法打开/读取（如手动解压后未配置权限），补权限后重试
      try { fs.chmodSync(filePath, 0o755); } catch {}
      if (!hasBinaryMagic(filePath)) return false;
    }

    const probe = () =>
      spawnSync(filePath, ['-v'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    let r = probe();
    if (r.error && r.error.code === 'EACCES') {
      // 缺少执行权限（如手动解压后未 +x），补权限后重新探测
      fs.chmodSync(filePath, 0o755);
      r = probe();
    }
    if (r.error || r.signal || r.status === null) return false;
    const out = r.stdout || '';
    return /mihomo|meta|clash/i.test(out);
  } catch {
    return false;
  }
}

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

  // 3. 检查探针临时目录中是否已有可用内核
  const localBin = path.join(PROBE_TMP_DIR, binName);
  if (fs.existsSync(localBin)) {
    if (isValidMihomoBinary(localBin)) {
      try {
        fs.accessSync(localBin, fs.constants.X_OK);
        return localBin;
      } catch {
        try { fs.chmodSync(localBin, 0o755); return localBin; } catch {}
      }
    } else {
      // 上次下载中断/失败留下的损坏残留：清理后让本轮重新下载，
      // 避免后续启动一个损坏的二进制而不自知。
      console.warn(`⚠️ ${localBin} 无效或已损坏（可能是上次下载中断残留），已自动清理并重新获取内核...`);
      try { fs.rmSync(localBin, { force: true }); } catch {}
    }
  }

  // 4. 检查当前工作目录
  const cwdBin = path.join(process.cwd(), binName);
  if (fs.existsSync(cwdBin) && isValidMihomoBinary(cwdBin)) {
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
    `https://dl.hiz.one/https://github.com/MetaCubeX/mihomo/releases/download/${ver}/${fileName}`,
    `https://github.com/MetaCubeX/mihomo/releases/download/${ver}/${fileName}`,
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
        if (isValidMihomoBinary(localBin)) {
          downloaded = true;
          console.log(`✅ Mihomo 内核已成功就绪: ${localBin}`);
          break;
        }
        // 解压完成但校验失败（内容损坏/非内核），清理后尝试下一镜像源
        try { fs.rmSync(localBin, { force: true }); } catch {}
        console.warn(`  ⚠️ 下载的内核未通过有效性校验，尝试切换下一源...`);
      }
    } catch (err) {
      // 删除中断下载产生的残留文件，避免把损坏产物误当可用内核
      try { fs.rmSync(localBin, { force: true }); } catch {}
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
  // 确保外控端口与当前探针实际监听端口一致
  let configToSave = clashYaml;
  if (/external-controller:.*$/m.test(configToSave)) {
    configToSave = configToSave.replace(/external-controller:.*$/m, `external-controller: 127.0.0.1:${MIHOMO_PORT}`);
  } else {
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
let currentCycleApiErrors = 0;

/**
 * 判断是否为非代理提示类节点/规则项
 */
function isNoticeOrRuleNode(name) {
  if (!name) return true;
  const lower = name.toLowerCase();
  if (name === 'PASS-RULE' || name === 'REJECT-DROP' || name === 'DIRECT' || name === 'REJECT' || name === 'GLOBAL') {
    return true;
  }
  if (lower.includes('剩余流量') || lower.includes('套餐到期') || lower.includes('重置剩余') || lower.includes('官网') || lower.includes('不再支持')) {
    return true;
  }
  return false;
}

/**
 * 通过 Mihomo 官方 URL-Test 接口单节点测速
 */
async function testNodeDelay(nodeName, timeoutMs = TIMEOUT_MS) {
  if (isNoticeOrRuleNode(nodeName)) {
    return { ping: -1, status: 'ignored' };
  }

  const url = `${MIHOMO_API}/proxies/${encodeURIComponent(nodeName)}/delay?timeout=${timeoutMs}&url=${encodeURIComponent(TEST_URL)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs + 2000) });
    
    // 区分节点在内核中不存在 (404) 与真实超时 (504/网络断开)
    if (res.status === 404) {
      if (process.env.DEBUG) {
        console.warn(`[Probe] 节点未在内核中找到 (404): ${nodeName}`);
      }
      return { ping: -1, status: 'not_found' };
    }

    if (!res.ok) {
      return { ping: -1, status: 'timeout' };
    }

    const data = await res.json();
    const delay = typeof data.delay === 'number' ? data.delay : -1;

    if (delay <= 0) {
      return { ping: -1, status: 'timeout' };
    } else if (delay <= 300) {
      return { ping: delay, status: 'fast' };
    } else {
      return { ping: delay, status: 'slow' };
    }
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || (err.cause && err.cause.code === 'ECONNREFUSED')) {
      currentCycleApiErrors++;
      if (!apiErrorLogged) {
        apiErrorLogged = true;
        console.error(`\n⚠️ 警告: 无法连接本地 Mihomo API (${MIHOMO_API})，请确认内核进程是否存活！`);
      }
    }
    return { ping: -1, status: 'timeout' };
  }
}

/**
 * 判断节点是否为基于 UDP 传输的协议（如 Hysteria2 / TUIC / WireGuard）
 */
function isUdpBasedNode(node) {
  if (!node) return false;
  const type = String(node.type || '').toLowerCase();
  if (['hysteria2', 'hy2', 'tuic', 'wireguard'].includes(type)) {
    return true;
  }
  const name = String(node.name || '').toLowerCase();
  if (name.includes('hysteria') || name.includes('hy2') || name.includes('tuic') || name.includes('wireguard')) {
    return true;
  }
  return false;
}

/**
 * 受控并发池执行测速 (默认 3 并发，兼顾吞吐效率与网络稳定性)
 */
async function batchTestNodes(nodes) {
  const results = new Array(nodes.length);
  let currentIndex = 0;
  const workerCount = Math.min(CONCURRENCY, nodes.length || 1);

  async function worker() {
    while (true) {
      const idx = currentIndex++;
      if (idx >= nodes.length) break;
      const node = nodes[idx];

      try {
        let testRes = await testNodeDelay(node.name, TIMEOUT_MS);

        // 针对 UDP 协议节点（Hysteria2 / TUIC 等）执行单次轻量防抖复测，防止瞬时 UDP 丢包误判下线
        if (testRes.status === 'timeout' && isUdpBasedNode(node)) {
          await new Promise((r) => setTimeout(r, 400));
          const retryRes = await testNodeDelay(node.name, Math.min(TIMEOUT_MS, 5000));
          if (retryRes.status !== 'timeout' && retryRes.status !== 'not_found') {
            if (process.env.DEBUG) {
              console.log(`[Probe] ⚡ UDP 节点防抖复测成功: ${node.name} (${retryRes.ping}ms)`);
            }
            testRes = retryRes;
          }
        }

        results[idx] = {
          nodeId: node.id,
          ping: testRes.ping >= 0 ? testRes.ping : null,
          status: testRes.status === 'not_found' ? 'timeout' : testRes.status,
          checkedAt: new Date().toISOString(),
        };
      } catch {
        results[idx] = {
          nodeId: node.id,
          ping: null,
          status: 'timeout',
          checkedAt: new Date().toISOString(),
        };
      }
    }
  }

  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * 执行单次拉取 ➔ 测速 ➔ 上报流程
 */
async function runProbeCycle() {
  if (isCycleRunning) {
    console.warn('⚠️ 上一轮探测任务仍在执行中，跳过本次调度以防重叠竞态。');
    return;
  }

  isCycleRunning = true;
  const nowStr = new Date().toLocaleString();
  console.log(`\n[${nowStr}] 🚀 正在连接云端拉取待测节点...`);

  try {
    // 1. 获取待测节点列表及 Clash 格式配置（单次网络抖动自动重试，避免整轮直接跳过）
    let nodes = [];
    let clashConfig = '';
    let fetched = false;
    let lastErr = null;
    for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
      try {
        const res = await fetch(`${SUBHUB_URL}/api/agent/nodes`, {
          headers: {
            'Authorization': `Bearer ${AGENT_SECRET}`,
            'User-Agent': 'SubHub-Probe-Agent/2.0',
          },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
        fetched = true;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < FETCH_RETRIES) {
          const delayMs = FETCH_RETRY_DELAY_MS * (attempt + 1);
          console.warn(`  ⚠️ 第 ${attempt + 1} 次拉取失败 (${err.message})，${(delayMs / 1000).toFixed(1)}s 后自动重试...`);
          await sleep(delayMs);
        }
      }
    }

    if (!fetched) {
      console.error(`❌ 云端节点拉取连续失败 ${FETCH_RETRIES + 1} 次: ${lastErr ? lastErr.message : '未知错误'}`);
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

    console.log(`📦 成功拉取 ${nodes.length} 个节点，正在以 ${CONCURRENCY} 并发执行真实 URL-Test 测速...`);
    const startTime = Date.now();

    // 3. 受控并发测速
    currentCycleApiErrors = 0;
    const pingResults = await batchTestNodes(nodes);
    const durationMs = Date.now() - startTime;

    if (currentCycleApiErrors >= nodes.length && nodes.length > 0) {
      console.error(`⚠️ 本轮测速本地 Mihomo 控制器全无响应 (${currentCycleApiErrors}/${nodes.length})，跳过上报以防误写节点为超时。`);
      apiErrorLogged = false;
      return;
    }

    const fastCount = pingResults.filter((r) => r.status === 'fast' || r.status === 'online').length;
    const slowCount = pingResults.filter((r) => r.status === 'slow').length;
    const timeoutCount = pingResults.filter((r) => r.status === 'timeout').length;
    const ignoredCount = pingResults.filter((r) => r.status === 'ignored').length;

    console.log(`⚡ 本地 URL-Test 完成 (耗时 ${(durationMs / 1000).toFixed(1)}s): 🟢 极速可用 ${fastCount} | 🟡 良好缓慢 ${slowCount} | 🔴 超时不可用 ${timeoutCount}${ignoredCount > 0 ? ` | ⚪ 忽略提示项 ${ignoredCount}` : ''}`);

    // 4. 打包批量回传落库 (过滤 ignored 提示项)
    const reportList = pingResults.filter((r) => r.status !== 'ignored');
    console.log(`📤 正在将 ${reportList.length} 条测速与健康度结果上报至云端 SubHub...`);
    try {
      const reportRes = await fetch(`${SUBHUB_URL}/api/agent/report`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AGENT_SECRET}`,
          'Content-Type': 'application/json',
          'User-Agent': 'SubHub-Probe-Agent/2.0',
        },
        body: JSON.stringify({ results: reportList }),
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

      console.log(`✅ 同步成功！已更新 ${reportJson.data?.updatedCount || reportList.length} 个节点的真实网络延迟。`);
      console.log(`💤 进入休眠，将在 ${INTERVAL_MINUTES} 分钟后执行下一轮测速...\n`);
    } catch (err) {
      console.error(`❌ 上报失败: ${err.message}`);
    }
  } finally {
    isCycleRunning = false;
  }
}

/**
 * 安全调度器（避免 setInterval 引起的重叠并发执行）
 */
function scheduleNextCycle() {
  if (INTERVAL_MINUTES > 0) {
    setTimeout(async () => {
      try {
        await runProbeCycle();
      } catch (err) {
        console.error('Probe Cycle Error:', err);
      } finally {
        scheduleNextCycle();
      }
    }, INTERVAL_MINUTES * 60 * 1000);
  }
}

async function main() {
  // 确保 Mihomo 内核已就绪
  await ensureMihomoRunning();

  // 立即执行首轮测速
  await runProbeCycle();

  // 启动安全递归调度
  scheduleNextCycle();
}

main().catch((err) => {
  console.error('Fatal Probe Error:', err);
  cleanupAndExit(1);
});
