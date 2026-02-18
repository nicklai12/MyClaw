# MCP 整合架構分析

## 1. 現有工具呼叫架構流程

### 完整流程圖

```
使用者訊息
    │
    ▼
skill-executor.ts: findMatchingSkill()
    │  匹配 keyword / pattern / always
    ▼
skill-executor.ts: executeSkill()
    │
    ├── 1. 讀取 skill.api_config (JSON string)
    │       ▼
    │   dynamic-tool-builder.ts: parseApiConfig()
    │       → ApiConfig { base_url, auth }
    │
    ├── 2. 建構工具清單
    │       ▼
    │   dynamic-tool-builder.ts: buildGenericTools(apiConfig, needsCredentialTool)
    │       → ToolDefinition[] = [api_call, set_{service}_credentials?]
    │
    ├── 3. 組合 system prompt（技能 prompt + 記憶 + 規則）
    │       ▼
    │   buildSkillSystemPrompt()
    │
    ├── 4. 第一次 LLM 呼叫（toolChoice: 'any' 強制使用工具）
    │       ▼
    │   llm.ts: chat(options)
    │       ├── Claude → chatWithClaude()
    │       │     convertToolToAnthropic(): ToolDefinition → Anthropic.Tool
    │       │     convertToAnthropicMessages(): ChatMessage[] → MessageParam[]
    │       │
    │       └── Groq/Cerebras → chatWithOpenAICompat()
    │             convertToolToOpenAI(): ToolDefinition → OpenAI.ChatCompletionTool
    │
    ├── 5. Tool Calling Loop（最多 5 輪）
    │       ▼
    │   while (response.toolCalls.length > 0 && iteration < 5)
    │       │
    │       ├── 路由工具呼叫：
    │       │   ├── tc.name === 'api_call'
    │       │   │       ▼
    │       │   │   http-executor.ts: executeApiCall(apiConfig, method, path, body, userId)
    │       │   │       ├── validatePath() — 安全檢查
    │       │   │       ├── buildAuthHeaders() — Bearer Token / API Key 認證
    │       │   │       │     └── getBearerToken() — 自動登入 + token 快取
    │       │   │       ├── fetch(base_url + path, { method, headers, body })
    │       │   │       └── 回傳 JSON string（截斷至 5000 字元）
    │       │   │
    │       │   ├── tc.name === 'set_*_credentials'
    │       │   │       ▼
    │       │   │   http-executor.ts: createCredentialExecutor()
    │       │   │       └── db.ts: saveUserCredentials()
    │       │   │
    │       │   └── 其他 → { error: "未知工具" }
    │       │
    │       └── 將 tool result 回饋 LLM，繼續迴圈
    │
    └── 6. 回傳 response.content（最終回覆）
```

### 關鍵型別定義（config.ts）

```typescript
// 工具定義 — LLM 無關的中間格式
interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;  // JSON Schema
}

// 工具呼叫結果 — LLM 回傳的
interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// API 連線設定 — 只有連線資訊，無端點定義
interface ApiConfig {
  base_url: string;
  auth: {
    type: 'bearer_token' | 'api_key' | 'none';
    login_endpoint?: string;
    credentials_service?: string;
    token_field?: string;
    token_ttl_minutes?: number;
    api_key_header?: string;
    api_key_service?: string;
  };
}
```

---

## 2. MCP Tools 與 ToolDefinition 的相容性分析

### MCP Tool 的 JSON Schema

MCP 協議中，tool 的定義格式為：

```typescript
// MCP Tool 定義（來自 @modelcontextprotocol/sdk）
interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;  // 標準 JSON Schema
  };
}
```

