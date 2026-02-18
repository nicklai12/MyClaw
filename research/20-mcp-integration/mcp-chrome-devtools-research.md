# Chrome DevTools MCP Server 研究報告

> 研究日期：2026-02-18
> 研究範圍：Chrome DevTools 相關 MCP Server 實作、工具清單、部署需求、MyClaw 整合場景

---

## 1. 可用的 Chrome DevTools / Browser MCP Server 比較

### 1.1 主要實作一覽表

| 項目 | Google chrome-devtools-mcp | Microsoft playwright-mcp | benjaminr/chrome-devtools-mcp | lxe/chrome-mcp | ByteDance browser-mcp | Cloudflare playwright-mcp |
|------|---------------------------|-------------------------|-------------------------------|----------------|----------------------|--------------------------|
| **GitHub** | ChromeDevTools/chrome-devtools-mcp | microsoft/playwright-mcp | benjaminr/chrome-devtools-mcp | lxe/chrome-mcp | bytedance/UI-TARS-desktop | cloudflare/playwright-mcp |
| **語言** | TypeScript (Node.js) | TypeScript (Node.js) | Python | TypeScript (Node.js/Bun) | TypeScript (Node.js) | TypeScript (Workers) |
| **瀏覽器引擎** | Puppeteer + Chrome | Playwright (Chromium/Firefox/WebKit) | CDP 直連 | CDP 直連 | Puppeteer | Playwright + Cloudflare Browser |
| **工具數量** | 26 | 19 核心 + 擴展至 30+ | ~40+ | 7 | 21 + 2 vision | 23 |
| **核心方法** | Screenshot + DOM + Performance Trace | Accessibility Tree (結構化) | CDP 全功能 | DOM 文字提取（無截圖） | Accessibility + Optional Vision | Accessibility Tree |
| **Transport** | stdio | stdio / SSE / HTTP | stdio | SSE (port 3000) | stdio / SSE | SSE (Workers) |
| **Headless 支援** | 是 (`--headless`) | 是 (`--headless`) | 是 | 是 | 是 | 是（Serverless） |
| **Node.js 版本** | v20.19+ | v18+ | Python 3.10+ | v18+ | v18+ | Workers runtime |
| **維護者** | Google (官方) | Microsoft (官方) | 社群 | 社群 | ByteDance | Cloudflare |
| **發佈日期** | 2025-09 | 2025 | 2025 | 2025 | 2025 | 2025 |
| **授權** | Apache-2.0 | Apache-2.0 | MIT | MIT | MIT | Apache-2.0 |

### 1.2 優劣比較

#### Google chrome-devtools-mcp（推薦用於開發調試）
- **優點**：官方維護、功能最全面（26 工具含 Performance Trace）、支援 Network 分析、Console 監控
- **缺點**：僅 stdio transport（需 proxy 做遠端）、需 Node.js v20.19+、Google 會收集使用統計
- **適合**：前端開發調試、效能分析

#### Microsoft playwright-mcp（推薦用於瀏覽器自動化）
- **優點**：Accessibility Tree 方法不需 vision model、支援 SSE/HTTP transport（遠端部署友好）、跨瀏覽器、Microsoft 官方維護
- **缺點**：accessibility snapshot 可能遺漏視覺元素（需 `--caps=vision` 補充）
- **適合**：表單填寫、資料擷取、自動化測試、**Server 端遠端部署**

#### ByteDance browser-mcp
- **優點**：輕量快速、optional vision mode、LLM token 用量少
- **缺點**：ByteDance 內部專案衍生，社群較小

#### Cloudflare playwright-mcp
- **優點**：Serverless 部署、無需管理瀏覽器進程、自動伸縮
- **缺點**：依賴 Cloudflare 平台、需 Workers 付費方案

#### lxe/chrome-mcp
- **優點**：極簡、不用截圖直接提取 DOM 文字、SSE transport
- **缺點**：僅 7 個工具、功能有限

---

## 2. 工具清單與 Schema

### 2.1 Google chrome-devtools-mcp（26 工具）

