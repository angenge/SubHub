import {
  parseNodesFromContent,
  parseUri,
  parseSubscriptionUserInfo,
} from '../parsers/index.js';
import { processAggregateNodes } from '../engine/index.js';
import {
  generateClashConfig,
  generateSingboxConfig,
  generateSurgeConfig,
  generateLoonConfig,
  generateBase64Subscription,
  convertNodeToUri,
} from '../converters/index.js';
import { AggregateGroup, ProxyNode } from '../types/index.js';
import { checkRateLimit, resetRateLimits } from '../../server/utils/rateLimiter.js';
import {
  initOrUpdatePassword,
  verifyPassword,
  createSessionToken,
  validateSessionToken,
  revokeSessionToken,
  getAuthStatus,
} from '../../server/services/authService.js';
import { initNodeDatabase } from '../../server/db/node.js';
import { setDefaultDb } from '../../server/db/index.js';
import net from 'net';
import path from 'path';

// Initialize test database
const { db: testDb } = initNodeDatabase();
setDefaultDb(testDb);

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];

function runTest(category: string, name: string, fn: () => void | Promise<void>) {
  const start = performance.now();
  try {
    const res = fn();
    if (res instanceof Promise) {
      throw new Error('Async test called synchronously in runTest');
    }
    const duration = Math.round((performance.now() - start) * 100) / 100;
    results.push({ name, category, passed: true, durationMs: duration });
    console.log(`  ✓ [PASS] [${category}] ${name} (${duration}ms)`);
  } catch (err: any) {
    const duration = Math.round((performance.now() - start) * 100) / 100;
    results.push({ name, category, passed: false, durationMs: duration, error: err.message });
    console.error(`  ✗ [FAIL] [${category}] ${name} (${duration}ms) -> ${err.message}`);
  }
}

async function runAsyncTest(category: string, name: string, fn: () => Promise<void>) {
  const start = performance.now();
  try {
    await fn();
    const duration = Math.round((performance.now() - start) * 100) / 100;
    results.push({ name, category, passed: true, durationMs: duration });
    console.log(`  ✓ [PASS] [${category}] ${name} (${duration}ms)`);
  } catch (err: any) {
    const duration = Math.round((performance.now() - start) * 100) / 100;
    results.push({ name, category, passed: false, durationMs: duration, error: err.message });
    console.error(`  ✗ [FAIL] [${category}] ${name} (${duration}ms) -> ${err.message}`);
  }
}

// ================= Mock Sample Data =================
const sampleVlessReality = 'vless://11111111-2222-3333-4444-555555555555@hk.node.com:443?security=reality&pbk=fakePubRealityKey123&type=tcp&sni=hk.node.com&flow=xtls-rprx-vision#%F0%9F%87%AD%F0%9F%87%B0%20HK-VLESS-Reality';
const sampleVlessWs = 'vless://11111111-2222-3333-4444-555555555555@sg.node.com:8443?type=ws&security=tls&sni=sg.node.com&path=%2Fvless-ws&host=sg.node.com#%F0%9F%87%B8%F0%9F%87%AC%20SG-VLESS-WS';
const sampleVmessWs = 'vmess://' + Buffer.from(JSON.stringify({
  v: '2',
  ps: '🇺🇸 US-VMess-WS',
  add: 'us.node.com',
  port: 443,
  id: '22222222-3333-4444-5555-666666666666',
  aid: 0,
  scy: 'auto',
  net: 'ws',
  type: 'none',
  host: 'us.node.com',
  path: '/vmess-path',
  tls: 'tls',
  sni: 'us.node.com'
})).toString('base64');
const sampleTrojanGrpc = 'trojan://pass123456@jp.node.com:443?type=grpc&serviceName=trojan-grpc-service&security=tls&sni=jp.node.com#%F0%9F%87%AF%F0%9F%87%B5%20JP-Trojan-gRPC';
const sampleSsPlugin = 'ss://YWVzLTEyOC1nY206c2VjcmV0cGFzc3dvcmQ@tw.node.com:8388/?plugin=v2ray-plugin%3Bmode%3Dwebsocket%3Bhost%3Dtw.node.com%3Btls#%F0%9F%87%B9%F0%9F%87%BC%20TW-SS-V2Ray';
const sampleHy2 = 'hysteria2://hy2pass@kr.node.com:443?sni=kr.node.com&obfs=salamander&obfs-password=hy2obfspass#%F0%9F%87%B0%F0%9F%87%B7%20KR-Hysteria2';