### MyClaw ToolDefinition 的 JSON Schema

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;  // 本質上也是 JSON Schema
}
```

### 相容性結論

| 面向 | MCP Tool | MyClaw ToolDefinition | 相容？ |
|------|----------|----------------------|--------|
| `name` | `name: string` | `name: string` | 完全相容 |
| `description` | `description?: string` | `description: string` | MCP 是 optional，MyClaw 是 required，轉換時給預設值即可 |
| Schema 欄位名 | `inputSchema` (camelCase) | `input_schema` (snake_case) | 需要重新命名映射 |
| Schema 內容 | 標準 JSON Schema | 標準 JSON Schema | 完全相容 |

**結論：MCP tool 可以近乎無損地轉換為 MyClaw ToolDefinition**，只需要 `inputSchema` → `input_schema` 的欄位名映射。

轉換函式示意：

```typescript
function mcpToolToToolDefinition(mcpTool: McpTool): ToolDefinition {
  return {
    name: mcpTool.name,
    description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
    input_schema: mcpTool.inputSchema as Record<string, unknown>,
  };
}
```

---

## 3. 需要新增的元件

### 3.1 `src/mcp-client.ts` — MCP Client Manager

**職責**：管理 MCP Server 連線的生命週期

```typescript
// 核心介面
interface McpServerConfig {
  /** 唯一識別名 */
  name: string;
  /** 傳輸方式 */
  transport:
    | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
    | { type: 'sse'; url: string; headers?: Record<string, string> }
    | { type: 'streamable-http'; url: string; headers?: Record<string, string> };
}

interface McpClientManager {
  /** 連線到 MCP server */
  connect(config: McpServerConfig): Promise<void>;

  /** 取得所有已連線 server 的工具清單 */
  listTools(): ToolDefinition[];

  /** 執行 MCP 工具呼叫 */
  callTool(toolName: string, args: Record<string, unknown>): Promise<string>;

  /** 斷開連線 */
  disconnect(serverName: string): Promise<void>;

  /** 斷開所有連線 */
  disconnectAll(): Promise<void>;
}
```

**實作要點**：
- 使用 `@modelcontextprotocol/sdk` 的 `Client` 類別
- 支援 stdio（本地 process）和 SSE/Streamable HTTP（遠端）傳輸
- 維護 `Map<serverName, { client, transport, tools }>` 管理多個 server
- 工具名稱需加前綴避免衝突：`{serverName}__{toolName}`（例如 `chrome__navigate`）
- 需要處理連線失敗、重連、超時

### 3.2 `src/mcp-tool-adapter.ts` — MCP Tool Adapter

**職責**：將 MCP tools 轉換為 MyClaw ToolDefinition，並處理工具呼叫路由

```typescript
/**
 * 將 MCP server 的工具轉換為 MyClaw ToolDefinition[]
 * 工具名稱格式：{serverName}__{toolName}
 */
function convertMcpTools(serverName: string, mcpTools: McpTool[]): ToolDefinition[];

/**
 * 判斷 ToolCall 是否為 MCP 工具（根據名稱前綴）
 */
function isMcpToolCall(toolCall: ToolCall): boolean;

/**
 * 從 MCP 工具名稱中解析出 serverName 和 toolName
 */
function parseMcpToolName(name: string): { serverName: string; toolName: string };
```

---

## 4. 需要修改的元件

### 4.1 `src/skill-executor.ts` — 工具呼叫路由擴展

**當前**：工具路由只有 `api_call` 和 `set_*_credentials` 兩種

**修改**：在 tool calling loop 中新增 MCP 工具路由

```typescript
// 現有（skill-executor.ts:159-176）
for (const tc of response.toolCalls) {
  let result: string;

  if (tc.name === 'api_call' && apiConfig) {
    result = await executeApiCall(apiConfig, method, path, body, userId);
  } else if (tc.name.startsWith('set_') && tc.name.endsWith('_credentials')) {
    const credExecutor = createCredentialExecutor(credentialService);
    result = await credExecutor(tc.input, userId);
  } else {
    result = JSON.stringify({ error: true, message: `未知工具: ${tc.name}` });
  }

  // ...
}

