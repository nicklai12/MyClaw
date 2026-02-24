# MyClaw MCP 架構與 Tavily MCP Link 相容性分析

## 1. 現有架構分析

### 1.1 MCP Client 架構 (`src/mcp-client.ts`)

MyClaw 的 MCP 客戶端目前支援兩種 transport：

| Transport | 類別 | 用途 |
|-----------|------|------|
| **stdio** | `StdioClientTransport` | 本地程序（如 Playwright MCP server） |
| **sse** | `SSEClientTransport` | 遠端 HTTP+SSE 伺服器 |

核心連線邏輯在 `connectServer()` 函式中（mcp-client.ts:57-91），透過 `config.transport.type` 判斷使用哪種 transport。

### 1.2 Config 型別 (`src/config.ts`)

```typescript
export interface McpServerConfig {
  name: string;
  transport:
    | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
    | { type: 'sse'; url: string; headers?: Record<string, string> };
}
```

目前只有 `stdio` 和 `sse` 兩種 transport type，不支援 Streamable HTTP。

### 1.3 SDK 版本

- 已安裝版本：`@modelcontextprotocol/sdk@1.26.0`
- `StreamableHTTPClientTransport` 從 v1.10.0 開始提供
- **v1.26.0 已包含 `StreamableHTTPClientTransport`**（確認存在於 `dist/cjs/client/streamableHttp.js`）
- SSEClientTransport 在 SDK 中已標記為 `@deprecated`，建議優先使用 StreamableHTTPClientTransport

### 1.4 ConnectedServer 型別

```typescript
interface ConnectedServer {
  client: Client;
  transport: StdioClientTransport | SSEClientTransport;  // 缺少 StreamableHTTPClientTransport
  tools: ToolDefinition[];
  name: string;
}
```

## 2. Tavily MCP Link URL 分析

Tavily MCP Link URL 格式：
```
https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-dev-xxx
```

### 關鍵觀察

1. **URL 路徑為 `/mcp/`**：這是 Streamable HTTP transport 的標準端點路徑（不是 `/sse`）
2. **MCP 規範演進**：2025-03-26 規範將 Streamable HTTP 定為新標準，SSE 被降為 deprecated
3. **Tavily 可能同時支援兩種 transport**：部分 MCP server 會在同一端點同時支援 Streamable HTTP 和 SSE fallback

### 相容性結論

| 方案 | 可行性 | 說明 |
|------|--------|------|
| 直接用現有 SSE transport 連 | **可能失敗** | Tavily 的 `/mcp/` 端點可能不支援舊版 SSE 協議 |
| 新增 Streamable HTTP transport | **推薦** | SDK 已內建，只需擴充 config 和 connectServer() |
| Streamable HTTP + SSE fallback | **最穩健** | SDK 有範例（`streamableHttpWithSseFallbackClient.js`），向下相容 |

## 3. 需要的改動清單

### 3.1 `src/config.ts` — 擴充 McpServerConfig transport union type

**改動內容**：新增 `streamable-http` transport 選項

```typescript
export interface McpServerConfig {
  name: string;
  transport:
    | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
    | { type: 'sse'; url: string; headers?: Record<string, string> }
    | { type: 'streamable-http'; url: string; headers?: Record<string, string> };
}
```

**改動量**：約 2 行

### 3.2 `src/mcp-client.ts` — 新增 StreamableHTTPClientTransport 支援

**改動內容**：

1. 新增 import：
```typescript
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
```

2. 擴充 `ConnectedServer` 型別：
```typescript
interface ConnectedServer {
  client: Client;
  transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport;
  tools: ToolDefinition[];
  name: string;
}
```

3. 在 `connectServer()` 函式中新增 `streamable-http` 分支：
```typescript
} else if (config.transport.type === 'streamable-http') {
  transport = new StreamableHTTPClientTransport(
    new URL(config.transport.url),
    config.transport.headers ? { requestInit: { headers: config.transport.headers } } : undefined
  );
}
```

**改動量**：約 10-15 行

### 3.3 不需要改動的檔案

| 檔案 | 原因 |
|------|------|
| `skill-executor.ts` | 透過 `getMcpToolsForServers()` / `callMcpTool()` 間接使用，不直接接觸 transport |
| `dynamic-tool-builder.ts` | 與 MCP 無關 |
| `http-executor.ts` | 與 MCP 無關 |
| `index.ts` | 透過 `initMcpClients()` 間接使用，不需修改 |
| `scheduler.ts` | 透過技能執行間接使用 |

## 4. 風險與注意事項

### 4.1 低風險

- **向下相容**：新增 `streamable-http` type 是 union type 擴充，不影響現有 `stdio` 和 `sse` 連線
- **SDK 已內建**：`StreamableHTTPClientTransport` 在 v1.26.0 中已完整提供，無需升級
- **CJS 支援**：SDK 的 CJS 版本已包含 streamableHttp（`dist/cjs/client/streamableHttp.js`）

### 4.2 中風險

- **Tavily 的 transport 協議不確定**：需要實測 URL 才能確認是 Streamable HTTP 還是 SSE，建議實測時兩者都嘗試
- **API Key 傳遞方式**：Tavily 的 key 是透過 URL query parameter（`?tavilyApiKey=xxx`）傳遞，不是透過 headers，`StreamableHTTPClientTransport` 直接接受 `new URL(config.transport.url)` 即可（query params 會保留）

### 4.3 需注意

- **Session 管理**：Streamable HTTP transport 支援 session ID，如果 Tavily server 返回 session ID，SDK 會自動處理
- **超時設定**：`callMcpTool()` 已設定 120 秒 timeout（mcp-client.ts:169），Tavily 搜尋通常在數秒內完成，足夠
- **結果截斷**：`callMcpTool()` 已有 3000 字元截斷邏輯（mcp-client.ts:185-187），Tavily 搜尋結果可能較長，但現有截斷機制可應對

## 5. 建議的實作步驟

### Step 1：擴充 Config 型別（config.ts）
在 `McpServerConfig.transport` union type 新增 `streamable-http` 選項。

### Step 2：擴充 MCP Client（mcp-client.ts）
1. Import `StreamableHTTPClientTransport`
2. 更新 `ConnectedServer.transport` 型別
3. 在 `connectServer()` 新增 `streamable-http` 分支

### Step 3：環境變數配置
Tavily MCP server 的配置範例：
```env
MCP_SERVERS='[{"name":"tavily","transport":{"type":"streamable-http","url":"https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-dev-xxx"}}]'
```

### Step 4：實測驗證
1. 使用 Streamable HTTP transport 連接 Tavily MCP Link URL
2. 呼叫 `listTools()` 驗證工具清單
3. 實測 `tavily_search` 工具呼叫
4. 若 Streamable HTTP 失敗，降級嘗試 SSE transport

### Step 5（可選）：自動偵測 transport
未來可考慮加入自動偵測邏輯：先嘗試 Streamable HTTP，失敗後降級到 SSE（參考 SDK 範例 `streamableHttpWithSseFallbackClient.js`）。但初期手動指定即可。

## 6. 總結

| 項目 | 結論 |
|------|------|
| SDK 版本 | v1.26.0 已包含 StreamableHTTPClientTransport，**無需升級** |
| 改動範圍 | 僅 2 個檔案（config.ts + mcp-client.ts），約 15-20 行 |
| 風險等級 | **低**：純新增功能，完全向下相容 |
| 預估工時 | 15-30 分鐘（含測試） |
| 建議 | 新增 `streamable-http` transport type，配合實測確認 Tavily 使用的協議 |
