# Tavily MCP Link 連線測試結果

## 測試環境

| 項目 | 值 |
|------|-----|
| @modelcontextprotocol/sdk | v1.26.0 |
| Node.js | 20+ |
| TypeScript | CommonJS (`module: "CommonJS"`) |
| 測試日期 | 2026-02-24 |

---

## 1. 連線測試

### 1.1 Streamable HTTP Transport — 成功

使用 `StreamableHTTPClientTransport` 直接連線 Tavily MCP Link URL：

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = 'https://mcp.tavily.com/mcp/?tavilyApiKey=<key>';
const client = new Client({ name: 'myclaw-test', version: '1.0.0' }, { capabilities: {} });
const transport = new StreamableHTTPClientTransport(new URL(url));
await client.connect(transport);  // 成功
```

**結果：連線成功，無需任何特殊配置。**

SDK v1.26.0 的 CJS 建置已包含 `dist/cjs/client/streamableHttp.js`，import 路徑為：
```typescript
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
```

### 1.2 SSE Transport — 未測試（不需要）

Streamable HTTP 一次成功，無需回退 SSE。Tavily MCP Link 文件也明確建議使用 Streamable HTTP。

---

## 2. 完整工具清單

Tavily MCP Server 提供 **5 個工具**：

### 2.1 `tavily_search` — 網路搜尋

| 屬性 | 值 |
|------|-----|
| 描述 | Search the web for current information on any topic |
| 必要參數 | `query` (string) |
| 可選參數 | `max_results` (int, default 5), `search_depth` (basic/advanced/fast/ultra-fast), `topic` (const: general), `time_range` (day/week/month/year/null), `include_images` (bool), `include_image_descriptions` (bool), `include_raw_content` (bool), `include_domains` (string[]), `exclude_domains` (string[]), `country` (string), `include_favicon` (bool), `start_date` (YYYY-MM-DD), `end_date` (YYYY-MM-DD) |

### 2.2 `tavily_extract` — 網頁內容擷取

| 屬性 | 值 |
|------|-----|
| 描述 | Extract content from URLs. Returns raw page content in markdown or text format |
| 必要參數 | `urls` (string[]) |
| 可選參數 | `extract_depth` (basic/advanced), `include_images` (bool), `format` (markdown/text), `include_favicon` (bool), `query` (string, rerank by relevance) |

### 2.3 `tavily_crawl` — 網站爬取

| 屬性 | 值 |
|------|-----|
| 描述 | Crawl a website starting from a URL |
| 必要參數 | `url` (string) |
| 可選參數 | `max_depth` (int, default 1), `max_breadth` (int, default 20), `limit` (int, default 50), `instructions` (string), `select_paths` (string[]), `select_domains` (string[]), `allow_external` (bool), `extract_depth` (basic/advanced), `format` (markdown/text), `include_favicon` (bool) |

### 2.4 `tavily_map` — 網站結構對映

| 屬性 | 值 |
|------|-----|
| 描述 | Map a website's structure. Returns a list of URLs |
| 必要參數 | `url` (string) |
| 可選參數 | `max_depth` (int, default 1), `max_breadth` (int, default 20), `limit` (int, default 50), `instructions` (string), `select_paths` (string[]), `select_domains` (string[]), `allow_external` (bool) |

### 2.5 `tavily_research` — 深度研究

| 屬性 | 值 |
|------|-----|
| 描述 | Perform comprehensive research on a given topic or question |
| 必要參數 | `input` (string) |
| 可選參數 | `model` (mini/pro/auto, default auto) |

---

## 3. 工具呼叫測試結果

### 3.1 `tavily_search` 呼叫

```typescript
const result = await client.callTool({
  name: 'tavily_search',
  arguments: { query: 'MCP protocol 2025', max_results: 3 }
});
```

**結果：成功，耗時 ~1059ms**

回應格式：
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"query\":\"...\",\"results\":[{\"url\":\"...\",\"title\":\"...\",\"content\":\"...\",\"score\":0.xx},{...}]}"
    }
  ],
  "isError": false
}
```

**注意事項：**
- 回應的 `content[0].text` 是 **JSON 字串**（不是純文字），內含 `results` 陣列
- 每筆 result 有 `url`, `title`, `content`, `score` 欄位
- 結果有意義且相關，排序合理

### 3.2 `tavily_extract` 呼叫

```typescript
const result = await client.callTool({
  name: 'tavily_extract',
  arguments: { urls: ['https://modelcontextprotocol.io/introduction'] }
});
```

**結果：成功，耗時 ~288ms**