// 修改後
for (const tc of response.toolCalls) {
  let result: string;

  if (tc.name === 'api_call' && apiConfig) {
    // 原有：HTTP API 呼叫
    result = await executeApiCall(apiConfig, method, path, body, userId);
  } else if (tc.name.startsWith('set_') && tc.name.endsWith('_credentials')) {
    // 原有：帳密設定
    result = await credExecutor(tc.input, userId);
  } else if (isMcpToolCall(tc)) {
    // 新增：MCP 工具呼叫
    result = await mcpClientManager.callTool(tc.name, tc.input);
  } else {
    result = JSON.stringify({ error: true, message: `未知工具: ${tc.name}` });
  }

  // ...
}
```

**影響範圍**：只需在 tool dispatch 的 if-else 中新增一個分支，其餘流程不變。

### 4.2 `src/config.ts` — 新增 MCP 相關型別

```typescript
// 新增：MCP Server 連線設定
export interface McpServerConfig {
  name: string;
  transport:
    | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
    | { type: 'sse'; url: string; headers?: Record<string, string> }
    | { type: 'streamable-http'; url: string; headers?: Record<string, string> };
}
```

### 4.3 `src/index.ts` — 初始化 MCP Client

在 server 啟動時初始化 MCP client manager，連線配置好的 MCP servers。

### 4.4 `src/llm.ts` — 無需修改

LLM 層只關心 `ToolDefinition` 和 `ToolCall`，不需要知道工具的實作來源。MCP 工具已經在 adapter 層轉換為 `ToolDefinition`，對 LLM 來說是透明的。這是現有架構最大的優勢。

---

## 5. Agent Skills 調用 MCP 工具的可行性分析

### 方案 A：技能級 MCP 設定（擴展 api_config）

將 `ApiConfig` 擴展為可同時支援 HTTP 和 MCP：

```typescript
// 擴展後的 ApiConfig
interface ApiConfig {
  // 原有 HTTP 模式
  base_url?: string;
  auth?: { ... };

  // 新增 MCP 模式
  mcp_servers?: McpServerConfig[];
}
```

**優點**：
- 每個技能獨立管理 MCP server 連線
- 與現有技能建立/匯入流程相容
- 技能可以同時使用 HTTP API + MCP 工具

**缺點**：
- MCP server 連線有狀態（進程或 SSE 連線），技能級管理複雜
- 每個技能都啟動自己的 MCP server 進程太浪費資源
- stdio 傳輸需要本地執行權限，安全考量較多

**結論**：不建議在技能級管理 MCP server 連線。

### 方案 B：全域 MCP Server + 技能選擇器（推薦）

MCP servers 在 app 層全域管理，技能只聲明要用哪些 MCP server 的工具：

```typescript
// skills 表新增欄位
// mcp_servers: JSON string — ["chrome", "filesystem"] 技能要使用的 MCP server 名稱列表

// 或在 api_config 中擴展
interface ApiConfig {
  // 原有 HTTP 設定（仍然支援）
  base_url?: string;
  auth?: { ... };

  // 新增：技能要使用的 MCP server 名稱列表
  mcp_servers?: string[];
}
```

**執行流程**：

```
技能觸發
    │
    ├── 解析 api_config
    │   ├── base_url 存在 → 建構 api_call 工具（原有邏輯）
    │   └── mcp_servers 存在 → 從全域 MCP manager 取得對應工具
    │
    ├── 合併工具列表：api_call tools + MCP tools
    │
    └── Tool calling loop
        ├── api_call → http-executor（原有）
        ├── mcp_{server}__{tool} → mcp-client callTool()（新增）
        └── set_*_credentials → credential executor（原有）
```

**優點**：
- MCP server 全域共享，一個進程服務所有技能
- 技能只需聲明使用的 server 名稱，簡單易懂
- 向後完全相容：沒有 `mcp_servers` 的技能行為不變
- 資源高效：不會為每個技能重複啟動 server

**缺點**：
- 需要全域配置文件管理 MCP servers
- 所有技能共用同一個 server 實例，無法做技能級隔離

**結論：推薦方案 B**，符合 MyClaw 簡化架構的設計哲學。

### 方案 C：混合方案 — 全域管理 + 動態連線

在方案 B 的基礎上，增加動態連線能力：

- 全域配置的 MCP servers 在啟動時連線（常駐）
- 技能也可以在 `api_config.mcp_servers` 中指定臨時 MCP server URL
- 臨時 server 在技能執行時連線，執行完斷開（lazy connect）

這個方案更靈活，但初期實作可以先只做方案 B。

---

## 6. 建議整合方案

### 整體架構圖

```
                          MCP Servers（全域管理）
                          ├── chrome-devtools (stdio)
                          ├── filesystem (stdio)
                          └── custom-api (SSE)
                               │
                               ▼
┌─────────────────────────────────────────────────────┐
│  mcp-client.ts: McpClientManager                     │
│  ├── connect() / disconnect()                        │
│  ├── listTools(serverName?) → ToolDefinition[]       │
│  └── callTool(prefixedName, args) → string           │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
┌──────────────────┐    ┌───────────────────────┐
│ dynamic-tool-    │    │ mcp-tool-adapter.ts   │
│ builder.ts       │    │ (新增)                 │
│ (原有，不修改)     │    │ mcpTool→ToolDefinition│
│ api_call 工具    │    │ 名稱前綴管理            │
└────────┬─────────┘    └───────────┬───────────┘
         │                          │
         └────────┬─────────────────┘
                  │ 合併
                  ▼
