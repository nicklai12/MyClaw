# Tavily MCP Server 協議研究報告

## 1. Tavily MCP Server 概述

Tavily MCP Server 是 tavily-ai 官方提供的 production-ready MCP server，支援即時網路搜尋、頁面內容擷取、網站結構對映與網站爬取。提供兩種部署方式：

- **Remote（託管）**：直接連線 `https://mcp.tavily.com/mcp/?tavilyApiKey=<key>`，無需本地安裝
- **Local（自架）**：`npx -y tavily-mcp@latest`，需設 `TAVILY_API_KEY` 環境變數

免費額度：每月 1,000 次 API 呼叫。

---

## 2. Transport 協議分析

### 2.1 Tavily Remote Server 使用的 Transport

Tavily 遠端 MCP Server (`mcp.tavily.com/mcp/`) 使用 **Streamable HTTP** transport。這是 MCP 規範 2025-03-26 版本引入的新標準，取代了舊版的 HTTP+SSE transport。

URL 格式：
```
https://mcp.tavily.com/mcp/?tavilyApiKey=<your-api-key>
```

### 2.2 Streamable HTTP vs 舊版 SSE 的差異

| 特性 | Streamable HTTP (新) | HTTP+SSE (舊) |
|------|---------------------|---------------|
| 規範版本 | 2025-03-26 | 2024-11-05（已棄用） |
| 通訊方式 | HTTP POST/GET，可選 SSE 串流 | 固定雙端點 SSE |
| Session 管理 | `Mcp-Session-Id` header | 無正式 session |
| 多連線 | 支援多 SSE stream 並行 | 單一 SSE 連線 |
| 斷線恢復 | `Last-Event-ID` 重連 | 不支援 |
| 伺服器模型 | 獨立 process，多 client | 與 client 1:1 |

**Streamable HTTP 核心流程：**
1. Client 對 MCP endpoint 發送 HTTP POST（帶 JSON-RPC 訊息）
2. Client 設 `Accept: application/json, text/event-stream`
3. Server 回應可以是純 JSON 或 SSE stream
4. Server 可選擇性使用 SSE 來串流多筆回應
5. Session 透過 `Mcp-Session-Id` header 管理

### 2.3 向下相容策略

MCP 規範定義了明確的 fallback 機制，供 client 自動偵測 server 支援的 transport：

```
1. 嘗試 POST InitializeRequest 到 server URL
   ├── 成功 → Streamable HTTP transport
   └── 失敗 (4xx) → 嘗試 GET 開啟 SSE stream
                     ├── 收到 endpoint event → 舊版 HTTP+SSE transport
                     └── 失敗 → 不支援
```

### 2.4 認證方式

Tavily 支援三種認證：
1. **URL Query Parameter**：`?tavilyApiKey=<key>`（最簡單）
2. **Authorization Header**：`Bearer <key>`
3. **OAuth Flow**：透過 MCP Inspector 或相容 client 授權

---

## 3. MCP SDK Transport 支援

### 3.1 目前專案 SDK 版本

專案使用 `@modelcontextprotocol/sdk@^1.26.0`（實際安裝 v1.26.0）。

### 3.2 可用的 Client Transport

SDK v1.26.0 提供以下 client transport（均已存在於 `dist/cjs/client/` 下）：

| Transport | Import Path | 用途 |
|-----------|-------------|------|
| `StdioClientTransport` | `@modelcontextprotocol/sdk/client/stdio.js` | 本地 subprocess |
| `SSEClientTransport` | `@modelcontextprotocol/sdk/client/sse.js` | 舊版遠端 (已棄用) |
| **`StreamableHTTPClientTransport`** | `@modelcontextprotocol/sdk/client/streamableHttp.js` | **新版遠端 (推薦)** |
| `WebSocketClientTransport` | `@modelcontextprotocol/sdk/client/websocket.js` | WebSocket |

### 3.3 使用範例

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

