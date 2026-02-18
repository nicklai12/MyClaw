#!/usr/bin/env tsx
// ============================================
// 測試用 MCP Server — 提供簡單工具驗證 MCP 整合
// ============================================
// 透過 stdio transport 運行，提供 3 個測試工具：
// 1. get_current_time — 取得當前時間
// 2. fetch_webpage — 抓取網頁文字內容
// 3. calculate — 數學運算

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'myclaw-test-tools',
  version: '1.0.0',
});

// 工具 1：取得當前時間
server.tool(
  'get_current_time',
  '取得當前日期時間和時區資訊',
  {
    timezone: z.string().optional().describe('時區名稱（如 Asia/Taipei），預設 UTC'),
  },
  async ({ timezone }) => {
    const tz = timezone || 'UTC';
    try {
      const now = new Date();
      const formatted = now.toLocaleString('zh-TW', { timeZone: tz });
      const iso = now.toISOString();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              timezone: tz,
              formatted,
              iso,
              unix: Math.floor(now.getTime() / 1000),
            }),
          },
        ],
      };
    } catch {
      return {
        content: [{ type: 'text' as const, text: `無效的時區: ${tz}` }],
        isError: true,
      };
    }
  }
);

// 工具 2：抓取網頁文字
server.tool(
  'fetch_webpage',
  '抓取指定 URL 的網頁內容，回傳純文字摘要',
  {
    url: z.string().url().describe('要抓取的網頁 URL'),
    max_length: z.number().optional().describe('最大回傳字元數，預設 2000'),
  },
  async ({ url, max_length }) => {
    const maxLen = max_length || 2000;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'MyClaw-MCP-Test/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        return {
          content: [{ type: 'text' as const, text: `HTTP ${response.status}: ${response.statusText}` }],
          isError: true,
        };
      }
      let text = await response.text();
      // 簡易 HTML → 純文字
      text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
      text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
      text = text.replace(/<[^>]+>/g, ' ');
      text = text.replace(/\s+/g, ' ').trim();
      if (text.length > maxLen) {
        text = text.substring(0, maxLen) + '...(已截斷)';
      }
      return {
        content: [{ type: 'text' as const, text }],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text' as const, text: `抓取失敗: ${msg}` }],
        isError: true,
      };
    }
  }
);

// 工具 3：數學運算
server.tool(
  'calculate',
  '執行數學運算（加減乘除、次方等）',
  {
    expression: z.string().describe('數學運算式，例如 "2 + 3 * 4" 或 "Math.sqrt(144)"'),
  },
  async ({ expression }) => {
    try {
      // 安全驗證：只允許數字、運算符、Math 函式
      const safe = /^[\d\s+\-*/().,%^]+$|^Math\.\w+\([\d\s+\-*/().,]+\)$/;
      if (!safe.test(expression)) {
        return {
          content: [{ type: 'text' as const, text: `不安全的運算式: ${expression}` }],
          isError: true,
        };
      }
      // eslint-disable-next-line no-eval
      const result = Function('"use strict"; return (' + expression + ')')();
      return {
        content: [{ type: 'text' as const, text: `${expression} = ${result}` }],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text' as const, text: `運算失敗: ${msg}` }],
        isError: true,
      };
    }
  }
);

// 啟動 stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[test-mcp-server] 已啟動，提供 3 個工具');
}

main().catch((err) => {
  console.error('[test-mcp-server] 啟動失敗:', err);
  process.exit(1);
});