┌──────────────────────────────────────────────────────┐
│  skill-executor.ts: executeSkill()                    │
│  ├── toolDefs = [...apiCallTools, ...mcpTools]        │
│  │                                                    │
│  └── Tool Calling Loop:                               │
│      ├── api_call      → http-executor.ts（原有）      │
│      ├── mcp__*        → mcp-client.ts callTool()     │
│      └── set_*_creds   → http-executor.ts（原有）      │
└──────────────────────────────────────────────────────┘
                  │
                  ▼
         llm.ts: chat()  ← 完全不需修改，只看 ToolDefinition
```

### 檔案清單

| 檔案 | 操作 | 說明 |
|------|------|------|
| `src/mcp-client.ts` | **新增** | MCP Client Manager，管理 server 連線生命週期、工具列表、工具呼叫 |
| `src/mcp-tool-adapter.ts` | **新增** | MCP tool → ToolDefinition 轉換、名稱前綴管理、路由判斷 |
| `src/config.ts` | **修改** | 新增 `McpServerConfig` 型別；可選：擴展 `ApiConfig` 加 `mcp_servers` |
| `src/skill-executor.ts` | **修改** | Tool calling loop 新增 MCP 路由分支；`executeSkill()` 合併 MCP 工具到 toolDefs |
| `src/index.ts` | **修改** | 啟動時初始化 McpClientManager、載入全域 MCP server 配置 |
| `src/dynamic-tool-builder.ts` | **不修改** | 原有 api_call 邏輯不變 |
| `src/http-executor.ts` | **不修改** | 原有 HTTP 執行邏輯不變 |
| `src/llm.ts` | **不修改** | 只消費 ToolDefinition/ToolCall，對 MCP 透明 |
| `src/channel.ts` | **不修改** | 訊息平台層與工具層無關 |
| `src/db.ts` | **可選修改** | 若要在 DB 儲存全域 MCP server 配置（替代環境變數/配置檔） |

### 全域 MCP Server 配置方式

**選項 1：環境變數**（最簡單，MVP 推薦）

```env
# JSON 格式的 MCP server 配置陣列
MCP_SERVERS='[{"name":"chrome","transport":{"type":"stdio","command":"npx","args":["-y","@anthropic-ai/mcp-chrome"]}}]'
```

**選項 2：配置檔案** `mcp-servers.json`

```json
{
  "servers": [
    {
      "name": "chrome",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@anthropic-ai/mcp-chrome"]
      }
    },
    {
      "name": "brave-search",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@anthropic-ai/mcp-brave-search"],
        "env": { "BRAVE_API_KEY": "xxx" }
      }
    }
  ]
}
```

### 程式碼示意：mcp-client.ts 核心

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { ToolDefinition, ToolCall } from './config';

interface ConnectedServer {
  client: Client;
  transport: StdioClientTransport | SSEClientTransport;
  tools: ToolDefinition[];
}

const servers = new Map<string, ConnectedServer>();

export async function connectServer(config: McpServerConfig): Promise<void> {
  const client = new Client({ name: 'myclaw', version: '1.0.0' });

  let transport;
  if (config.transport.type === 'stdio') {
    transport = new StdioClientTransport({
      command: config.transport.command,
      args: config.transport.args,
      env: config.transport.env,
    });
  } else {
    transport = new SSEClientTransport(
      new URL(config.transport.url)
    );
  }

  await client.connect(transport);

  // 取得 server 提供的工具清單
  const { tools: mcpTools } = await client.listTools();

  // 轉換為 MyClaw ToolDefinition，加前綴避免名稱衝突
  const toolDefs: ToolDefinition[] = mcpTools.map(t => ({
    name: `mcp__${config.name}__${t.name}`,
    description: t.description || `MCP tool: ${t.name}`,
    input_schema: t.inputSchema as Record<string, unknown>,
  }));

  servers.set(config.name, { client, transport, tools: toolDefs });
  console.log(`[mcp] 已連線 ${config.name}，提供 ${toolDefs.length} 個工具`);
}

export function getToolsForServers(serverNames: string[]): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  for (const name of serverNames) {
    const server = servers.get(name);
    if (server) {
      tools.push(...server.tools);
    }
  }
  return tools;
}

export async function callMcpTool(
  prefixedName: string,
  args: Record<string, unknown>
): Promise<string> {
  // 解析前綴：mcp__chrome__navigate → server=chrome, tool=navigate
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
    const result = await server.client.callTool({ name: toolName, arguments: args });
    // MCP tool result 是 content 陣列，需要序列化為字串
    const textParts = (result.content as Array<{ type: string; text?: string }>)
      .filter(c => c.type === 'text')
      .map(c => c.text || '');
    return textParts.join('\n') || JSON.stringify(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: true, message: `MCP 工具執行失敗: ${msg}` });
  }
}

export function isMcpToolCall(tc: ToolCall): boolean {
  return tc.name.startsWith('mcp__');
}
```

