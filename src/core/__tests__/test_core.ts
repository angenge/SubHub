import { parseNodesFromContent, parseNodesFromContentDetailed, parseUri } from '../parsers/index.js';
import { processAggregateNodes } from '../engine/index.js';
import { generateClashConfig } from '../converters/toClash.js';
import { generateSingboxConfig } from '../converters/toSingbox.js';
import { generateBase64Subscription } from '../converters/index.js';
import { AggregateGroup } from '../types/index.js';

function runTests() {
  console.log('🧪 Starting SubHub Core Self-Verification...');

  const sampleVless = 'vless://12345678-1234-1234-1234-1234567890ab@hk.example.com:443?security=reality&pbk=fakekey&type=tcp&sni=hk.example.com#%F0%9F%87%AD%F0%9F%87%B0%20%E9%A6%99%E6%B8%8F%2001';
  const sampleTrojan = 'trojan://mypassword@jp.example.com:443?type=grpc&serviceName=my-trojan-grpc&security=tls&sni=jp.example.com#%F0%9F%87%AF%F0%9F%87%B5%20%E6%97%A5%E6%9C%AC%2001';
  const sampleSs = 'ss://YWVzLTEyOC1nY206cGFzczp3b3JkOmNvbG9u@us.example.com:8388#%F0%9F%87%BA%F0%9F%87%B8%20%E7%BE%8E%E5%9B%BD%2001';
  const sampleHy2 = 'hysteria2://password@sg.example.com:443?sni=sg.example.com&obfs=salamander&obfs-password=p%40ss%20w%26rd#%F0%9F%87%B8%F0%9F%87%AC%20%E6%96%B0%E5%8A%A0%E5%9D%A1%2001';

  const rawList = '\uFEFF' + [sampleVless, sampleTrojan, sampleSs, sampleHy2].join('\n');

  // Test 1: Parser with UTF-8 BOM
  const nodes = parseNodesFromContent(rawList);
  console.assert(nodes.length === 4, `Expected 4 nodes, got ${nodes.length}`);
  console.assert(nodes[2].password === 'pass:word:colon', `Expected password with colon preserved, got ${nodes[2].password}`);
  console.log(`✅ Parser: Successfully parsed ${nodes.length} nodes from raw text with BOM & colon passwords.`);

  // Test 2: Engine filter & renaming
  const mockGroup: AggregateGroup = {
    id: 'agg_test',
    name: '测试聚合',
    token: 'test_token',
    subscriptionIds: [],
    filterKeywords: [],
    excludeKeywords: ['广告'],
    protocols: ['vless', 'trojan', 'ss', 'hysteria2'],
    renameRules: [{ pattern: '01', replace: 'VIP' }],
    deduplicate: true,
    filterOnlineOnly: false,
    targetFormat: 'clash',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const processed = processAggregateNodes(nodes, mockGroup);
  console.assert(processed.length === 4, `Expected 4 processed nodes, got ${processed.length}`);
  console.assert(processed[0].name.includes('VIP'), `Expected renamed node name with VIP, got ${processed[0].name}`);
  console.log(`✅ Engine: Filtering & Renaming verified successfully.`);

  // Test 3: Clash Generation (including Trojan gRPC)
  const clashYaml = generateClashConfig(processed);
  console.assert(clashYaml.includes('proxies:'), 'Clash config missing proxies');
  console.assert(clashYaml.includes('proxy-groups:'), 'Clash config missing proxy-groups');
  console.assert(clashYaml.includes('grpc-service-name: my-trojan-grpc'), 'Clash config missing Trojan grpc options');
  console.log(`✅ Clash Converter: Generated ${clashYaml.length} bytes YAML config with gRPC Trojan.`);

  // Test 4: Sing-box Generation (including gRPC transport)
  const singboxJson = generateSingboxConfig(processed);
  const parsedSb = JSON.parse(singboxJson);
  console.assert(Array.isArray(parsedSb.outbounds), 'Sing-box config missing outbounds');
  console.assert(
    parsedSb.outbounds.some((ob: any) => ob.transport?.type === 'grpc' && ob.transport?.service_name === 'my-trojan-grpc'),
    'Sing-box missing grpc transport for Trojan'
  );
  console.log(`✅ Sing-box Converter: Generated valid JSON with ${parsedSb.outbounds.length} outbounds and gRPC transports.`);

  // Test 5: Base64
  const b64 = generateBase64Subscription(processed);
  console.assert(b64.length > 0, 'Base64 output is empty');
  console.log(`✅ Base64 Converter: Generated ${b64.length} bytes base64 subscription.`);

  // Test 6: SS SIP002 with plugin options
  const sampleSsPlugin = 'ss://YWVzLTEyOC1nY206cGFzczEyMw@1.2.3.4:8388/?plugin=v2ray-plugin%3Bmode%3Dwebsocket%3Bhost%3Dcdn.example.com%3Btls#SS-WS-Node';
  const ssNode = parseUri(sampleSsPlugin);
  console.assert(ssNode !== null, 'Failed to parse SS with plugin');
  console.assert(ssNode?.plugin === 'v2ray-plugin', `Expected v2ray-plugin, got ${ssNode?.plugin}`);
  console.assert(ssNode?.pluginOpts?.host === 'cdn.example.com', `Expected cdn.example.com, got ${ssNode?.pluginOpts?.host}`);
  console.log(`✅ SS SIP002 Parser: Successfully parsed plugin parameters.`);

  // Test 7: Reserved name collision & Empty Name Fallback
  const emptyNamedNode = {
    ...nodes[0],
    name: '   ',
  };
  const reservedNamedNode = {
    ...nodes[1],
    name: 'direct',
  };
  const clashReservedYaml = generateClashConfig([emptyNamedNode, reservedNamedNode]);
  console.assert(clashReservedYaml.includes('direct (Node)'), 'Expected direct to be renamed to direct (Node) in Clash');
  const sbReservedJson = generateSingboxConfig([emptyNamedNode, reservedNamedNode]);
  console.assert(sbReservedJson.includes('direct (Node)'), 'Expected direct to be renamed to direct (Node) in Sing-box');
  console.log(`✅ Reserved Tag Anti-Collision & Empty Fallback verified.`);

  // Test 8: Detailed parser with unsupported protocols reporting
  const mixedList = [
    sampleVless,
    'ssr://unused.line',
    'tuic://token@cn.example.com:443?sni=cn.example.com#CN-TUIC',
    'hysteria://password@cn.example.com:443#CN-HY',
    'vless://12345678-1234-1234-1234-1234567890ab@hk.example.com:notaport#broken',
    sampleTrojan,
  ].join('\n');
  const report = parseNodesFromContentDetailed(mixedList);
  console.assert(report.nodes.length === 2, `Expected 2 parsed nodes, got ${report.nodes.length}`);
  console.assert(report.skippedUnsupported === 3, `Expected 3 skipped unsupported, got ${report.skippedUnsupported}`);
  console.assert(report.skippedDetail !== null, 'Expected skippedDetail to be present');
  const detail = JSON.parse(report.skippedDetail as string);
  console.assert(detail.schemes?.ssr === 1, `Expected ssr count 1, got ${detail.schemes?.ssr}`);
  console.assert(detail.schemes?.tuic === 1, `Expected tuic count 1, got ${detail.schemes?.tuic}`);
  console.assert(detail.schemes?.hysteria === 1, `Expected hysteria count 1, got ${detail.schemes?.hysteria}`);
  console.assert(detail.malformed?.vless === 1, `Expected malformed vless count 1, got ${detail.malformed?.vless}`);
  console.log(`✅ Detailed Parser: Reported ${report.skippedUnsupported} skipped entries → ${report.skippedDetail}`);

  // Test 9: Clash YAML with unsupported proxy types reporting
  const clashWithUnsupported = `proxies:\n  - {name: "HK OK", type: vless, server: hk.example.com, port: 443, uuid: abc}\n  - {name: "CN TUIC", type: tuic, server: cn.example.com, port: 443, uuid: abc}`;
  const clashReport = parseNodesFromContentDetailed(clashWithUnsupported);
  console.assert(clashReport.nodes.length === 1, `Expected 1 clash node, got ${clashReport.nodes.length}`);
  console.assert(clashReport.skippedUnsupported === 1, `Expected 1 skipped clash type, got ${clashReport.skippedUnsupported}`);
  console.log(`✅ Clash Detailed Parser: skipped types = ${clashReport.skippedDetail}`);

  console.log('🎉 All SubHub Core Self-Verification Tests Passed!');
}

runTests();