#### Input Automation（8 工具）
| 工具名 | 描述 | 主要參數 |
|--------|------|----------|
| `click` | 點擊頁面元素 | selector, coordinates |
| `drag` | 拖曳操作 | from, to coordinates |
| `fill` | 在欄位輸入文字 | selector, value |
| `fill_form` | 填寫多個表單欄位 | fields[] (name, value) |
| `handle_dialog` | 處理瀏覽器對話框 | accept, promptText |
| `hover` | 觸發 hover 狀態 | selector |
| `press_key` | 模擬鍵盤輸入 | key |
| `upload_file` | 處理檔案上傳 | selector, filePath |

#### Navigation（6 工具）
| 工具名 | 描述 | 主要參數 |
|--------|------|----------|
| `navigate_page` | 導航到 URL | url |
| `new_page` | 建立新分頁 | url (optional) |
| `close_page` | 關閉分頁 | pageId |
| `list_pages` | 列出開啟的頁面 | — |
| `select_page` | 切換分頁 | pageId |
| `wait_for` | 等待條件 | selector, timeout |

#### Debugging（5 工具）
| 工具名 | 描述 | 主要參數 |
|--------|------|----------|
| `evaluate_script` | 執行 JavaScript | expression |
| `take_screenshot` | 頁面截圖 | — (returns base64 image) |
| `take_snapshot` | DOM 快照 | — |
| `get_console_message` | 取得 console 訊息 | index |
| `list_console_messages` | 列出所有 console 輸出 | — |

#### Performance（3 工具）
| 工具名 | 描述 | 主要參數 |
|--------|------|----------|
| `performance_start_trace` | 開始記錄效能追蹤 | — |
| `performance_stop_trace` | 停止效能追蹤 | — |
| `performance_analyze_insight` | 提取效能指標 | — |

#### Network（2 工具）
| 工具名 | 描述 | 主要參數 |
|--------|------|----------|
| `list_network_requests` | 列出所有網路請求 | filter (optional) |
| `get_network_request` | 取得請求詳情 | requestId |

#### Emulation（2 工具）
| 工具名 | 描述 | 主要參數 |
|--------|------|----------|
| `emulate` | 模擬設備/網路條件 | device, network |
| `resize_page` | 調整 viewport | width, height |

### 2.2 Microsoft playwright-mcp

#### Core Tools（19 工具，始終啟用）
| 工具名 | 描述 |
|--------|------|
| `browser_navigate` | URL 導航 |
| `browser_navigate_back` | 回上一頁 |
| `browser_snapshot` | Accessibility tree 快照（核心方法） |
| `browser_take_screenshot` | 視覺截圖 |
| `browser_click` | 點擊元素（使用 ref） |
| `browser_type` | 輸入文字 |
| `browser_hover` | Hover 操作 |
| `browser_drag` | 拖曳操作 |
| `browser_press_key` | 鍵盤按鍵 |
| `browser_fill_form` | 表單填寫 |
| `browser_select_option` | 下拉選擇 |
| `browser_file_upload` | 檔案上傳 |
| `browser_evaluate` | 執行 JavaScript |
| `browser_run_code` | 執行 Playwright code |
| `browser_handle_dialog` | 對話框處理 |
| `browser_wait_for` | 等待條件 |
| `browser_resize` | 視窗調整 |
| `browser_close` | 關閉瀏覽器 |
| `browser_console_messages` | Console 訊息 |
| `browser_network_requests` | 網路請求 |

#### Optional Capabilities
| 功能組 | 啟用方式 | 工具 |
|--------|----------|------|
| Vision | `--caps=vision` | `browser_mouse_click_xy`, `browser_mouse_move_xy`, `browser_mouse_drag_xy` |
| PDF | `--caps=pdf` | `browser_pdf_save` |
| Testing | `--caps=testing` | `browser_verify_*` (5 工具), `browser_generate_locator` |
| Tracing | `--caps=tracing` | `browser_start_tracing`, `browser_stop_tracing` |
| Tabs | 核心 | `browser_tabs` |
| Install | 核心 | `browser_install` |