### 程式碼示意：skill-executor.ts 修改

```typescript
import { getToolsForServers, callMcpTool, isMcpToolCall } from './mcp-client';

export async function executeSkill(skill, userId, userMessage) {
  // ... 原有邏輯 ...

  const apiConfig = parseApiConfig(skill.api_config);
  const toolDefs: ToolDefinition[] = [];

  // 原有：HTTP API 工具
  if (apiConfig?.base_url) {
    const genericTools = buildGenericTools(apiConfig, needsCredentialTool);
    toolDefs.push(...genericTools);
  }

  // 新增：MCP 工具
  if (apiConfig?.mcp_servers && apiConfig.mcp_servers.length > 0) {
    const mcpTools = getToolsForServers(apiConfig.mcp_servers);
    toolDefs.push(...mcpTools);
  }

  // ... Tool calling loop ...
  for (const tc of response.toolCalls) {
    let result: string;

    if (tc.name === 'api_call' && apiConfig) {
      result = await executeApiCall(/* ... */);
    } else if (tc.name.startsWith('set_') && tc.name.endsWith('_credentials')) {
      result = await credExecutor(tc.input, userId);
    } else if (isMcpToolCall(tc)) {
      // 新增：路由到 MCP client
      result = await callMcpTool(tc.name, tc.input);
    } else {
      result = JSON.stringify({ error: true, message: `未知工具: ${tc.name}` });
    }
    // ...
  }
}
```

---

## 7. 架構影響評估

### 向後相容性

| 面向 | 影響 |
|------|------|
| 現有技能 | **完全相容** — 沒有 `mcp_servers` 欄位的技能行為不變 |
| 現有 api_config | **完全相容** — `base_url` + `auth` 結構不變，新增 optional `mcp_servers` |
| LLM 層 | **零影響** — ToolDefinition 介面不變 |
| 資料庫 | **向前相容** — `api_config` 是 JSON 欄位，新增 key 不破壞舊資料 |
| 環境變數 | **附加式** — 新增 `MCP_SERVERS` 環境變數或配置檔，不影響現有變數 |

### 風險評估

| 風險 | 等級 | 緩解措施 |
|------|------|---------|
| MCP server 進程管理 | 中 | stdio 進程需要 graceful shutdown，加入超時和錯誤處理 |
| 工具名稱衝突 | 低 | 使用 `mcp__{server}__{tool}` 前綴隔離 |
| 安全性 | 中 | stdio 需執行本地程式，限制可用的 command 白名單；SSE 需驗證 URL |
| 工具數量膨脹 | 低 | MCP server 通常只提供少量精選工具（10 個以內） |
| 依賴增加 | 低 | 只需 `@modelcontextprotocol/sdk` 一個依賴 |
| LLM Token 消耗 | 中 | MCP 工具定義會增加 system prompt 長度，需注意 context window |

### 改動範圍總結

```
新增檔案：2 個（mcp-client.ts, mcp-tool-adapter.ts）
修改檔案：3 個（config.ts, skill-executor.ts, index.ts）
不修改：  6 個（llm.ts, channel.ts, dynamic-tool-builder.ts, http-executor.ts, db.ts, ...)
新依賴：  1 個（@modelcontextprotocol/sdk）
```

核心改動集中在 `skill-executor.ts` 的工具路由分支，影響範圍小、風險可控。最重要的是，現有 `ToolDefinition → LLM → ToolCall → Executor` 的架構非常乾淨，MCP 只需要提供新的 ToolDefinition 來源和新的 Executor，完全插入式的整合。
