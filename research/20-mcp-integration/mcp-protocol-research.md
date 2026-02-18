# MCP 協議研究報告

## 目錄
1. [MCP 協議概述](#1-mcp-協議概述)
2. [架構設計](#2-架構設計)
3. [Transport 傳輸層](#3-transport-傳輸層)
4. [Client SDK API 用法](#4-client-sdk-api-用法)
5. [Tool Schema 格式對照表](#5-tool-schema-格式對照表)
6. [現有 MCP Server 生態](#6-現有-mcp-server-生態)
7. [關鍵發現與限制](#7-關鍵發現與限制)
8. [對 MyClaw 整合的影響](#8-對-myclaw-整合的影響)

---

## 1. MCP 協議概述

### 什麼是 MCP

Model Context Protocol (MCP) 是 Anthropic 於 2024 年 11 月推出的開放協議標準，用於標準化 LLM 應用程式與外部資料源及工具之間的整合方式。它解決了每個 LLM 提供者都有自己的工具格式（OpenAI 叫 function calling、Anthropic 叫 tool use、其他各有不同）導致的碎片化問題。

### 協議版本

| 版本 | 日期 | 重要變更 |
|------|------|----------|
| 2024-11-05 | 初始發布 | 基礎 client/server 架構、stdio + HTTP+SSE transport |
| 2025-03-26 | 2025 Q1 | Streamable HTTP 取代 HTTP+SSE |
| 2025-06-18 | 2025 Q2 | Tool outputSchema、structured content、annotations |
| **2025-11-25** | **最新** | Tasks primitive、OAuth 2.1 授權框架、非同步執行 |

### 核心通訊格式

MCP 使用 **JSON-RPC 2.0** 作為訊息編碼格式，所有訊息必須 UTF-8 編碼。

```json
// 請求
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}

// 回應
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [...]
  }
}
```

### MCP 提供的三大 Server 能力

| 能力 | 說明 | 使用者 |
|------|------|--------|
| **Resources** | 上下文資料（檔案、資料庫查詢結果） | 使用者或 AI 模型 |
| **Prompts** | 模板化的 prompt 和工作流程 | 使用者 |
| **Tools** | 可被 AI 模型調用的函式 | AI 模型（model-controlled） |

### MCP 提供的 Client 能力

| 能力 | 說明 |
|------|------|
| **Sampling** | Server 發起的 LLM 呼叫請求 |
| **Roots** | Server 查詢 URI/檔案系統邊界 |
| **Elicitation** | Server 向使用者索取額外資訊 |

---

## 2. 架構設計

### Host / Client / Server 三層架構

```
┌─────────────────────────────────────────┐
│              Host 應用程式               │
│  (Claude Desktop, IDE, MyClaw, etc.)    │
│                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Client 1 │ │ Client 2 │ │ Client 3 │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ │
└───────┼─────────────┼────────────┼───────┘
        │             │            │
   ┌────▼─────┐ ┌────▼─────┐ ┌───▼──────┐
   │ Server 1 │ │ Server 2 │ │ Server 3 │
   │ (Files)  │ │ (DB)     │ │ (API)    │
   └──────────┘ └──────────┘ └──────────┘
```

#### 角色職責

**Host（宿主）**：
- 建立和管理多個 Client 實例
- 控制 Client 連線權限和生命週期
- 執行安全政策和使用者授權
- 協調 AI/LLM 整合
- 聚合來自多個 Client 的上下文

**Client（客戶端）**：
- 每個 Client 與一個 Server 維持 1:1 的有狀態連線
- 處理協議協商和能力交換
- 雙向路由協議訊息
- 維持 Server 之間的安全隔離

**Server（伺服器）**：
- 透過 MCP 原語（Resources、Tools、Prompts）暴露能力
- 獨立運作，專注於特定功能
- 可以是本地程序或遠端服務

### 設計原則

1. **Server 應該極易建構** — Host 處理複雜的編排邏輯
2. **Server 高度可組合** — 多個 Server 可無縫組合
3. **Server 不能看到完整對話** — 只收到必要的上下文資訊
4. **漸進式能力擴展** — 核心協議最小化，額外能力按需協商

### 能力協商（Capability Negotiation）

初始化時，Client 和 Server 互相宣告支援的功能：

```
Client ──InitializeRequest──▶ Server
       {capabilities: {tools: {}, resources: {}}}

Client ◀─InitializeResult─── Server
       {capabilities: {tools: {listChanged: true}}}

Client ──InitializedNotification──▶ Server
       // 開始正常操作
```

### 協議生命週期

```
初始化 (Initialize)
    │
    ▼
能力協商 (Capability Negotiation)
    │
    ▼
正常操作 (Operation)
    │  ├── Client 請求 (tools/call, resources/read)
    │  ├── Server 請求 (sampling, elicitation)
    │  └── 通知 (notifications)
    │
    ▼
關閉 (Shutdown)
```

---

## 3. Transport 傳輸層

MCP 定義了兩種標準 transport（2025-11-25 規格）：

### 3.1 stdio Transport

Client 以子程序方式啟動 Server，透過 stdin/stdout 通訊。

```
Client ───stdin───▶ Server Process
Client ◀──stdout─── Server Process
          stderr ──▶ (log output, optional)
```

**特點**：
- 訊息以換行符分隔，不可包含嵌入的換行符
- Server 的 stdout 只能輸出有效 MCP 訊息
- stderr 用於日誌（非錯誤指示）
- **最簡單的 transport，Client 應優先支援**

**適用場景**：本地工具（檔案系統、Git、資料庫 CLI）

### 3.2 Streamable HTTP Transport

Server 作為獨立 HTTP 服務，可處理多個 Client 連線。取代了舊版 HTTP+SSE transport。

```
Client ──POST──▶ MCP Endpoint (/mcp)
Client ◀─JSON/SSE── Server

Client ──GET───▶ MCP Endpoint  (optional: SSE stream for server-initiated messages)
Client ◀─SSE──── Server
```

**核心機制**：
- Server 提供單一 HTTP endpoint（例如 `https://example.com/mcp`）
- Client 用 POST 發送 JSON-RPC 訊息
- Server 回應可以是 `application/json`（單一回應）或 `text/event-stream`（SSE 串流）
- Client 可用 GET 開啟 SSE stream 接收 Server 主動發送的訊息

**Session 管理**：
- Server 可在初始化時分配 `MCP-Session-Id`
- Client 後續請求必須帶上此 session ID
- Session ID 必須是全域唯一且加密安全的

**安全要求**：
- Server 必須驗證 `Origin` header（防止 DNS rebinding）
- 本地運行時應只綁定 localhost
- 應實作適當的認證機制

**適用場景**：遠端 API、雲端服務、多使用者場景

### 3.3 已棄用：HTTP+SSE Transport

2024-11-05 版本定義的舊 transport，已被 Streamable HTTP 取代。SDK 提供向後相容的 fallback 機制。

### Transport 比較

| 特性 | stdio | Streamable HTTP |
|------|-------|----------------|
| 部署方式 | 本地子程序 | 獨立 HTTP 服務 |
| 多 Client | 不支援 | 支援 |
| 認證 | 不需要（本地） | OAuth 2.1 |
| 網路 | 不需要 | 需要 |
| 複雜度 | 低 | 中-高 |
| 串流 | 即時（stdin/stdout） | SSE |
| MyClaw 適用性 | ✅ 本地 MCP servers | ✅ 遠端 MCP servers |

---

## 4. Client SDK API 用法

### 安裝

**v1（穩定版，推薦生產使用）**：
```bash
npm install @modelcontextprotocol/sdk zod
```

**v2（pre-alpha，預計 2026 Q1 發布）**：
```bash
# v2 拆分為獨立套件
npm install @modelcontextprotocol/client zod    # Client 端
npm install @modelcontextprotocol/server zod    # Server 端
```

> **注意**：Zod 是必要的 peer dependency，用於 schema 驗證。v2 SDK 內部使用 `zod/v4`，但向後相容 Zod v3.25+。

### v1 SDK Import 路徑

```typescript
// Client
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Transports
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

// Server
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
```

### v2 SDK Import 路徑

```typescript
// Client（獨立套件）
import { Client } from "@modelcontextprotocol/client/client/client.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/client/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/client/client/sse.js";
```

### 基本 Client 使用流程

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// 1. 建立 Client
const client = new Client(
  { name: "myclaw-client", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } }
);

// 2. 建立 Transport（stdio 範例：啟動 MCP server 子程序）
const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@anthropic-ai/mcp-server-filesystem", "/path/to/dir"]
});

// 3. 連接
await client.connect(transport);

// 4. 列出可用工具
const { tools } = await client.listTools();
console.log("Available tools:", tools.map(t => t.name));
// => ["read_file", "write_file", "list_directory", ...]

// 5. 調用工具
const result = await client.callTool({
  name: "read_file",
  arguments: { path: "/path/to/file.txt" }
});
console.log(result.content);
// => [{ type: "text", text: "file contents..." }]

// 6. 列出資源
const { resources } = await client.listResources();
console.log("Resources:", resources.map(r => r.name));

// 7. 讀取資源
const { contents } = await client.readResource({ uri: "file:///path/to/file" });
```

### Streamable HTTP Transport 範例

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "myclaw-client", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(
  new URL("https://example.com/mcp")
);

await client.connect(transport);

const { tools } = await client.listTools();
const result = await client.callTool({
  name: "query_database",
  arguments: { sql: "SELECT * FROM users LIMIT 10" }
});
```

### 向後相容的 Transport Fallback

```typescript
async function connectToServer(url: string) {
  const baseUrl = new URL(url);

  // 先嘗試 Streamable HTTP
  try {
    const client = new Client({ name: "myclaw", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(baseUrl);
    await client.connect(transport);
    return { client, transport };
  } catch {
    // Fallback 到舊版 SSE
    const client = new Client({ name: "myclaw", version: "1.0.0" });
    const transport = new SSEClientTransport(baseUrl);
    await client.connect(transport);
    return { client, transport };
  }
}
```

### 通知處理

```typescript
// 方法 1：自動追蹤 list changes
const client = new Client(
  { name: "myclaw", version: "1.0.0" },
  {
    listChanged: {
      tools: {
        onChanged: (error, tools) => {
          if (error) {
            console.error("Failed to refresh tools:", error);
            return;
          }
          console.log("Tools updated:", tools);
        }
      }
    }
  }
);

// 方法 2：手動設定通知處理器
client.setNotificationHandler(
  "notifications/tools/list_changed",
  async () => {
    const { tools } = await client.listTools();
    console.log("Tools changed:", tools.length);
  }
);
```

### 建立 MCP Server（參考）

```typescript
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({
  name: "my-api-server",
  version: "1.0.0"
});

// 註冊工具
server.tool(
  "get_weather",
  "Get current weather for a location",
  { location: z.string().describe("City name") },
  async ({ location }) => {
    const weather = await fetchWeather(location);
    return {
      content: [{ type: "text", text: JSON.stringify(weather) }]
    };
  }
);

// 啟動 stdio transport
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## 5. Tool Schema 格式對照表

### MCP vs OpenAI vs Anthropic

三者的 tool schema 都基於 JSON Schema，但包裝結構不同：

#### MCP Tool Schema

```json
{
  "name": "get_weather",
  "title": "Weather Information Provider",
  "description": "Get current weather for a location",
  "inputSchema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "City name or zip code"
      },
      "unit": {
        "type": "string",
        "enum": ["celsius", "fahrenheit"]
      }
    },
    "required": ["location"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "temperature": { "type": "number" },
      "conditions": { "type": "string" }
    },
    "required": ["temperature", "conditions"]
  }
}
```

#### OpenAI Function Calling Schema

```json
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "Get current weather for a location",
    "strict": true,
    "parameters": {
      "type": "object",
      "properties": {
        "location": {
          "type": "string",
          "description": "City name or zip code"
        },
        "unit": {
          "type": "string",
          "enum": ["celsius", "fahrenheit"]
        }
      },
      "required": ["location"],
      "additionalProperties": false
    }
  }
}
```

#### Anthropic Tool Use Schema

```json
{
  "name": "get_weather",
  "description": "Get current weather for a location",
  "input_schema": {
    "type": "object",
    "properties": {
      "location": {
        "type": "string",
        "description": "City name or zip code"
      },
      "unit": {
        "type": "string",
        "enum": ["celsius", "fahrenheit"]
      }
    },
    "required": ["location"]
  }
}
```

### 格式對照表

| 欄位 | MCP | OpenAI | Anthropic |
|------|-----|--------|-----------|
| 工具名稱 | `name` | `function.name` | `name` |
| 描述 | `description` | `function.description` | `description` |
| 參數 Schema | `inputSchema` | `function.parameters` | `input_schema` |
| Schema 格式 | JSON Schema | JSON Schema | JSON Schema |
| 外層包裝 | 無 | `{type: "function", function: {...}}` | 無 |
| 輸出 Schema | `outputSchema`（可選） | 無 | 無 |
| 嚴格模式 | 無 | `strict: true` | `additionalProperties: false` |
| 標題 | `title`（可選） | 無 | 無 |
| 行為註記 | `annotations`（可選） | 無 | 無 |

### 工具結果格式對照

| 欄位 | MCP | OpenAI | Anthropic |
|------|-----|--------|-----------|
| 結果內容 | `content: [{type: "text", text: "..."}]` | `string`（JSON 字串） | `content: [{type: "text", text: "..."}]` |
| 錯誤標記 | `isError: true` | N/A（在 message 層處理） | `is_error: true` |
| 結構化輸出 | `structuredContent: {...}` | N/A | N/A |
| 訊息角色 | N/A（MCP 層） | `role: "tool"` | `role: "user"` + `type: "tool_result"` |

### 轉換可行性評估

**MCP → OpenAI 轉換**：
```typescript
function mcpToolToOpenAI(mcpTool: MCPTool): OpenAITool {
  return {
    type: "function",
    function: {
      name: mcpTool.name,
      description: mcpTool.description || "",
      parameters: mcpTool.inputSchema  // JSON Schema 格式相同
    }
  };
}
```

**MCP → Anthropic 轉換**：
```typescript
function mcpToolToAnthropic(mcpTool: MCPTool): AnthropicTool {
  return {
    name: mcpTool.name,
    description: mcpTool.description || "",
    input_schema: mcpTool.inputSchema  // JSON Schema 格式相同
  };
}
```

**關鍵發現**：三者的參數 Schema 核心都是 JSON Schema，轉換非常直接。主要差異在外層包裝和命名（`inputSchema` vs `parameters` vs `input_schema`）。

---

## 6. 現有 MCP Server 生態

### 官方 Reference Servers

由 MCP Steering Group 維護的參考實作：

| Server | npm 套件 | 說明 |
|--------|---------|------|
| **Everything** | - | 參考/測試用 Server，示範所有 MCP 功能 |
| **Fetch** | `@modelcontextprotocol/server-fetch` | Web 內容抓取和轉換 |
| **Filesystem** | `@modelcontextprotocol/server-filesystem` | 安全的檔案操作（可設定存取控制） |
| **Git** | `@modelcontextprotocol/server-git` | Git 倉庫讀取、搜尋、操作 |
| **Memory** | `@modelcontextprotocol/server-memory` | 基於 Knowledge Graph 的持久化記憶 |
| **Sequential Thinking** | `@modelcontextprotocol/server-sequential-thinking` | 動態反思性問題解決 |
| **Time** | `@modelcontextprotocol/server-time` | 時間和時區轉換 |

### 已歸檔的官方 Servers

已移至 `servers-archived` 倉庫（仍可使用）：

| Server | 說明 |
|--------|------|
| **PostgreSQL** | PostgreSQL 資料庫操作 |
| **SQLite** | SQLite 資料庫操作 |
| **GitHub** | GitHub API 整合 |
| **GitLab** | GitLab API 整合 |
| **Slack** | Slack 訊息和頻道管理 |
| **Google Drive** | Google Drive 檔案存取 |
| **Google Maps** | 地理定位和地圖功能 |
| **Brave Search** | 網路搜尋 |
| **Puppeteer** | 瀏覽器自動化 |
| **Sentry** | 錯誤追蹤和監控 |
| **Redis** | Redis 資料庫操作 |

### 重要社群 / 第三方 Servers

| Server | 說明 | 類別 |
|--------|------|------|
| **Chrome DevTools MCP** | Google 官方 — 連接 AI 與 Chrome DevTools | 瀏覽器 |
| **Desktop Commander** | 完整終端機存取和 ripgrep 搜尋 | 系統 |
| **E2B** | 雲端沙箱程式碼執行 | 執行環境 |
| **Figma MCP** | 設計系統存取、設計轉程式碼 | 設計 |
| **Apify** | 網路爬蟲（6,000+ 工具） | 資料擷取 |
| **Atlassian** | Jira + Confluence 整合 | 專案管理 |
| **Auth0** | 身份驗證管理 | 認證 |
| **Context7** | 即時文檔查詢 | 知識 |

### 生態規模

- **MCP Registry**：官方註冊中心 (registry.modelcontextprotocol.io)
- **MCP.so**：3,000+ 個 MCP servers 索引
- **Smithery**：2,200+ 個 servers 含自動安裝指南
- **Awesome MCP Servers**：1,200+ 個品質驗證的 servers

### SDK 語言支援

TypeScript, Python, Go, Rust, Java, C#, Ruby, PHP, Swift, Kotlin

---

## 7. 關鍵發現與限制

### 關鍵發現

1. **Tool Schema 高度相容**：MCP、OpenAI、Anthropic 三者的 tool schema 核心都是 JSON Schema，轉換幾乎是 1:1 映射，只需改變外層包裝和 key 名稱。

2. **Client SDK 成熟度**：
   - v1（`@modelcontextprotocol/sdk`）是穩定版本，適合現在使用
   - v2 拆分為 `@modelcontextprotocol/client` + `@modelcontextprotocol/server`，預計 2026 Q1 正式發布
   - v1 在 v2 發布後仍有 6 個月以上的支援期

3. **stdio Transport 最適合本地整合**：Client 啟動 Server 為子程序，透過 stdin/stdout 通訊，零網路開銷。

4. **Streamable HTTP 適合遠端服務**：支援 OAuth 2.1、Session 管理、SSE 串流。

5. **MCP 是 Server 生態標準**：一個 MCP Server 可以同時被 Claude Desktop、Cursor、VS Code、任何相容 Client 使用。

6. **Tool 發現是動態的**：`listTools()` 在執行時取得可用工具，`tools/list_changed` 通知工具列表變更。

### 限制

1. **Node.js CommonJS 相容性**：MCP SDK 使用 ESM（`import` 語法 + `.js` 副檔名），MyClaw 使用 CommonJS — 需要處理 ESM/CJS 互操作。

2. **子程序管理開銷**：stdio transport 需要 Client 啟動和管理 Server 子程序的生命週期。

3. **Zod 依賴**：SDK 強制要求 Zod 作為 peer dependency，MyClaw 目前沒有使用 Zod。

4. **Stateful 連線**：MCP 維持有狀態的 session，需要管理連線的生命週期（connect → operate → disconnect）。

5. **沒有內建的 tool result → LLM message 轉換**：MCP 只負責 Client↔Server 通訊，tool result 如何餵回 LLM 需要 Host（MyClaw）自行處理。

6. **安全性考量**：MCP Server 可能來自不受信任的來源，Server 的 tool annotations 不應被信任（除非來自受信任的 Server）。

---

## 8. 對 MyClaw 整合的影響

### Schema 轉換的可行性

MyClaw 現有的 `ToolDefinition` 格式（在 `dynamic-tool-builder.ts` 中定義）與 MCP tool schema 非常接近：

```typescript
// MyClaw 現有格式
interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {  // Anthropic 格式
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

// MCP 格式
interface MCPTool {
  name: string;
  description: string;
  inputSchema: {  // 注意：camelCase
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}
```

轉換只需 `inputSchema` → `input_schema`（或反之），極為簡單。

### 建議的整合策略

1. **作為 MCP Client**：MyClaw 連接現有 MCP Servers，取得 tools，轉換為 MyClaw 的 `ToolDefinition` 格式
2. **使用 stdio transport**：本地啟動 MCP Server 子程序（如 filesystem、Git）
3. **使用 Streamable HTTP**：連接遠端 MCP Servers
4. **Tool 結果轉換**：MCP tool result → LLM message content（已有類似邏輯在 `http-executor.ts`）

### 需要新增的依賴

```json
{
  "@modelcontextprotocol/sdk": "^1.x",
  "zod": "^3.25"
}
```

---

## 參考資料

- [MCP 官方規格 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP TypeScript SDK（GitHub）](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP TypeScript SDK（npm）](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [MCP Tools 規格](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [MCP Architecture](https://modelcontextprotocol.io/specification/2025-11-25/architecture)
- [MCP Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP Server Registry](https://registry.modelcontextprotocol.io/)
- [Official MCP Servers（GitHub）](https://github.com/modelcontextprotocol/servers)
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [MCP Client SDK Docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md)
- [Best MCP Servers 2026](https://www.builder.io/blog/best-mcp-servers-2026)
- [Mastra Tool Compatibility Layer](https://mastra.ai/blog/mcp-tool-compatibility-layer)