#### Accessibility Snapshot 方法（關鍵差異）
```
截圖方法：LLM 看像素 → 需要 vision model → 消耗大量 token
Accessibility 方法：LLM 看結構化文字 → 不需 vision → token 用量少

範例輸出：
- role: button, name: "Submit", ref: "e42"
- role: textbox, name: "Email", ref: "e15", value: ""

後續操作使用 ref 精確定位，無歧義
```

### 2.3 ByteDance browser-mcp（21 + 2 工具）

| 工具名 | 描述 |
|--------|------|
| `browser_navigate` | 導航到 URL |
| `browser_go_back` / `browser_go_forward` | 前後導航 |
| `browser_click` | 點擊元素（index） |
| `browser_hover` | Hover 元素 |
| `browser_form_input_fill` | 填寫輸入欄位 |
| `browser_select` | 選擇元素 |
| `browser_press_key` | 按鍵 |
| `browser_evaluate` | 執行 JavaScript |
| `browser_screenshot` | 截圖 |
| `browser_scroll` | 頁面捲動 |
| `browser_get_text` | 取得純文字 |
| `browser_get_markdown` | 取得 Markdown 內容 |
| `browser_get_clickable_elements` | 取得可點擊元素列表 |
| `browser_read_links` | 取得所有連結 |
| `browser_new_tab` / `browser_close_tab` | 分頁管理 |
| `browser_switch_tab` / `browser_tab_list` | 分頁切換 |
| `browser_get_download_list` | 下載檔案列表 |
| `browser_close` | 關閉瀏覽器 |
| `browser_vision_screen_capture` | Vision 模式截圖 |
| `browser_vision_screen_click` | Vision 模式點擊 |

---

## 3. 部署需求與限制

### 3.1 Headless Chrome 在 Linux Server 的需求

#### 最低資源需求
| 資源 | 最低 | 建議 |
|------|------|------|
| RAM | 512 MB | 1 GB+ |
| CPU | 1 core | 2 cores |
| Disk | 500 MB（Chrome binary） | 1 GB+ |
| Shared Memory | 64 MB（Docker 預設不足） | 1 GB（`--shm-size=1g`） |

#### 關鍵 Chrome 啟動參數（Server / Docker 環境）
```bash
--headless
--no-sandbox                    # Docker 中必須
--disable-setuid-sandbox        # Docker 中必須
--disable-dev-shm-usage         # 避免 /dev/shm 不足
--disable-gpu                   # Server 無 GPU
--disable-extensions
--disable-background-timer-throttling
--single-process                # 減少記憶體（可選）
```

#### Docker 部署範例
```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-noto-cjk \      # CJK 字體（中文）
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

```bash
docker run --shm-size=1g --memory=1g my-browser-mcp
```

### 3.2 各 MCP Server 部署方式比較

| 部署方式 | chrome-devtools-mcp | playwright-mcp | 適合場景 |
|----------|--------------------|----|----------|
| **本地 stdio** | `npx chrome-devtools-mcp` | `npx @playwright/mcp` | IDE 整合 |
| **SSE/HTTP** | 需 mcp-proxy 轉發 | `--port 8080 --host 0.0.0.0` | **遠端 Server** |
| **Docker** | 自行包裝 | 自行包裝 | 生產環境 |
| **Cloudflare Workers** | 不支援 | `@cloudflare/playwright-mcp` | Serverless |
| **連接現有 Chrome** | `--browserUrl http://host:9222` | `--cdp-endpoint http://host:9222` | 共用瀏覽器 |

### 3.3 MyClaw Server 環境可行性評估

MyClaw 以 Express.js 運行在 Linux server 上，整合 Browser MCP 有三種架構選擇：

#### 方案 A：同機部署 Headless Chrome + MCP Server
```
MyClaw (Express.js)
  ↓ MCP Client (SSE/HTTP)
Playwright MCP Server (--headless --port 8080)
  ↓ CDP
Headless Chromium
```
- **優點**：延遲最低、完全自控
- **缺點**：Chrome 吃記憶體（每個實例 ~200-500 MB）、需管理進程生命週期
- **適合**：VPS 2GB+ RAM