// 方式一：直接使用 Streamable HTTP（推薦）
const client = new Client({ name: 'myclaw', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(
  new URL('https://mcp.tavily.com/mcp/?tavilyApiKey=<key>')
);
await client.connect(transport);

// 方式二：Streamable HTTP + SSE fallback（最大相容性）
try {
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
  await client.connect(transport);
} catch (err) {
  // fallback to legacy SSE
  const sseTransport = new SSEClientTransport(new URL(serverUrl));
  await client.connect(sseTransport);
}
```

### 3.4 SDK 版本要點

- v1.10.0 (2025-04-17)：首次支援 Streamable HTTP
- v1.26.0 (目前)：穩定支援，包含 CJS 版本
- v2.x (pre-alpha)：開發中，預計 2026 Q1 穩定版

**結論：目前 SDK v1.26.0 完全支援 Streamable HTTP，無需升級。**

---

## 4. Tavily MCP 提供的工具清單

### 4.1 tavily-search

即時網路搜尋，支援進階過濾、時間範圍、地區設定。

| 參數 | 型別 | 必填 | 預設 | 說明 |
|------|------|------|------|------|
| `query` | string | **是** | — | 搜尋關鍵字 |
| `search_depth` | enum | 否 | `"basic"` | `"basic"` / `"advanced"` / `"fast"` / `"ultra-fast"` |
| `topic` | enum | 否 | `"general"` | `"general"` / `"news"` |
| `days` | number | 否 | `3` | 限制天數範圍（news topic 專用） |
| `time_range` | enum | 否 | — | `"day"` / `"week"` / `"month"` / `"year"` |
| `start_date` | string | 否 | `""` | YYYY-MM-DD 格式 |
| `end_date` | string | 否 | `""` | YYYY-MM-DD 格式 |
| `max_results` | number | 否 | `5` | 最大結果數（5-20） |
| `include_images` | boolean | 否 | `false` | 包含相關圖片 |
| `include_image_descriptions` | boolean | 否 | `false` | AI 生成圖片描述 |
| `include_raw_content` | boolean | 否 | `false` | 包含清理後 HTML |
| `include_domains` | string[] | 否 | `[]` | 限定網域 |
| `exclude_domains` | string[] | 否 | `[]` | 排除網域 |
| `country` | string | 否 | `""` | 限定國家（165 國） |
| `include_favicon` | boolean | 否 | `false` | 包含 favicon URL |

### 4.2 tavily-extract

從 URL 擷取頁面內容，回傳 markdown 或純文字。

| 參數 | 型別 | 必填 | 預設 | 說明 |
|------|------|------|------|------|
| `urls` | string[] | **是** | — | 要擷取的 URL 列表 |
| `extract_depth` | enum | 否 | `"basic"` | `"basic"` / `"advanced"` |
| `include_images` | boolean | 否 | `false` | 包含圖片 |
| `format` | enum | 否 | `"markdown"` | `"markdown"` / `"text"` |
| `include_favicon` | boolean | 否 | `false` | 包含 favicon |
| `query` | string | 否 | — | 用於 reranking 內容區塊 |

### 4.3 tavily-map

對映網站結構，回傳 URL 列表。

| 參數 | 型別 | 必填 | 預設 | 說明 |
|------|------|------|------|------|
| `url` | string | **是** | — | 起始 URL |
| `max_depth` | integer | 否 | `1` | 爬取深度（最小 1） |
| `max_breadth` | integer | 否 | `20` | 爬取廣度（最小 1） |
| `limit` | integer | 否 | `50` | URL 數上限（最小 1） |
| `instructions` | string | 否 | — | 自然語言爬取指示 |
| `select_paths` | string[] | 否 | `[]` | 路徑 regex 過濾 |
| `select_domains` | string[] | 否 | `[]` | 網域 regex 過濾 |
| `allow_external` | boolean | 否 | `true` | 允許外部網域 |

### 4.4 tavily-crawl

從 URL 系統性爬取網站，擷取多頁內容。

| 參數 | 型別 | 必填 | 預設 | 說明 |
|------|------|------|------|------|
| `url` | string | **是** | — | 起始 URL |
| `max_depth` | integer | 否 | `1` | 爬取深度 |
| `max_breadth` | integer | 否 | `20` | 爬取廣度 |
| `limit` | integer | 否 | `50` | 頁面數上限 |
| `instructions` | string | 否 | — | 自然語言爬取指示 |
| `select_paths` | string[] | 否 | `[]` | 路徑 regex |
| `select_domains` | string[] | 否 | `[]` | 網域 regex |
| `allow_external` | boolean | 否 | `true` | 允許外部 |
| `extract_depth` | enum | 否 | `"basic"` | 擷取深度 |
| `format` | enum | 否 | `"markdown"` | 輸出格式 |
| `include_favicon` | boolean | 否 | `false` | 包含 favicon |

### 4.5 tavily-research (新增工具)

綜合研究工具，自動從多個來源收集資訊。

| 參數 | 型別 | 必填 | 預設 | 說明 |
|------|------|------|------|------|
| `input` | string | **是** | — | 研究任務完整描述 |
| `model` | enum | 否 | `"auto"` | `"mini"` / `"pro"` / `"auto"` |

---

## 5. MCP Link 機制說明

### 5.1 什麼是 MCP Link

"MCP Link" 並非一個獨立的正式協議名稱，而是 Tavily（及其他 MCP 服務商）對其**雲端託管的遠端 MCP Server** 的商業行銷名稱。其本質就是一個使用 Streamable HTTP transport 的遠端 MCP server endpoint。

### 5.2 與傳統 MCP 連線的比較

| 特性 | stdio（本地） | SSE（舊遠端） | Streamable HTTP / "MCP Link"（新遠端） |
|------|-------------|-------------|--------------------------------------|
| 部署位置 | 本地 subprocess | 本地或遠端 | **雲端託管** |
| 安裝需求 | 需本地安裝 binary | 需啟動 server | **無需安裝** |
| 連線方式 | stdin/stdout | GET+POST 雙端點 | 單一 HTTP endpoint |
| 認證 | 無（本地） | 自行處理 | API Key / OAuth |
| 維護 | 自行維護 | 自行維護 | **服務商維護** |
| 可用性 | 取決於本地環境 | 取決於 server | **雲端高可用** |

### 5.3 Tavily MCP Link URL 分析

URL `https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-xxx` 結構：

- **Protocol**: HTTPS
- **Host**: `mcp.tavily.com`（Tavily 雲端 MCP Server）
- **Path**: `/mcp/`（MCP endpoint，符合 Streamable HTTP 規範的單一端點）
- **Query**: `tavilyApiKey=<key>`（API Key 認證）
- **Transport**: Streamable HTTP（HTTP POST + 可選 SSE 串流）

---

## 6. 對 MyClaw 整合的初步建議

### 6.1 現狀分析

MyClaw 目前的 MCP client (`mcp-client.ts`) 支援：
- `StdioClientTransport` — stdio 類型
- `SSEClientTransport` — sse 類型

**缺少 `StreamableHTTPClientTransport` 支援**，無法直接連線 Tavily Remote MCP Server。

### 6.2 所需變更

1. **config.ts**：`McpServerConfig.transport` 新增 `streamable-http` 類型
   ```typescript
   export interface McpServerConfig {
     name: string;
     transport:
       | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
       | { type: 'sse'; url: string; headers?: Record<string, string> }
       | { type: 'streamable-http'; url: string; headers?: Record<string, string> };
   }
   ```

2. **mcp-client.ts**：import 並使用 `StreamableHTTPClientTransport`
   ```typescript
   import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
   ```

3. **環境變數配置範例**：
   ```env
   MCP_SERVERS='[{"name":"tavily","transport":{"type":"streamable-http","url":"https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-xxx"}}]'
   ```

4. **建議加入 fallback 機制**：嘗試 Streamable HTTP → 失敗則 fallback 到 SSE，提升相容性

### 6.3 SDK 相容性

- 目前安裝的 `@modelcontextprotocol/sdk@1.26.0` 已包含 `StreamableHTTPClientTransport`
- 位於 `dist/cjs/client/streamableHttp.js`（CJS 版本可直接 import）
- **無需升級 SDK 版本**

### 6.4 風險與注意事項

- Tavily 免費額度每月 1,000 次，需監控用量
- Streamable HTTP 連線可能有 session 管理需求（`Mcp-Session-Id`），SDK 會自動處理
- Remote server 受網路延遲影響，建議 timeout 設較長（如 30-60 秒）
- API Key 透過 URL query 傳遞時需注意 log 中不洩漏 key
