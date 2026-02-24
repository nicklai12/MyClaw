import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function main() {
  const url = 'https://mcp.tavily.com/mcp/?tavilyApiKey=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';

  const client = new Client(
    { name: 'myclaw-test', version: '1.0.0' },
    { capabilities: {} }
  );

  const transport = new StreamableHTTPClientTransport(new URL(url));

  console.log('正在連線 Tavily MCP Server...');
  await client.connect(transport);
  console.log('連線成功！');

  // 列出所有工具
  const { tools } = await client.listTools();
  console.log(`\n可用工具數量: ${tools.length}`);
  for (const tool of tools) {
    console.log(`\n--- ${tool.name} ---`);
    console.log(`描述: ${tool.description}`);
    console.log(`參數: ${JSON.stringify(tool.inputSchema, null, 2)}`);
  }

  // 嘗試呼叫 tavily_search (underscore, not hyphen)
  console.log('\n\n=== 測試呼叫 tavily_search ===');
  try {
    const startTime = Date.now();
    const result = await client.callTool({
      name: 'tavily_search',
      arguments: { query: 'MCP protocol 2025', max_results: 3 }
    });
    const elapsed = Date.now() - startTime;
    console.log(`耗時: ${elapsed}ms`);
    console.log('搜尋結果:', JSON.stringify(result, null, 2).substring(0, 3000));
  } catch (e) {
    console.error('搜尋呼叫失敗:', e);
  }

  // 嘗試呼叫 tavily_extract
  console.log('\n\n=== 測試呼叫 tavily_extract ===');
  try {
    const startTime = Date.now();
    const result = await client.callTool({
      name: 'tavily_extract',
      arguments: { urls: ['https://modelcontextprotocol.io/introduction'] }
    });
    const elapsed = Date.now() - startTime;
    console.log(`耗時: ${elapsed}ms`);
    const text = JSON.stringify(result, null, 2);
    console.log('擷取結果:', text.substring(0, 2000));
    if (text.length > 2000) console.log(`... (截斷, 總長度 ${text.length} 字元)`);
  } catch (e) {
    console.error('擷取呼叫失敗:', e);
  }

  await client.close();
  console.log('\n連線已關閉');
}

main().catch(console.error);