回應格式：
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"results\":[{\"url\":\"...\",\"title\":\"...\",\"raw_content\":\"(markdown格式的完整網頁內容)\"}]}"
    }
  ],
  "isError": false
}
```

**注意事項：**
- 擷取結果可能很長（測試回傳 7107+ 字元），MyClaw 現有的 3000 字元截斷機制（`mcp-client.ts:186`）會生效
- `raw_content` 是 markdown 格式，品質良好

### 3.3 錯誤處理測試

呼叫不存在的工具名稱 `tavily-search`（用連字號而非底線）：

```json
{
  "content": [{ "type": "text", "text": "Resource not found: Unknown tool: 'tavily-search'" }],
  "isError": true
}
```

**注意：** Tavily 的工具名稱使用 **底線** `tavily_search`，不是連字號。MyClaw 的前綴機制 `mcp__tavily__tavily_search` 不受影響。

---

## 4. 效能觀察

| 操作 | 耗時 |
|------|------|
| 初始連線 + listTools | ~1-2 秒 |
| tavily_search (basic, 3 results) | ~1059ms |
| tavily_extract (1 URL) | ~288ms |

搜尋延遲在可接受範圍內，不需要先回「思考中...」再編輯。但 `tavily_crawl` 和 `tavily_research` 可能耗時更長，建議保留 Telegram editMessage UX 模式。

---

## 5. MyClaw 整合建議

### 5.1 必要變更：新增 `streamable-http` Transport 支援

現有 `mcp-client.ts` 只支援 `stdio` 和 `sse`，需新增 `streamable-http`：

**config.ts — McpServerConfig 型別擴充：**
```typescript
export interface McpServerConfig {
  name: string;
  transport:
    | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
    | { type: 'sse'; url: string; headers?: Record<string, string> }
    | { type: 'streamable-http'; url: string; headers?: Record<string, string> };  // 新增
}
```

**mcp-client.ts — connectServer() 新增分支：**
```typescript
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// 在 connectServer() 中新增：
} else if (config.transport.type === 'streamable-http') {
  transport = new StreamableHTTPClientTransport(new URL(config.transport.url));
}
```

`ConnectedServer.transport` 型別也需擴充為包含 `StreamableHTTPClientTransport`。

### 5.2 MCP_SERVERS 環境變數配置範例

```bash
MCP_SERVERS='[{"name":"tavily","transport":{"type":"streamable-http","url":"https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-xxx"}}]'
```

### 5.3 技能配置範例

在技能的 `api_config` 中聲明使用 Tavily：

```json
{
  "mcp_servers": ["tavily"]
}
```

技能觸發後，`skill-executor.ts` 會從 `getMcpToolsForServers(["tavily"])` 取得 5 個工具（以 `mcp__tavily__` 為前綴），傳給 LLM 做 tool calling。

### 5.4 其他注意事項

1. **API Key 安全**：Tavily API Key 內嵌於 URL 中，透過 `MCP_SERVERS` 環境變數傳入，不會存入 DB
2. **工具名稱映射**：MyClaw 前綴規則 `mcp__tavily__tavily_search` 正常運作，`callMcpTool()` 會正確解析 `serverName=tavily`, `toolName=tavily_search`
3. **結果截斷**：現有的 3000 字元截斷（`mcp-client.ts:186`）對 `tavily_extract` 和 `tavily_crawl` 可能過於激進，建議考慮調高或針對 search 類工具保持
4. **免費額度**：每月 1,000 次呼叫，個人使用足夠
5. **無需 SSE fallback**：Streamable HTTP 在 SDK v1.26.0 穩定運作，不需要 SSE

### 5.5 變更量估算

整合 Tavily 只需修改 2 個檔案：

| 檔案 | 變更 |
|------|------|
| `src/config.ts` | `McpServerConfig.transport` 聯合型別新增 `streamable-http` |
| `src/mcp-client.ts` | import `StreamableHTTPClientTransport` + `connectServer()` 新增 else-if 分支 + `ConnectedServer.transport` 型別擴充 |

其餘架構（skill-executor、dynamic-tool-builder、前綴機制）完全不需改動。

---

## 6. 結論

Tavily MCP Link 連線測試完全成功。SDK v1.26.0 已內建 `StreamableHTTPClientTransport`，與 MyClaw 的 CommonJS 環境相容。整合工作量極小——只需在 `config.ts` 和 `mcp-client.ts` 各加一個 transport type 分支即可。現有的 MCP 工具前綴機制、tool calling 迴圈、結果截斷邏輯全部無縫適用。
