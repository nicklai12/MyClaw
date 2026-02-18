#!/usr/bin/env node
// ============================================
// MCP 端到端測試腳本（不依賴外部 LLM）
// ============================================
// 測試 MCP Client → Test MCP Server 完整管線
// 用法：node test-mcp-e2e.mjs
//
// 驗證項目：
// 1. stdio transport 連線
// 2. listTools 取得工具清單
// 3. callTool 呼叫每個工具並取得結果

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}`);
    failed++;
  }
}

async function main() {
  console.log('🔌 連線到 Test MCP Server (stdio)...\n');

  const client = new Client(
    { name: 'e2e-test', version: '1.0.0' },
    { capabilities: {} }
  );

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/test-mcp-server.ts'],
  });

  await client.connect(transport);
  console.log('【1. 連線測試】');
  assert(true, '成功連線 MCP Server');

  // ---- listTools ----
  console.log('\n【2. listTools 測試】');
  const { tools } = await client.listTools();
  assert(tools.length === 3, `取得 ${tools.length} 個工具（預期 3）`);

  const toolNames = tools.map(t => t.name);
  assert(toolNames.includes('get_current_time'), '包含 get_current_time');
  assert(toolNames.includes('fetch_webpage'), '包含 fetch_webpage');
  assert(toolNames.includes('calculate'), '包含 calculate');

  // ---- callTool: get_current_time ----
  console.log('\n【3. 呼叫 get_current_time】');
  const timeResult = await client.callTool({
    name: 'get_current_time',
    arguments: { timezone: 'Asia/Taipei' },
  });
  const timeText = timeResult.content[0].text;
  const timeData = JSON.parse(timeText);
  assert(timeData.timezone === 'Asia/Taipei', `時區: ${timeData.timezone}`);
  assert(!!timeData.formatted, `格式化時間: ${timeData.formatted}`);
  assert(!!timeData.iso, `ISO 時間: ${timeData.iso}`);
  assert(typeof timeData.unix === 'number', `Unix 時戳: ${timeData.unix}`);

  // ---- callTool: calculate ----
  console.log('\n【4. 呼叫 calculate】');
  const calcResult = await client.callTool({
    name: 'calculate',
    arguments: { expression: '2 + 3 * 4' },
  });
  const calcText = calcResult.content[0].text;
  assert(calcText.includes('14'), `運算結果: ${calcText}`);

  const sqrtResult = await client.callTool({
    name: 'calculate',
    arguments: { expression: 'Math.sqrt(144)' },
  });
  const sqrtText = sqrtResult.content[0].text;
  assert(sqrtText.includes('12'), `平方根結果: ${sqrtText}`);

  // ---- callTool: fetch_webpage ----
  console.log('\n【5. 呼叫 fetch_webpage】');
  const fetchResult = await client.callTool({
    name: 'fetch_webpage',
    arguments: { url: 'https://httpbin.org/html', max_length: 500 },
  });
  const fetchText = fetchResult.content[0].text;
  const fetchOk = fetchText.length > 50 && !fetchResult.isError;
  assert(fetchOk, `抓取網頁: ${fetchText.substring(0, 80)}...`);

  // ---- 工具名稱前綴測試（模擬 mcp-client.ts 邏輯）----
  console.log('\n【6. 工具名稱前綴解析】');
  const prefixed = 'mcp__test__get_current_time';
  const parts = prefixed.split('__');
  assert(parts[0] === 'mcp', `前綴: ${parts[0]}`);
  assert(parts[1] === 'test', `Server 名稱: ${parts[1]}`);
  assert(parts.slice(2).join('__') === 'get_current_time', `工具名稱: ${parts.slice(2).join('__')}`);

  // ---- 關閉 ----
  await client.close();

  // ---- 結果 ----
  console.log('\n' + '='.repeat(40));
  console.log(`結果: ${passed} 通過, ${failed} 失敗`);
  console.log('='.repeat(40));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`${FAIL} 測試失敗:`, err.message);
  process.exit(1);
});