#### 方案 B：獨立 Docker Container
```
MyClaw Container
  ↓ HTTP/SSE
Browser MCP Container (Chrome + MCP Server)
```
- **優點**：隔離穩定、易擴展
- **缺點**：多容器管理、網路延遲
- **適合**：Docker Compose 環境

#### 方案 C：雲端瀏覽器服務（Browserless / Cloudflare）
```
MyClaw Server
  ↓ HTTP API / MCP
Browserless Cloud / Cloudflare Browser Rendering
```
- **優點**：零維護、自動伸縮、無需本地 Chrome
- **缺點**：延遲較高、有費用（Browserless 免費 1k units）、依賴外部服務
- **適合**：低頻使用、不想管理瀏覽器

---

## 4. MyClaw 整合場景分析

### 4.1 用戶用例場景

使用者透過 LINE/Telegram 讓 AI 操作瀏覽器的實際場景：

| 場景 | 描述 | 所需工具 | 優先度 |
|------|------|----------|--------|
| **網頁截圖** | 「幫我截 https://... 的畫面」 | navigate + screenshot | 高 |
| **資料擷取** | 「幫我查這個網站上的價格/庫存」 | navigate + getText/snapshot + evaluate | 高 |
| **表單填寫** | 「幫我填寫這個報名表」 | navigate + fill_form + click | 中 |
| **登入操作** | 「登入我的 XX 帳號查詢資料」 | navigate + fill + click (含 credentials) | 中 |
| **定時監控** | 「每小時檢查這個頁面有無更新」 | cron + navigate + getText + 比較 | 中 |
| **PDF 生成** | 「把這個網頁轉成 PDF 給我」 | navigate + pdf_save | 低 |
| **網頁測試** | 「測試我的網站功能是否正常」 | navigate + click + verify + screenshot | 低 |

### 4.2 與 MyClaw 技能系統的整合

Browser MCP 工具可以自然融入 MyClaw 的動態技能架構：

```
使用者訊息：「幫我截 example.com 的畫面」
  ↓
skill-executor.ts: 匹配技能（trigger: pattern/always）
  ↓
技能 prompt 引導 LLM 使用 browser 工具
  ↓
LLM 回覆 tool_calls: [
  { name: "browser_navigate", arguments: { url: "https://example.com" } },
  { name: "browser_take_screenshot", arguments: {} }
]
  ↓
MyClaw 透過 MCP Client → Browser MCP Server 執行
  ↓
截圖 → 回傳圖片給使用者
```

### 4.3 整合架構設計建議

#### 新增模組：`mcp-client.ts`
```typescript
// 概念設計
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

class MCPBrowserClient {
  private client: Client;

  async connect(serverUrl: string): Promise<void> {
    const transport = new SSEClientTransport(new URL(serverUrl));
    await this.client.connect(transport);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return await this.client.callTool({ name, arguments: args });
  }

  async listTools(): Promise<ToolDefinition[]> {
    return await this.client.listTools();
  }
}
```

#### 與現有架構的銜接點

| 現有模組 | 整合方式 |
|----------|----------|
| `skill-executor.ts` | 工具呼叫迴圈中新增 MCP tool 類型判斷 |
| `dynamic-tool-builder.ts` | 從 MCP Server 動態取得 tool schema |
| `config.ts` | 新增 `MCP_BROWSER_URL` 環境變數 |
| `channel.ts` | 圖片回傳（截圖需要 image message 支援） |

### 4.4 技能定義範例

```json
{
  "name": "網頁截圖",
  "trigger_type": "pattern",
  "trigger_value": "截圖|screenshot|capture",
  "prompt": "使用者要求截取網頁畫面。使用 browser_navigate 導航到指定 URL，然後用 browser_take_screenshot 截圖回傳。",
  "api_config": {
    "type": "mcp",
    "server": "browser",
    "tools": ["browser_navigate", "browser_take_screenshot"]
  }
}
```

---

## 5. 建議選擇

### 5.1 推薦方案：Microsoft Playwright MCP