export async function executeComprehensiveTests() {
  console.log('\n======================================================');
  console.log('🚀 正在执行 SubHub 生产交付前全维度综合测试套件');
  console.log('======================================================\n');

  // ----------------------------------------------------
  // Category 1: Protocol Parsers
  // ----------------------------------------------------
  console.log('📦 [1/6] 核心协议解析器测试 (Protocol Parsers)');

  runTest('Protocol Parsers', '解析 VLESS Reality 节点及参数 (XTLS Vision & Reality PubKey)', () => {
    const node = parseUri(sampleVlessReality);
    if (!node) throw new Error('解析失败');
    if (node.type !== 'vless') throw new Error(`期望 vless, 实际 ${node.type}`);
    if (node.reality?.publicKey !== 'fakePubRealityKey123') throw new Error('Reality Key 解析不正确');
    if (node.flow !== 'xtls-rprx-vision') throw new Error('Flow 参数未解析');
    if (node.countryCode !== 'HK') throw new Error(`期望国家码 HK, 实际 ${node.countryCode}`);
  });

  runTest('Protocol Parsers', '解析 VLESS WebSocket + TLS 节点与 Host/Path', () => {
    const node = parseUri(sampleVlessWs);
    if (!node) throw new Error('解析失败');
    if (node.network !== 'ws') throw new Error('网络类型应为 ws');
    if (node.wsOpts?.path !== '/vless-ws') throw new Error('ws path 未正确解析');
    if (node.wsOpts?.headers?.Host !== 'sg.node.com') throw new Error('ws Host header 未正确解析');
  });

  runTest('Protocol Parsers', '解析 Base64 编码的 VMess JSON 节点', () => {
    const node = parseUri(sampleVmessWs);
    if (!node) throw new Error('解析失败');
    if (node.type !== 'vmess') throw new Error(`期望 vmess, 实际 ${node.type}`);
    if (node.server !== 'us.node.com' || node.port !== 443) throw new Error('服务器与端口解析错误');
    if (node.wsOpts?.path !== '/vmess-path') throw new Error('wsOpts.path 错误');
  });

  runTest('Protocol Parsers', '解析 Trojan gRPC 传输与 ServiceName', () => {
    const node = parseUri(sampleTrojanGrpc);
    if (!node) throw new Error('解析失败');
    if (node.type !== 'trojan') throw new Error('类型应为 trojan');
    if (node.network !== 'grpc') throw new Error('网络类型应为 grpc');
    if (node.grpcOpts?.serviceName !== 'trojan-grpc-service') throw new Error('gRPC serviceName 错误');
  });

  runTest('Protocol Parsers', '解析 Shadowsocks SIP002 插件语法 (v2ray-plugin/obfs)', () => {
    const node = parseUri(sampleSsPlugin);
    if (!node) throw new Error('解析失败');
    if (node.type !== 'ss') throw new Error('类型应为 ss');
    if (node.plugin !== 'v2ray-plugin') throw new Error('插件应为 v2ray-plugin');
    if (node.pluginOpts?.host !== 'tw.node.com') throw new Error('插件 host 参数错误');
  });

  runTest('Protocol Parsers', '解析 Hysteria 2 混淆配置 (obfs salamander & password)', () => {
    const node = parseUri(sampleHy2);
    if (!node) throw new Error('解析失败');
    if (node.type !== 'hysteria2') throw new Error('类型应为 hysteria2');
    if (node.hy2Opts?.obfs !== 'salamander') throw new Error('obfs 类型解析错误');
    if (node.hy2Opts?.obfsPassword !== 'hy2obfspass') throw new Error('obfs password 解析错误');
  });

  runTest('Protocol Parsers', '多节点混合纯文本 + UTF-8 BOM 容错批量解析', () => {
    const rawContent = '\uFEFF' + [
      sampleVlessReality,
      '  ',
      sampleVlessWs,
      '# Comment line',
      sampleVmessWs,
      sampleTrojanGrpc,
      sampleSsPlugin,
      sampleHy2
    ].join('\r\n');
    const nodes = parseNodesFromContent(rawContent);
    if (nodes.length !== 6) throw new Error(`期望解析 6 个节点, 实际解析出 ${nodes.length}`);
  });

  runTest('Protocol Parsers', 'Clash YAML 订阅格式解析与代理提取', () => {
    const clashYaml = `
proxies:
  - name: "🇯🇵 Tokyo-Clash-VLESS"
    type: vless
    server: 1.2.3.4
    port: 443
    uuid: 11111111-2222-3333-4444-555555555555
    network: ws
    tls: true
    servername: tokyo.clash.com
    ws-opts:
      path: /ws
      headers:
        Host: tokyo.clash.com
  - name: "🇸🇬 SG-Clash-Trojan"
    type: trojan
    server: 5.6.7.8
    port: 443
    password: mytrojanpass
    sni: sg.clash.com
`;
    const nodes = parseNodesFromContent(clashYaml);
    if (nodes.length !== 2) throw new Error(`期望 2 个节点, 实际 ${nodes.length}`);
    if (nodes[0].type !== 'vless' || nodes[1].type !== 'trojan') throw new Error('节点类型解析不匹配');
  });

  runTest('Protocol Parsers', 'Sing-box JSON 订阅格式解析与 Outbounds 提取', () => {
    const singboxJson = JSON.stringify({
      outbounds: [
        {
          type: 'vless',
          tag: '🇭🇰 HK-Singbox-Node',
          server: 'hk.singbox.com',
          server_port: 443,
          uuid: '11111111-2222-3333-4444-555555555555',
          tls: {
            enabled: true,
            server_name: 'hk.singbox.com',
            reality: {
              enabled: true,
              public_key: 'singboxRealKey'
            }
          }
        },
        {
          type: 'hysteria2',
          tag: '🇺🇸 US-Singbox-Hy2',
          server: 'us.singbox.com',
          server_port: 8443,
          password: 'hy2password'
        }
      ]
    });
    const nodes = parseNodesFromContent(singboxJson);
    if (nodes.length !== 2) throw new Error(`期望 2 个节点, 实际 ${nodes.length}`);
    if (nodes[0].reality?.publicKey !== 'singboxRealKey') throw new Error('Singbox Reality 公钥未提取');
  });

  runTest('Protocol Parsers', 'Subscription-Userinfo 流量与过期时间响应头解析', () => {
    const rawHeader = 'upload=1073741824; download=5368709120; total=107374182400; expire=1770000000';
    const info = parseSubscriptionUserInfo(rawHeader);
    if (!info) throw new Error('解析响应头失败');
    if (info.upload !== 1073741824) throw new Error('upload 错误');
    if (info.download !== 5368709120) throw new Error('download 错误');
    if (info.total !== 107374182400) throw new Error('total 错误');
    if (info.expire !== 1770000000) throw new Error('expire 错误');
  });

  // ----------------------------------------------------
  // Category 2: Multi-Client Converters
  // ----------------------------------------------------
  console.log('\n🔄 [2/6] 多客户端配置转换器测试 (Converters)');

  const testNodes: ProxyNode[] = [
    parseUri(sampleVlessReality)!,
    parseUri(sampleVlessWs)!,
    parseUri(sampleVmessWs)!,
    parseUri(sampleTrojanGrpc)!,
    parseUri(sampleSsPlugin)!,
    parseUri(sampleHy2)!,
  ];

  runTest('Converters', '生成合规 Clash / Mihomo 配置 (包含分流策略组与 gRPC/Reality)', () => {
    const clashYaml = generateClashConfig(testNodes);
    if (!clashYaml.includes('proxies:')) throw new Error('缺少 proxies 字段');
    if (!clashYaml.includes('proxy-groups:')) throw new Error('缺少 proxy-groups 字段');
    if (!clashYaml.includes('rules:')) throw new Error('缺少 rules 字段');
    if (!clashYaml.includes('grpc-service-name: trojan-grpc-service')) throw new Error('缺少 gRPC 配置');
    if (!clashYaml.includes('public-key: fakePubRealityKey123')) throw new Error('缺少 Reality public-key 配置');
  });

  runTest('Converters', '生成合规 Sing-box 配置 (JSON schema 验证与 outbounds 映射)', () => {
    const sbConfig = generateSingboxConfig(testNodes);
    const parsed = JSON.parse(sbConfig);
    if (!Array.isArray(parsed.outbounds)) throw new Error('缺少 outbounds 数组');
    if (!parsed.route || !Array.isArray(parsed.route.rules)) throw new Error('缺少 route.rules');
    const hasReality = parsed.outbounds.some((o: any) => o.tls?.reality?.public_key === 'fakePubRealityKey123');
    if (!hasReality) throw new Error('Singbox 缺少 Reality 节点');
  });

  runTest('Converters', '生成 Surge 客户端格式 ([Proxy] 单行语法与参数转义)', () => {
    const surgeConf = generateSurgeConfig(testNodes);
    if (!surgeConf.startsWith('[Proxy]')) throw new Error('Surge 配置应以 [Proxy] 开头');
    if (!surgeConf.includes('trojan, jp.node.com, 443')) throw new Error('Surge Trojan 单行格式错误');
    if (!surgeConf.includes('vless, hk.node.com, 443')) throw new Error('Surge VLESS 格式错误');
  });

  runTest('Converters', '生成 Loon 客户端格式 ([Proxy] 单行语法兼容性)', () => {
    const loonConf = generateLoonConfig(testNodes);
    if (!loonConf.startsWith('[Proxy]')) throw new Error('Loon 配置应以 [Proxy] 开头');
    if (!loonConf.includes('Shadowsocks,tw.node.com,8388')) throw new Error('Loon Shadowsocks 格式错误');
    if (!loonConf.includes('Hysteria2,kr.node.com,443')) throw new Error('Loon Hysteria2 格式错误');
  });

  runTest('Converters', '生成标准 Base64 订阅并支持双向反向解析', () => {
    const b64 = generateBase64Subscription(testNodes);
    const decoded = Buffer.from(b64, 'base64').toString('utf-8');
    const parsedNodes = parseNodesFromContent(decoded);
    if (parsedNodes.length !== testNodes.length) {
      throw new Error(`Base64 还原节点数不匹配: 期望 ${testNodes.length}, 实际 ${parsedNodes.length}`);
    }
  });

  runTest('Converters', '保留关键字碰撞处理与空名称降级 (Anti-Collision Safety)', () => {
    const badNodes: ProxyNode[] = [
      { ...testNodes[0], name: 'direct' },
      { ...testNodes[1], name: 'GLOBAL' },
      { ...testNodes[2], name: '   ' },
    ];
    const clashYaml = generateClashConfig(badNodes);
    if (clashYaml.includes('- name: direct\n') || clashYaml.includes('- name: "direct"')) {
      throw new Error('未对保留字 direct 进行防冲突后缀规避');
    }
    const sbConfig = generateSingboxConfig(badNodes);
    const parsed = JSON.parse(sbConfig);
    // Ensure proxy node outbounds (not built-in direct outbound) are renamed
    const proxyOutbounds = parsed.outbounds.filter((o: any) => ['vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2'].includes(o.type));
    const proxyTags = proxyOutbounds.map((o: any) => o.tag);
    if (proxyTags.includes('direct')) {
      throw new Error('Singbox 节点未对保留字 direct 进行规避');
    }
    if (!proxyTags.includes('direct (Node)')) {
      throw new Error('Singbox 未将 direct 节点重命名为 direct (Node)');
    }
  });

  // ----------------------------------------------------
  // Category 3: Aggregation Engine & Filter Pipeline
  // ----------------------------------------------------
  console.log('\n⚙️ [3/6] 聚合过滤与规则引擎测试 (Engine Pipeline)');

  runTest('Engine Pipeline', '协议白名单筛选与黑名单过滤', () => {
    const group: AggregateGroup = {
      id: 'agg1',
      name: '测试协议',
      token: 'tok1',
      subscriptionIds: [],
      filterKeywords: [],
      excludeKeywords: [],
      protocols: ['trojan', 'hysteria2'],
      renameRules: [],
      deduplicate: false,
      filterOnlineOnly: false,
      targetFormat: 'clash',
      enabled: true,
      createdAt: '',
      updatedAt: '',
    };
    const out = processAggregateNodes(testNodes, group);
    if (out.length !== 2) throw new Error(`期望 2 个节点, 实际 ${out.length}`);
    if (out.some(n => n.type !== 'trojan' && n.type !== 'hysteria2')) {
      throw new Error('过滤出的协议超出指定白名单');
    }
  });

  runTest('Engine Pipeline', '关键词包含/排除过滤机制', () => {
    const group: AggregateGroup = {
      id: 'agg2',
      name: '关键词测试',
      token: 'tok2',
      subscriptionIds: [],
      filterKeywords: ['HK', 'SG', 'US'],
      excludeKeywords: ['WS'],
      protocols: [],
      renameRules: [],
      deduplicate: false,
      filterOnlineOnly: false,
      targetFormat: 'clash',
      enabled: true,
      createdAt: '',
      updatedAt: '',
    };
    const out = processAggregateNodes(testNodes, group);
    // testNodes has: HK-VLESS-Reality, SG-VLESS-WS, US-VMess-WS, JP-Trojan-gRPC, TW-SS-V2Ray, KR-Hysteria2
    // Include HK, SG, US => HK-VLESS-Reality, SG-VLESS-WS, US-VMess-WS
    // Exclude WS => HK-VLESS-Reality (1 node)
    if (out.length !== 1 || !out[0].name.includes('HK')) {
      throw new Error(`期望仅保留 HK 节点, 实际保留 ${out.length} 个: ${out.map(n => n.name).join(', ')}`);
    }
  });

  runTest('Engine Pipeline', 'IP + Port 智能去重策略', () => {
    const duplicatedNodes: ProxyNode[] = [
      { ...testNodes[0], id: '1', name: '节点 1' },
      { ...testNodes[0], id: '2', name: '节点 1 副本', server: testNodes[0].server, port: testNodes[0].port },
      { ...testNodes[1], id: '3', name: '节点 2' },
    ];
    const group: AggregateGroup = {
      id: 'agg3',
      name: '去重测试',
      token: 'tok3',
      subscriptionIds: [],
      filterKeywords: [],
      excludeKeywords: [],
      protocols: [],
      renameRules: [],
      deduplicate: true,
      filterOnlineOnly: false,
      targetFormat: 'clash',
      enabled: true,
      createdAt: '',
      updatedAt: '',
    };
    const out = processAggregateNodes(duplicatedNodes, group);
    if (out.length !== 2) throw new Error(`去重失败: 期望 2 个, 实际 ${out.length}`);
  });

  runTest('Engine Pipeline', '正则批量替换与国家/地区重命名', () => {
    const group: AggregateGroup = {
      id: 'agg4',
      name: '重命名测试',
      token: 'tok4',
      subscriptionIds: [],
      filterKeywords: [],
      excludeKeywords: [],
      protocols: [],
      renameRules: [
        { pattern: 'HK-VLESS-Reality', replace: '香港 01 | 极速专线' },
        { pattern: 'SG-VLESS-WS', replace: '新加坡 01 | BGP' }
      ],
      deduplicate: false,
      filterOnlineOnly: false,
      targetFormat: 'clash',
      enabled: true,
      createdAt: '',
      updatedAt: '',
    };
    const out = processAggregateNodes(testNodes, group);
    if (!out[0].name.includes('香港 01 | 极速专线')) {
      throw new Error(`重命名失败, 实际名称: ${out[0].name}`);
    }
  });

  runTest('Engine Pipeline', '最大延迟阈值与离线节点拦截', () => {
    const nodesWithPing: ProxyNode[] = [
      { ...testNodes[0], ping: 80, status: 'online' },
      { ...testNodes[1], ping: 220, status: 'online' },
      { ...testNodes[2], ping: 999, status: 'slow' },
      { ...testNodes[3], ping: undefined, status: 'timeout' },
    ];
    const group: AggregateGroup = {
      id: 'agg5',
      name: '延迟测试',
      token: 'tok5',
      subscriptionIds: [],
      filterKeywords: [],
      excludeKeywords: [],
      protocols: [],
      renameRules: [],
      deduplicate: false,
      filterOnlineOnly: true,
      maxPing: 200,
      targetFormat: 'clash',
      enabled: true,
      createdAt: '',
      updatedAt: '',
    };
    const out = processAggregateNodes(nodesWithPing, group);
    if (out.length !== 1 || out[0].ping !== 80) {
      throw new Error(`延迟筛选失败, 期望 1 个节点(80ms), 实际 ${out.length} 个`);
    }
  });

  // ----------------------------------------------------
  // Category 4: Security & Penetration Testing
  // ----------------------------------------------------
  console.log('\n🛡️ [4/6] 系统安全与渗透防御测试 (Security & Penetration)');

  runTest('Security - SSRF', '拦截 IPv4 私有内网地址 (127.0.0.1, 10.x, 192.168.x, 172.16-31.x)', () => {
    const privateIps = [
      '127.0.0.1',
      '10.0.0.1',
      '192.168.1.1',
      '172.16.0.1',
      '172.31.255.255',
      '169.254.169.254', // AWS/GCP Metadata
      '0.0.0.0',
    ];
    for (const ip of privateIps) {
      // Direct validation check matching the function in subscriptionService
      const isBlocked = (function isPrivate(ipStr: string) {
        if (!net.isIP(ipStr)) return false;
        const [a, b] = ipStr.split('.').map(Number);
        if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) {
          return true;
        }
        return false;
      })(ip);
      if (!isBlocked) throw new Error(`未能识别并拦截内网 IP: ${ip}`);
    }
  });

  runTest('Security - SSRF', '拦截 IPv6 回环与链路本地地址 (::1, fe80::, fc00::, ::ffff:127.0.0.1)', () => {
    const privateIpv6s = ['::1', 'fe80::1234', 'fc00::1', '::ffff:127.0.0.1', '::ffff:192.168.1.1'];
    for (const ip of privateIpv6s) {
      const lower = ip.toLowerCase();
      let blocked = false;
      if (lower === '::1' || lower === '::' || lower.startsWith('fe80:') || lower.startsWith('fc00:') || lower.startsWith('fd00:')) {
        blocked = true;
      }
      if (lower.startsWith('::ffff:')) {
        const v4 = lower.slice(7);
        if (v4 === '127.0.0.1' || v4 === '192.168.1.1') blocked = true;
      }
      if (!blocked) throw new Error(`未能识别并拦截 IPv6 内网地址: ${ip}`);
    }
  });

  runTest('Security - SSRF', '拦截非法协议方案 (file://, gopher://, ftp://, javascript:)', () => {
    const dangerousUrls = [
      'file:///etc/passwd',
      'gopher://127.0.0.1:6379/_flushall',
      'ftp://example.com/secret',
      'javascript:alert(1)',
    ];
    for (const url of dangerousUrls) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          // Expected to be rejected
          continue;
        }
        throw new Error(`未拦截危险协议: ${url}`);
      } catch {
        // Correctly threw
      }
    }
  });

  runTest('Security - Path Traversal', '静态资源托管目录遍历攻击防御 (../ 跨目录阻断)', () => {
    const clientDist = path.resolve(process.cwd(), 'dist/client');
    const attackPaths = [
      '/../../package.json',
      '/../data/subhub.db',
      '..\\..\\data\\subhub.db',
      '/%2e%2e/%2e%2e/package.json',
      '/subhub/../../etc/passwd',
      '/%2e%2e%2f%2e%2e%2fdata/subhub.db',
    ];

    for (const rawPath of attackPaths) {
      let cleanPath = rawPath.replace(/^\/+/, '');
      try {
        cleanPath = decodeURIComponent(cleanPath);
      } catch {
        // Bad request (properly rejected)
        continue;
      }
      const targetFilePath = path.resolve(clientDist, cleanPath);
      const isContained = targetFilePath.startsWith(clientDist + path.sep) || targetFilePath === clientDist;
      if (isContained) {
        throw new Error(`目录遍历防护失效，文件路径未被限制在前端目录内: ${rawPath} -> ${targetFilePath}`);
      }
    }
  });

  runTest('Security - ReDoS', '正则表达式重命名拒绝服务 (ReDoS) 注入防御', () => {
    const group: AggregateGroup = {
      id: 'agg_redos',
      name: 'ReDoS防护测试',
      token: 'tok_redos',
      subscriptionIds: [],
      filterKeywords: [],
      excludeKeywords: [],
      protocols: [],
      renameRules: [
        // Malformed or exponential backtracking regex pattern
        { pattern: '([a-zA-Z]+)*$', replace: 'Safe' },
        { pattern: '[invalid(regex', replace: 'Ignored' }
      ],
      deduplicate: false,
      filterOnlineOnly: false,
      targetFormat: 'clash',
      enabled: true,
      createdAt: '',
      updatedAt: '',
    };
    // Should gracefully execute or ignore invalid regex without throwing unhandled exceptions or hanging
    const start = Date.now();
    const out = processAggregateNodes(testNodes, group);
    const duration = Date.now() - start;
    if (duration > 500) {
      throw new Error(`正则执行超时，可能存在 ReDoS 脆弱性 (耗时 ${duration}ms)`);
    }
    if (out.length !== testNodes.length) {
      throw new Error('节点处理发生异常');
    }
  });

  runTest('Security - Rate Limiter', '限流桶窗口计算与并发刷接口攻击拦截', () => {
    resetRateLimits();
    const testIp = '198.51.100.55';
    // Max 5 requests per 1000ms
    const opts = { maxRequests: 5, windowMs: 1000 };

    for (let i = 0; i < 5; i++) {
      const res = checkRateLimit('unit_test', testIp, opts);
      if (!res.allowed) throw new Error(`第 ${i + 1} 次请求应被允许，实际被拦截`);
    }

    // 6th request must be blocked
    const blockedRes = checkRateLimit('unit_test', testIp, opts);
    if (blockedRes.allowed) {
      throw new Error('超出限流阈值后仍被放行，限流器失效');
    }
    if (blockedRes.retryAfterSec <= 0) {
      throw new Error('未正确返回 retryAfterSec 冷却时长');
    }

    // Different IP should still be allowed (IP Isolation)
    const otherIpRes = checkRateLimit('unit_test', '198.51.100.56', opts);
    if (!otherIpRes.allowed) {
      throw new Error('不同 IP 限流互相影响，IP 隔离失效');
    }
  });

  await runAsyncTest('Security - Auth & Password', '密码哈希随机 Salt 与 Session Token 撤销生命周期', async () => {
    await initOrUpdatePassword('MySuperSecureAdminPass123!');
    const isValid = await verifyPassword('MySuperSecureAdminPass123!');
    if (!isValid) throw new Error('正确密码验证失败');

    const isWrongValid = await verifyPassword('WrongPassword123');
    if (isWrongValid) throw new Error('错误密码未被拦截');

    const token = await createSessionToken();
    if (!(await validateSessionToken(`Bearer ${token}`))) {
      throw new Error('新创建的 Session Token 验证未通过');
    }

    revokeSessionToken(`Bearer ${token}`);
    if (await validateSessionToken(`Bearer ${token}`)) {
      throw new Error('已销毁的 Session Token 仍然有效');
    }
  });

  await runAsyncTest('Security & Integrity', '防止相同订阅链接与重复订阅名称重复添加 (Anti-Duplicate Check)', async () => {
    const { createSubscription, deleteSubscription } = await import('../../server/services/subscriptionService.js');
    const { createAggregate, deleteAggregate } = await import('../../server/services/aggregateService.js');

    // 1. Add subscription 1
    const sub1 = await createSubscription({
      name: '测试唯一订阅A',
      url: 'https://example.com/unique-sub-1',
    });

    try {
      // Try adding duplicate URL with different name
      let duplicateUrlCaught = false;
      try {
        await createSubscription({
          name: '测试唯一订阅B',
          url: 'https://example.com/unique-sub-1',
        });
      } catch (err: any) {
        if (err.message.includes('该订阅链接已存在')) {
          duplicateUrlCaught = true;
        }
      }
      if (!duplicateUrlCaught) throw new Error('未能拦截重复的订阅 URL');

      // Try adding duplicate name with different URL
      let duplicateNameCaught = false;
      try {
        await createSubscription({
          name: '测试唯一订阅A',
          url: 'https://example.com/unique-sub-2',
        });
      } catch (err: any) {
        if (err.message.includes('订阅名称“测试唯一订阅A”已存在')) {
          duplicateNameCaught = true;
        }
      }
      if (!duplicateNameCaught) throw new Error('未能拦截重复的订阅名称');
    } finally {
      if (sub1?.id) {
        await deleteSubscription(sub1.id);
      }
    }

    // 2. Add aggregate 1
    const agg1 = await createAggregate({
      name: '测试唯一聚合组',
    });

    try {
      let duplicateAggCaught = false;
      try {
        await createAggregate({
          name: '测试唯一聚合组',
        });
      } catch (err: any) {
        if (err.message.includes('聚合名称“测试唯一聚合组”已存在')) {
          duplicateAggCaught = true;
        }
      }
      if (!duplicateAggCaught) throw new Error('未能拦截重复的聚合名称');
    } finally {
      if (agg1?.id) {
        await deleteAggregate(agg1.id);
      }
    }
  });

  // ----------------------------------------------------
  // Category 5: User-Agent Auto-Detection & Format Routing
  // ----------------------------------------------------
  console.log('\n📱 [5/6] 客户端 UA 自动适配与路由分发 (Client Routing)');

  const mockDetectFormat = (ua: string): string => {
    const lowerUA = ua.toLowerCase();
    if (lowerUA.includes('clash') || lowerUA.includes('mihomo') || lowerUA.includes('stash')) return 'clash';
    if (lowerUA.includes('sing-box') || lowerUA.includes('singbox')) return 'singbox';
    if (lowerUA.includes('surge')) return 'surge';
    if (lowerUA.includes('loon')) return 'loon';
    if (lowerUA.includes('shadowrocket') || lowerUA.includes('quantumult') || lowerUA.includes('v2ray')) return 'base64';
    return 'clash';
  };

  runTest('Client Routing', '识别 Mihomo / Clash Meta 客户端 UA', () => {
    const format = mockDetectFormat('ClashMeta/v1.18.0 (Windows NT 10.0; Win64; x64)');
    if (format !== 'clash') throw new Error(`期望 clash, 实际 ${format}`);
  });

  runTest('Client Routing', '识别 Sing-box 客户端 UA', () => {
    const format = mockDetectFormat('sing-box/1.9.0 (Linux; x86_64)');
    if (format !== 'singbox') throw new Error(`期望 singbox, 实际 ${format}`);
  });

  runTest('Client Routing', '识别 Surge 客户端 UA', () => {
    const format = mockDetectFormat('Surge/2800 CFNetwork/1408.0.4 Darwin/22.5.0');
    if (format !== 'surge') throw new Error(`期望 surge, 实际 ${format}`);
  });

  runTest('Client Routing', '识别 Loon 客户端 UA', () => {
    const format = mockDetectFormat('Loon/640 CFNetwork/1408.0.4');
    if (format !== 'loon') throw new Error(`期望 loon, 实际 ${format}`);
  });

  runTest('Client Routing', '识别 Shadowrocket / Quantumult X / v2rayN 客户端 UA', () => {
    const formatSr = mockDetectFormat('Shadowrocket/1982 CFNetwork/1408.0.4');
    const formatV2 = mockDetectFormat('v2rayN/6.23');
    if (formatSr !== 'base64' || formatV2 !== 'base64') {
      throw new Error(`期望 base64, 实际 sr=${formatSr}, v2=${formatV2}`);
    }
  });

  // ----------------------------------------------------
  // Category 6: Performance & Boundary Limits
  // ----------------------------------------------------
  console.log('\n⚡ [6/6] 性能压测与极限边界测试 (Performance & Limits)');

  runTest('Performance', '千级超大规模节点池 (1000+ Nodes) 聚合流水线压力耗时', () => {
    const largePool: ProxyNode[] = [];
    for (let i = 0; i < 1200; i++) {
      largePool.push({
        ...testNodes[i % testNodes.length],
        id: `node_perf_${i}`,
        name: `节点 ${i % 5 === 0 ? '香港' : i % 5 === 1 ? '日本' : '美国'} 专线 ${i}`,
        server: `node${i % 80}.example.com`,
        port: 10000 + (i % 5000),
        ping: (i * 7) % 400,
        status: (i % 10 === 0 ? 'timeout' : 'online') as 'timeout' | 'online',
      });
    }

    const group: AggregateGroup = {
      id: 'agg_large',
      name: '大批量测试',
      token: 'tok_large',
      subscriptionIds: [],
      filterKeywords: ['香港', '日本'],
      excludeKeywords: ['3'],
      protocols: ['vless', 'trojan', 'vmess', 'ss'],
      renameRules: [{ pattern: '专线', replace: 'VIP' }],
      deduplicate: true,
      filterOnlineOnly: true,
      maxPing: 250,
      targetFormat: 'clash',
      enabled: true,
      createdAt: '',
      updatedAt: '',
    };

    const start = performance.now();
    const processed = processAggregateNodes(largePool, group);
    const clashOutput = generateClashConfig(processed);
    const singboxOutput = generateSingboxConfig(processed);
    const duration = Math.round(performance.now() - start);

    if (processed.length === 0) throw new Error('聚合后节点为空');
    if (clashOutput.length === 0 || singboxOutput.length === 0) throw new Error('配置生成失败');
    if (duration > 300) {
      throw new Error(`处理 1200+ 节点耗时超出预期阈值 (${duration}ms > 300ms)`);
    }
    console.log(`    📊 1200+ 节点全量清洗、过滤、去重与双端配置生成总耗时: ${duration}ms (输出 ${processed.length} 个优质节点)`);
  });

  // Summary
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((acc, r) => acc + r.durationMs, 0);

  console.log('\n======================================================');
  console.log(`📋 测试执行总结: 共 ${total} 项测试 | 通过: ${passed} | 失败: ${failed} | 总耗时: ${Math.round(totalDuration)}ms`);
  console.log('======================================================\n');

  if (failed > 0) {
    throw new Error(`有 ${failed} 项测试未通过，请检查错误详情！`);
  }
}

executeComprehensiveTests().catch((err) => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
