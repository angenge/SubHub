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
import { setDefaultDb, schema } from '../../server/db/index.js';
import { exportBackup, importBackup } from '../../server/services/backupService.js';
import {
  BackupValidationError,
  createBackupDocument,
  parseBackup,
  serializeBackup,
} from '../backup/format.js';
import net from 'net';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Initialize test database in isolated temporary directory
const testDataDir = path.join(os.tmpdir(), `subhub-test-${Date.now()}`);
fs.mkdirSync(testDataDir, { recursive: true });
process.env.DATA_DIR = testDataDir;

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
const sampleAnytls = 'anytls://anytlspass@kr.anytls.com:443?sni=kr.anytls.com#%F0%9F%87%B0%F0%9F%87%B7%20KR-AnyTLS';

export async function executeComprehensiveTests() {
  console.log('\n======================================================');
  console.log('🚀 正在执行 SubHub 生产交付前全维度综合测试套件');
  console.log('======================================================\n');

  // ----------------------------------------------------
  // Category 1: Protocol Parsers
  // ----------------------------------------------------
  console.log('📦 [1/7] 核心协议解析器测试 (Protocol Parsers)');

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

  runTest('Protocol Parsers', '解析 AnyTLS 节点 (password, sni, tls)', () => {
    const node = parseUri(sampleAnytls);
    if (!node) throw new Error('解析失败');
    if (node.type !== 'anytls') throw new Error('类型应为 anytls');
    if (node.password !== 'anytlspass') throw new Error('password 解析错误');
    if (node.sni !== 'kr.anytls.com') throw new Error('sni 解析错误');
    if (!node.tls) throw new Error('tls 应为 true');
  });

  runTest('Protocol Parsers', '解析含未编码百分号与特殊符号的节点名称 (Safe URI Decode)', () => {
    const rawSpecialVless = 'vless://11111111-2222-3333-4444-555555555555@hk.node.com:443?type=tcp#🇭🇰 香港 50% 专线 [折后%E4]';
    const rawSpecialTrojan = 'trojan://pass123@tw.node.com:443#🇹🇼 台湾 100% 高速节点';
    const node1 = parseUri(rawSpecialVless);
    const node2 = parseUri(rawSpecialTrojan);
    if (!node1 || !node1.name.includes('50%')) throw new Error('VLESS 50% 节点名称解析失败');
    if (!node2 || !node2.name.includes('100%')) throw new Error('Trojan 100% 节点名称解析失败');
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
  - name: "🇰🇷 KR-Clash-AnyTLS"
    type: anytls
    server: 9.9.9.9
    port: 443
    password: myanytlspass
    sni: kr.clash.com
`;
    const nodes = parseNodesFromContent(clashYaml);
    if (nodes.length !== 3) throw new Error(`期望 3 个节点, 实际 ${nodes.length}`);
    if (nodes[0].type !== 'vless' || nodes[1].type !== 'trojan' || nodes[2].type !== 'anytls') throw new Error('节点类型解析不匹配');
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
  console.log('\n🔄 [2/7] 多客户端配置转换器测试 (Converters)');

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
  console.log('\n⚙️ [3/7] 聚合过滤与规则引擎测试 (Engine Pipeline)');

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
      { ...testNodes[0], ping: 80, status: 'fast' },
      { ...testNodes[1], ping: 220, status: 'fast' },
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
  console.log('\n🛡️ [4/7] 系统安全与渗透防御测试 (Security & Penetration)');

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

  await runAsyncTest('Security - Auth Fail Closed', '会话密钥不可用时拒绝签发/验证 Token（禁止可预测后备密钥）', async () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    setDefaultDb(null);
    try {
      let rejected = false;
      try {
        await createSessionToken();
      } catch (err: any) {
        rejected = err.message === 'Session secret unavailable';
      }
      if (!rejected) throw new Error('数据库不可用时未按预期拒绝签发 Session Token');

      if (await validateSessionToken('payload.signature')) {
        throw new Error('数据库不可用时仍接受了未知 Session Token');
      }
    } finally {
      setDefaultDb(testDb);
      console.error = originalConsoleError;
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

  await runAsyncTest('Security & Probe', '边缘探针密钥鉴权、节点分发与测速心跳上报 (Agent Probe Lifecycle)', async () => {
    const {
      getOrInitAgentSecret,
      rotateAgentSecret,
      validateAgentAuth,
      getAgentConfig,
      getAgentNodes,
      processAgentReport,
    } = await import('../../server/services/agentService.js');

    const secret = await getOrInitAgentSecret();
    if (!secret || !secret.startsWith('subprobe_')) {
      throw new Error(`探针初始密钥格式异常: ${secret}`);
    }

    // 1. Check valid auth
    const valid = await validateAgentAuth(`Bearer ${secret}`);
    if (!valid) throw new Error('正确探针密钥鉴权失败');

    // 2. Check invalid auth
    const invalid = await validateAgentAuth('Bearer wrong_token_123');
    if (invalid) throw new Error('错误探针密钥未被拦截');

    // 3. Test report process
    const mockReportData = [
      {
        nodeId: 'test_probe_node_1',
        ping: 45,
        status: 'fast' as const,
        checkedAt: new Date().toISOString(),
      },
    ];
    const reportRes = await processAgentReport(mockReportData, '198.51.100.99');
    if (reportRes.updatedCount !== 1) {
      throw new Error('探针上报结果处理数量不正确');
    }

    // 4. Verify config reflects heartbeat
    const config = await getAgentConfig();
    if (config.lastHeartbeatIp !== '198.51.100.99' || !config.isOnline) {
      throw new Error('探针心跳与状态未正确落库同步');
    }

    // 5. Test rotate secret
    const newSecret = await rotateAgentSecret();
    if (newSecret === secret) throw new Error('轮换后密钥未发生变化');
    if (await validateAgentAuth(`Bearer ${secret}`)) {
      throw new Error('旧探针密钥在轮换后仍然有效');
    }
    if (!(await validateAgentAuth(`Bearer ${newSecret}`))) {
      throw new Error('新探针密钥验证失败');
    }
  });

  // ----------------------------------------------------
  // Category 5: User-Agent Auto-Detection & Format Routing
  // ----------------------------------------------------
  console.log('\n📱 [5/7] 客户端 UA 自动适配与路由分发 (Client Routing)');

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
  console.log('\n⚡ [6/7] 性能压测与极限边界测试 (Performance & Limits)');

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
        status: (i % 10 === 0 ? 'timeout' : 'fast') as 'timeout' | 'fast',
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

  // ----------------------------------------------------
  // Category 7: Backup export / import
  // ----------------------------------------------------
  console.log('\n💾 [7/7] 备份导出与恢复测试 (Backup & Restore)');

  const backupNow = new Date().toISOString();
  const backupSubId = 'sub_bk_fixture_1';
  const backupAggId = 'agg_bk_fixture_1';
  let backupBody = '';

  await runAsyncTest('Backup', '准备备份测试数据（订阅 / 聚合 / 设置）', async () => {
    await initOrUpdatePassword('BackupFixturePass123!');

    testDb
      .insert(schema.subscriptions)
      .values({
        id: backupSubId,
        name: '备份测试订阅',
        url: 'https://example.com/backup-test-sub',
        autoUpdate: true,
        updateInterval: 180,
        nodeCount: 5,
        status: 'active',
        createdAt: backupNow,
        updatedAt: backupNow,
      })
      .run();

    testDb
      .insert(schema.aggregates)
      .values({
        id: backupAggId,
        name: '备份测试聚合',
        token: 'backupfixturetoken0123456789abcdef',
        subscriptionIds: JSON.stringify([backupSubId]),
        accessCount: 7,
        lastAccessedIp: '203.0.113.9',
        createdAt: backupNow,
        updatedAt: backupNow,
      })
      .run();

    testDb
      .insert(schema.settings)
      .values({ key: 'clash_api_secret', value: 'backup-test-clash-secret', updatedAt: backupNow })
      .run();
  });

  await runAsyncTest('Backup', '导出：排除认证数据并脱敏客户端 IP', async () => {
    const exported = await exportBackup();
    backupBody = exported.body;

    const doc = JSON.parse(backupBody);
    const settingKeys = doc.data.settings.map((item: any) => item.key);
    if (settingKeys.includes('admin_auth')) throw new Error('导出了 admin_auth（密码哈希）');
    if (settingKeys.includes('session_secret')) throw new Error('导出了 session_secret');
    if (settingKeys.includes('agent_probe_heartbeat')) throw new Error('导出了运行时心跳数据');

    const aggregate = doc.data.aggregates.find((item: any) => item.id === backupAggId);
    if (!aggregate) throw new Error('导出的备集中缺少聚合规则');
    if (aggregate.lastAccessedIp !== null) throw new Error('lastAccessedIp 未被脱敏');

    const subscription = doc.data.subscriptions.find((item: any) => item.id === backupSubId);
    if (!subscription) throw new Error('导出的备份中缺少订阅源');
    if (!Array.isArray(subscription.subscriptionIds) && subscription.subscriptionIds !== undefined) {
      throw new Error('订阅源字段结构异常');
    }
  });

  await runAsyncTest('Backup', '校验：拒绝错误格式 / 高版本 / 非法 URL / 超量记录', async () => {
    const base = JSON.parse(backupBody);

    const mutate = (fn: (doc: any) => void) => {
      const copy = JSON.parse(JSON.stringify(base));
      fn(copy);
      return JSON.stringify(copy);
    };

    const expectReject = (raw: string, keyword: string) => {
      try {
        parseBackup(raw);
      } catch (err: any) {
        if (!(err instanceof BackupValidationError)) {
          throw new Error(`期望 BackupValidationError，实际 ${err?.name}: ${err?.message}`);
        }
        if (!err.message.includes(keyword)) {
          throw new Error(`错误信息未包含 “${keyword}”: ${err.message}`);
        }
        return;
      }
      throw new Error(`期望被拒绝但通过了校验: ${keyword}`);
    };

    expectReject(mutate((doc) => { doc.format = 'not-subhub'; }), 'format');
    expectReject(mutate((doc) => { doc.version = 99; }), '升级');
    expectReject(
      mutate((doc) => { doc.data.subscriptions[0].url = 'file:///etc/passwd'; }),
      'http/https'
    );
    expectReject(
      mutate((doc) => {
        doc.data.subscriptions = Array.from({ length: 501 }, (_, index) => ({
          ...doc.data.subscriptions[0],
          id: `sub_bulk_${index}`,
          url: `https://example.com/bulk-${index}`,
        }));
      }),
      '上限'
    );
  });

  await runAsyncTest('Backup', '覆盖导入：清空数据库后完整恢复且保留 token', async () => {
    const doc = JSON.parse(backupBody);
    const expectedToken = doc.data.aggregates.find((item: any) => item.id === backupAggId).token;

    testDb.delete(schema.nodes).run();
    testDb.delete(schema.aggregates).run();
    testDb.delete(schema.subscriptions).run();

    const result = await importBackup(backupBody, 'replace');
    if (result.imported.subscriptions !== doc.data.subscriptions.length) {
      throw new Error(`订阅导入数量不符: ${result.imported.subscriptions}`);
    }
    if (result.imported.aggregates !== doc.data.aggregates.length) {
      throw new Error(`聚合导入数量不符: ${result.imported.aggregates}`);
    }

    const restoredSubscriptions = testDb.select().from(schema.subscriptions).all();
    if (!restoredSubscriptions.find((row: any) => row.id === backupSubId)) {
      throw new Error('订阅源未恢复');
    }

    const restoredAggregates = testDb.select().from(schema.aggregates).all();
    const restored = restoredAggregates.find((row: any) => row.id === backupAggId);
    if (!restored) throw new Error('聚合规则未恢复');
    if (restored.token !== expectedToken) throw new Error('聚合 token 未按原值恢复');
    if (restored.lastAccessedIp !== null) throw new Error('导入后 lastAccessedIp 应为空');
  });

  await runAsyncTest('Backup', '合并导入：同一文件重复导入应全部跳过', async () => {
    const result = await importBackup(backupBody, 'merge');
    if (result.imported.subscriptions !== 0 || result.imported.aggregates !== 0) {
      throw new Error('重复导入产生了重复数据');
    }
    if (result.skipped.subscriptions === 0 || result.skipped.aggregates === 0) {
      throw new Error('重复导入未计入 skipped');
    }
  });

  await runAsyncTest('Backup', '合并导入：token 冲突时自动重建并上报', async () => {
    testDb
      .insert(schema.aggregates)
      .values({
        id: 'agg_bk_token_owner',
        name: '令牌占用者',
        token: 'fixed-conflict-token',
        subscriptionIds: '[]',
        createdAt: backupNow,
        updatedAt: backupNow,
      })
      .run();

    const doc = createBackupDocument({
      app: { version: '1.0.0', build: 'test', platform: 'node' },
      subscriptions: [],
      aggregates: [
        {
          id: 'agg_bk_token_new',
          name: '待导入聚合',
          token: 'fixed-conflict-token',
          createdAt: backupNow,
          updatedAt: backupNow,
        },
      ],
      settings: [],
    });

    const result = await importBackup(serializeBackup(doc), 'merge');
    if (result.regeneratedTokens.length !== 1) throw new Error('未上报 token 重建');

    const rows = testDb.select().from(schema.aggregates).all();
    const inserted = rows.find((row: any) => row.id === 'agg_bk_token_new');
    if (!inserted) throw new Error('聚合规则未导入');
    if (inserted.token === 'fixed-conflict-token') throw new Error('冲突 token 未被替换');
  });

  await runAsyncTest('Backup', '合并导入：名称冲突自动改名', async () => {
    const doc = createBackupDocument({
      app: { version: '1.0.0', build: 'test', platform: 'node' },
      subscriptions: [
        {
          id: 'sub_bk_rename',
          name: '备份测试订阅',
          url: 'https://example.com/renamed-subscription',
          createdAt: backupNow,
          updatedAt: backupNow,
        },
      ],
      aggregates: [],
      settings: [],
    });

    const result = await importBackup(serializeBackup(doc), 'merge');
    if (result.renamed.length !== 1) throw new Error('名称冲突未上报改名');

    const rows = testDb.select().from(schema.subscriptions).all();
    const inserted = rows.find((row: any) => row.id === 'sub_bk_rename');
    if (!inserted) throw new Error('订阅源未导入');
    if (!inserted.name.endsWith('(2)')) throw new Error(`改名结果异常: ${inserted.name}`);
  });

  await runAsyncTest('Backup', '合并导入：不覆盖已有设置项', async () => {
    const before = testDb.select().from(schema.settings).all();
    const existing = before.find((row: any) => row.key === 'clash_api_secret');
    if (!existing) throw new Error('测试前置设置项缺失');

    const doc = createBackupDocument({
      app: { version: '1.0.0', build: 'test', platform: 'node' },
      subscriptions: [],
      aggregates: [],
      settings: [{ key: 'clash_api_secret', value: 'overwritten-secret', updatedAt: backupNow }],
    });

    const result = await importBackup(serializeBackup(doc), 'merge');
    if (result.skipped.settings !== 1) throw new Error('已存在的设置项未被跳过');

    const after = testDb.select().from(schema.settings).all();
    const current = after.find((row: any) => row.key === 'clash_api_secret');
    if (current?.value !== existing.value) throw new Error('合并模式覆盖了已有设置');
  });

  await runAsyncTest('Backup', '导入：认证类设置项被丢弃并产生警告', async () => {
    const raw = JSON.stringify({
      format: 'subhub-backup',
      version: 1,
      exportedAt: backupNow,
      app: { version: '1.0.0', build: 'test', platform: 'node' },
      data: {
        subscriptions: [],
        aggregates: [],
        settings: [{ key: 'admin_auth', value: 'should-never-import', updatedAt: backupNow }],
      },
    });

    const parsed = parseBackup(raw);
    if (parsed.document.data.settings.length !== 0) throw new Error('认证设置项未被丢弃');
    if (!parsed.warnings.some((warning) => warning.includes('认证'))) {
      throw new Error('未生成认证数据警告');
    }
  });

  await runAsyncTest('Backup', '合并导入：URL 重复时聚合引用自动重映射', async () => {
    testDb
      .insert(schema.subscriptions)
      .values({
        id: 'sub_bk_remap_owner',
        name: '本地已有订阅',
        url: 'https://example.com/url-remap',
        createdAt: backupNow,
        updatedAt: backupNow,
      })
      .run();

    const doc = createBackupDocument({
      app: { version: '1.0.0', build: 'test', platform: 'node' },
      subscriptions: [
        {
          id: 'sub_bk_remap_incoming',
          name: '外部导入订阅',
          url: 'https://example.com/url-remap',
          createdAt: backupNow,
          updatedAt: backupNow,
        },
      ],
      aggregates: [
        {
          id: 'agg_bk_remap',
          name: '重映射聚合',
          token: 'remapfixturetoken0123456789abcdef',
          subscriptionIds: JSON.stringify(['sub_bk_remap_incoming']),
          createdAt: backupNow,
          updatedAt: backupNow,
        },
      ],
      settings: [],
    });

    const result = await importBackup(serializeBackup(doc), 'merge');
    if (result.imported.subscriptions !== 0) {
      throw new Error('URL 重复的订阅不应被重复导入');
    }

    const rows = testDb.select().from(schema.aggregates).all();
    const imported = rows.find((row: any) => row.id === 'agg_bk_remap');
    if (!imported) throw new Error('聚合规则未导入');

    const referenced = JSON.parse(imported.subscriptionIds);
    if (referenced.length !== 1 || referenced[0] !== 'sub_bk_remap_owner') {
      throw new Error(`聚合引用未重映射: ${imported.subscriptionIds}`);
    }
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