**首選推薦 `@playwright/mcp`**，理由如下：

| 評估面向 | Playwright MCP 優勢 |
|----------|---------------------|
| **Transport** | 原生支援 SSE/HTTP，無需額外 proxy，MyClaw 可直接連線 |
| **方法論** | Accessibility Tree 不需 vision model，LLM token 用量低，與 MyClaw 的文字 LLM 完美搭配 |
| **維護** | Microsoft 官方維護，社群活躍，更新頻繁 |
| **跨瀏覽器** | 支援 Chromium + Firefox + WebKit |
| **Headless** | 原生支援 `--headless`，伺服器部署友好 |
| **擴展性** | 可選 vision/pdf/testing/tracing 功能模組 |
| **認證** | 支援 `--storage-state` 保存登入狀態 |

### 5.2 次選方案：Google chrome-devtools-mcp

如需 Performance Trace 和 Network 分析等深度調試功能，可搭配使用 Google 的 chrome-devtools-mcp。

### 5.3 建議部署架構

```
MyClaw Server (Express.js)
├── 現有：LLM Provider (Claude / Groq / Cerebras)
├── 現有：SQLite + skill-executor
└── 新增：MCP Client
      ↓ SSE/HTTP (localhost:8080)
    Playwright MCP Server
      --headless
      --port 8080
      --host 127.0.0.1
      ↓ CDP
    Headless Chromium
```

### 5.4 實作優先順序

1. **Phase 1**：安裝 Playwright MCP Server，實作 `mcp-client.ts` 基礎連線
2. **Phase 2**：整合到 skill-executor 工具呼叫迴圈，支援 navigate + screenshot
3. **Phase 3**：新增截圖類技能範本，支援圖片訊息回傳（LINE/Telegram）
4. **Phase 4**：支援表單填寫、資料擷取等進階場景
5. **Phase 5**：Docker 化 + 進程管理 + 健康檢查

### 5.5 環境變數設計

```env
# Browser MCP（選填，啟用瀏覽器自動化）
MCP_BROWSER_ENABLED=true
MCP_BROWSER_URL=http://127.0.0.1:8080/sse    # Playwright MCP SSE endpoint
MCP_BROWSER_HEADLESS=true                      # 是否 headless
MCP_BROWSER_TIMEOUT=30000                      # 操作超時（ms）
```

---

## 6. 風險與限制

| 風險 | 影響 | 緩解措施 |
|------|------|----------|
| Chrome 記憶體高 | Server OOM | 設記憶體上限、單實例模式、操作完關閉 |
| 長時間操作 | LINE/Telegram 回覆超時 | 先回「處理中...」再 editMessage |
| 安全性 | 用戶導航到惡意網站 | URL 白名單、沙盒模式 |
| 截圖含敏感資訊 | 隱私風險 | 登入 credentials 加密、操作完清除 cookie |
| MCP Server 掛掉 | 技能執行失敗 | 健康檢查 + 自動重啟 + graceful fallback |
| 並發限制 | 多用戶同時操作 | Queue 機制、per-user browser context |

---

## 參考資源

- [Google chrome-devtools-mcp (GitHub)](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [Microsoft playwright-mcp (GitHub)](https://github.com/microsoft/playwright-mcp)
- [Chrome DevTools MCP 官方部落格](https://developer.chrome.com/blog/chrome-devtools-mcp)
- [Playwright MCP DeepWiki](https://deepwiki.com/microsoft/playwright-mcp)
- [benjaminr/chrome-devtools-mcp (GitHub)](https://github.com/benjaminr/chrome-devtools-mcp)
- [lxe/chrome-mcp (GitHub)](https://github.com/lxe/chrome-mcp)
- [ByteDance Browser MCP](https://mcpservers.org/servers/bytedance/browser-mcp)
- [Cloudflare Playwright MCP](https://developers.cloudflare.com/browser-rendering/playwright/playwright-mcp/)
- [Browserless Chrome (Docker)](https://github.com/browserless/browserless)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Addy Osmani: DevTools MCP 介紹](https://addyosmani.com/blog/devtools-mcp/)
