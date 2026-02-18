// ============================================
// MCP Client Manager — 全域 MCP Server 連線管理
// ============================================
// 管理 MCP Server 連線生命週期、工具列表快取、工具呼叫路由。
// SDK v1.26+ 提供 CJS 版本，可直接靜態 import。

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition, ToolCall, McpServerConfig } from './config';

// ============================================
// 型別定義
// ============================================

interface ConnectedServer {
  client: Client;
  transport: StdioClientTransport | SSEClientTransport;
  tools: ToolDefinition[];
  name: string;
}

// ============================================
// 模組狀態
// ============================================

const servers = new Map<string, ConnectedServer>();

// ============================================
// 初始化
// ============================================

/**
 * 初始化所有配置的 MCP Servers
 * 在 server 啟動時呼叫一次（index.ts main()）
 */
export async function initMcpClients(configs: McpServerConfig[]): Promise<void> {
  for (const config of configs) {
    try {
      await connectServer(config);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[mcp] 連線 MCP server "${config.name}" 失敗: ${msg}`);
      // 不中斷啟動 — 其他 server 可能仍可用
    }
  }

  const total = servers.size;
  const totalTools = Array.from(servers.values()).reduce((sum, s) => sum + s.tools.length, 0);
  console.log(`[mcp] 已連線 ${total} 個 MCP server，共 ${totalTools} 個工具`);
}

/**
 * 連線到單一 MCP server
 */
async function connectServer(config: McpServerConfig): Promise<void> {
  const client = new Client(
    { name: 'myclaw', version: '1.0.0' },
    { capabilities: {} }
  );

  let transport: StdioClientTransport | SSEClientTransport;

  if (config.transport.type === 'stdio') {
    transport = new StdioClientTransport({
      command: config.transport.command,
      args: config.transport.args || [],
      env: config.transport.env,
    });
  } else if (config.transport.type === 'sse') {
    transport = new SSEClientTransport(new URL(config.transport.url));
  } else {
    throw new Error(`[mcp] 不支援的 transport 類型: ${(config.transport as { type: string }).type}`);
  }

  await client.connect(transport);

  // 取得 server 提供的工具清單
  const { tools: mcpTools } = await client.listTools();

  // 轉換為 MyClaw ToolDefinition，加前綴避免名稱衝突
  const toolDefs: ToolDefinition[] = mcpTools.map((t: McpTool) => ({
    name: `mcp__${config.name}__${t.name}`,
    description: t.description || `MCP tool: ${t.name}`,
    input_schema: (t.inputSchema || { type: 'object', properties: {} }) as Record<string, unknown>,
  }));

  servers.set(config.name, { client, transport, tools: toolDefs, name: config.name });
  console.log(`[mcp] 已連線 "${config.name}"，提供 ${toolDefs.length} 個工具`);
}

// ============================================
// 工具查詢
// ============================================

/**
 * 取得指定 server 群的 ToolDefinition[]
 * 技能透過 api_config.mcp_servers 聲明要使用哪些 server
 */
export function getMcpToolsForServers(serverNames: string[]): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  for (const name of serverNames) {
    const server = servers.get(name);
    if (server) {
      tools.push(...server.tools);
    } else {
      console.warn(`[mcp] 技能引用的 MCP server "${name}" 未連線`);
    }
  }
  return tools;
}

/**
 * 取得所有已連線 server 的工具
 */
export function getAllMcpTools(): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  for (const server of servers.values()) {
    tools.push(...server.tools);
  }
  return tools;
}

/**
 * 取得已連線的 MCP server 名稱列表
 */
export function getConnectedServerNames(): string[] {
  return Array.from(servers.keys());
}

// ============================================
// 工具呼叫
// ============================================

/**
 * 判斷 ToolCall 是否為 MCP 工具（根據 mcp__ 前綴）
 */
export function isMcpToolCall(tc: ToolCall): boolean {
  return tc.name.startsWith('mcp__');
}

/**
 * 執行 MCP 工具呼叫
 * 解析前綴 mcp__{serverName}__{toolName}，路由到對應 server
 */
export async function callMcpTool(
  prefixedName: string,
  args: Record<string, unknown>
): Promise<string> {
  // 解析前綴：mcp__playwright__browser_navigate → server=playwright, tool=browser_navigate
  const parts = prefixedName.split('__');
  if (parts.length < 3 || parts[0] !== 'mcp') {
    return JSON.stringify({ error: true, message: `無效的 MCP 工具名稱: ${prefixedName}` });
  }
  const serverName = parts[1];
  const toolName = parts.slice(2).join('__'); // 工具名稱本身可能含 __

  const server = servers.get(serverName);
  if (!server) {
    return JSON.stringify({ error: true, message: `MCP server "${serverName}" 未連線` });
  }

  try {
    console.log(`[mcp] 呼叫工具 "${toolName}" (server: ${serverName})`);
    const result = await server.client.callTool(
      { name: toolName, arguments: args },
      undefined,
      { timeout: 120_000 }  // 120 秒，Playwright 瀏覽大型網站需要較長時間
    );

    // MCP tool result 是 content 陣列，序列化為字串回傳給 LLM
    const content = result.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }> | undefined;
    if (!content || content.length === 0) {
      return JSON.stringify(result);
    }

    const textParts = content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text!);

    if (textParts.length > 0) {
      const combined = textParts.join('\n');
      // 截斷過長的結果，避免灌爆 LLM context
      if (combined.length > 3000) {
        return combined.substring(0, 3000) + '\n...(結果已截斷，共 ' + combined.length + ' 字元)';
      }
      return combined;
    }

    // 非文字結果（如 image）：回傳 JSON 描述
    return JSON.stringify(content);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[mcp] 工具 "${toolName}" (server: ${serverName}) 執行失敗: ${msg}`);
    return JSON.stringify({ error: true, message: `MCP 工具執行失敗: ${msg}` });
  }
}

// ============================================
// 生命週期管理
// ============================================

/**
 * Graceful shutdown 所有 MCP 連線
 */
export async function shutdownMcpClients(): Promise<void> {
  for (const [name, server] of servers.entries()) {
    try {
      await server.client.close();
      console.log(`[mcp] 已斷開 "${name}"`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[mcp] 斷開 "${name}" 失敗: ${msg}`);
    }
  }
  servers.clear();
}
