# MyClaw — 多平台 AI 個人助理

透過 LINE 或 Telegram 對話建立專屬 AI 技能，不需要寫任何程式碼。

## 功能

- **自然語言建立技能** — 說「每天早上 8 點提醒我喝水」，AI 自動建立排程技能
- **技能觸發與執行** — 關鍵字、正則、定時排程、手動觸發
- **Skill Chaining** — 多技能自動串接，有工具的技能先取得資料，prompt-only 技能後加工（例如 Playwright 抓網頁 → 資料故事敘述產出報告）
- **自動創建定時任務** — cron 類型技能自動創建 scheduled_task，無需手動設定
- **外部 API 串接** — 技能可綁定外部 API，AI 動態產生工具並自動呼叫（支援 bearer token / API key 認證）
- **MCP 工具整合** — 透過 [Model Context Protocol](https://modelcontextprotocol.io/) 連接外部工具伺服器（瀏覽器自動化、檔案系統等），技能可直接呼叫 MCP 工具
- **AI 代碼生成** — 在對話中請 AI 寫程式碼，自動存入 SQLite，搭配 GitHub MCP 可直接推送到 repo
- **匯入公開技能** — 貼上 GitHub URL，AI 自動轉換並安裝（支援 Anthropic Agent Skills / OpenAI Codex Skills 格式）
- **技能目錄瀏覽** — 在對話中瀏覽並一鍵安裝熱門技能
- **使用者記憶** — AI 自動記住你的偏好、習慣和重要資訊
- **多平台支援** — LINE 和 Telegram，可同時啟用
- **多 LLM 支援** — Claude API、Groq API（免費）、Cerebras Cloud（免費）、或混合模式，自動偵測

## 快速開始

### 前置條件

1. 訊息平台（至少擇一）：
   - [LINE Official Account](https://developers.line.biz/console/) — 取得 Channel Access Token 和 Channel Secret
   - [Telegram Bot](https://t.me/BotFather) — 取得 Bot Token
2. AI API Key（至少擇一）：
   - [Anthropic API Key](https://console.anthropic.com/) — 付費，品質最好
   - [Groq API Key](https://console.groq.com/) — 免費，速度快
   - [Cerebras API Key](https://cloud.cerebras.ai/) — 免費，3000 tok/s 極速
   - 填 >=2 個 — 混合模式，最佳 CP 值

### 方式一：GitHub Codespaces（免費測試）

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/)

1. 點擊上方按鈕開啟 Codespace
2. 複製 `.env.example` 為 `.env`，填入 API Keys
3. `npm run dev`
4. 將 Port 3000 設為 Public，複製公開 URL
5. LINE：到 LINE Developers Console 設定 Webhook URL：`https://{your-url}/webhook/line`
6. Telegram：在 `.env` 中設定 `WEBHOOK_BASE_URL=https://{your-url}`，啟動時自動註冊

### 方式二：本地開發

```bash
git clone https://github.com/your-username/MyClaw.git
cd MyClaw
npm install
cp .env.example .env   # 編輯 .env 填入 API Keys
npm run dev
```

### 方式三：Docker

```bash
cp .env.example .env   # 編輯 .env 填入 API Keys
docker compose up -d
```

## 環境變數

```env
# 平台（至少填一個）
LINE_CHANNEL_ACCESS_TOKEN=   # LINE Messaging API token
LINE_CHANNEL_SECRET=         # LINE channel secret
TELEGRAM_BOT_TOKEN=          # Telegram Bot token

# AI API Key（至少填一個）
ANTHROPIC_API_KEY=           # Claude API
GROQ_API_KEY=                # Groq API（免費）
CEREBRAS_API_KEY=            # Cerebras Cloud（免費）

# 選填 — 模型切換
CLAUDE_DEFAULT_MODEL=claude-haiku-4-5-20250501    # Claude 主力模型
CLAUDE_COMPLEX_MODEL=claude-sonnet-4-5-20250514   # Claude 複雜任務模型
GROQ_MODEL=moonshotai/kimi-k2-instruct-0905      # Groq 模型（推薦，Tool Calling 最強）
CEREBRAS_MODEL=gpt-oss-120b                       # Cerebras 模型

# 選填 — MCP 工具伺服器
# Playwright 瀏覽器（二擇一）：
#   本地模式（開發用）：--headless --isolated
#   雲端模式（Render 等部署環境）：--cdp-endpoint wss://production-sfo.browserless.io?token=YOUR_TOKEN
# Tavily 搜尋/擷取：streamable-http transport
# GitHub（代碼推送，需 Personal Access Token，repo 權限）
# MCP_SERVERS='[{"name":"tavily","transport":{"type":"streamable-http","url":"https://mcp.tavily.com/mcp/?tavilyApiKey=YOUR_KEY"}},{"name":"browser","transport":{"type":"stdio","command":"npx","args":["@playwright/mcp@latest","--cdp-endpoint","wss://production-sfo.browserless.io?token=YOUR_TOKEN"]}},{"name":"github","transport":{"type":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-github"],"env":{"GITHUB_PERSONAL_ACCESS_TOKEN":"YOUR_GITHUB_TOKEN"}}}]'

# 選填 — 其他
PORT=3000                    # HTTP port
WEBHOOK_BASE_URL=            # Telegram webhook 自動註冊（如 https://yourdomain.com）
```

| 配置方式 | 模式 | 月費估算 |
|----------|------|---------|
| 只填 `ANTHROPIC_API_KEY` | Claude-only（Haiku 4.5 為主） | $1-12 |
| 只填 `GROQ_API_KEY` | Groq-only（Kimi K2） | $0 |
| 只填 `CEREBRAS_API_KEY` | Cerebras-only（GPT-OSS 120B） | $0 |
| 填 >=2 個 LLM Key | 混合模式（tool calling→Groq，報告生成→Cerebras，複雜→Claude） | $0-3 |

## 專案結構

```
src/
├── index.ts              # Express 伺服器 + 多平台 Webhook 處理
├── config.ts             # 環境變數 + 共用型別 + 模型註冊表
├── llm.ts                # LLM Provider Pattern（Claude / Groq / Cerebras / 混合）
├── db.ts                 # SQLite 資料庫 + 多平台使用者
├── memory.ts             # 使用者記憶系統
├── channel.ts            # 訊息平台抽象介面
├── line-channel.ts       # LINE 平台實作
├── telegram-channel.ts   # Telegram 平台實作
├── skill-manager.ts      # 技能建立與管理
├── skill-importer.ts     # GitHub URL 匯入 + 技能目錄 + AI 提取 api_config
├── skill-executor.ts     # 技能觸發 + Skill Chaining Pipeline + 動態工具呼叫執行
├── dynamic-tool-builder.ts # 從 ApiConfig 動態建立工具定義 + 內建工具註冊表
├── builtin-executor.ts   # 內建工具執行器（代碼生成/列表/取得）
├── http-executor.ts      # 通用 HTTP 執行器 + token 快取
├── mcp-client.ts         # MCP Client 連線管理 + 工具路由
├── test-mcp-server.ts    # 測試用 MCP Server（3 個範例工具）
└── scheduler.ts          # node-cron 排程（多平台推送）
```

## MCP 工具伺服器

MyClaw 透過 MCP 整合外部工具，預設提供 4 個 MCP Server：

### 1. test-mcp-server（開發測試用）
本地測試伺服器，提供 3 個範例工具：
- `get_current_time` — 取得當前時間（預設台北時區 Asia/Taipei）
- `fetch_webpage` — 抓取網頁內容
- `calculate` — 數學運算

**原始碼**：`src/test-mcp-server.ts`

### 2. tavily（搜尋與擷取）
MCP 連接 Tavily API，提供搜尋、擷取、提取等工具。

### 3. browser（瀏覽器自動化）
MCP 連接 Playwright，支援瀏覽器自動化操作。

### 4. github（代碼推送）
MCP 連接 GitHub API，支援推送代碼、管理 repo。

### 5. supabase（資料庫管理）
MCP 連接 Supabase，支援 SQL 查詢、表格管理、專案管理等。

| # | 工具 | 功能 |
|---|------|------|
| 1 | `execute_sql` | 執行 SQL 查詢 |
| 2 | `list_tables` | 列出所有表格 |
| 3 | `list_projects` | 列出所有專案 |
| 4 | `search_docs` | 搜尋 Supabase 文件 |
| 5 | `get_logs` | 取得專案日誌 |
| 6 | `generate_typescript_types` | 生成 TypeScript 型別 |

**設定方式**：
```env
MCP_SERVERS=[{"name":"supabase","transport":{"type":"stdio","command":"npx","args":["-y","@supabase/mcp-server-supabase@latest","--access-token","YOUR_SUPABASE_ACCESS_TOKEN"]}}]
```

取得 Access Token：Supabase Dashboard → Account Settings → Access Tokens

## 開發指令

```bash
npm run dev        # 開發模式（熱重載）
npm run build      # 編譯 TypeScript
npm start          # 生產模式
npm run typecheck  # 型別檢查
```

### Port 3000 被佔用

重啟 server 時若遇到 port 3000 佔用，執行：

```bash
lsof -ti :3000 | xargs kill -9
```

> **Codespaces 注意**：每次重啟 server 後，需到 Ports 面板將 port 3000 的 Visibility 設為 **Public**，Telegram webhook 才能收到訊息。

## 技術棧

| 元件 | 選擇 |
|------|------|
| Runtime | Node.js 20+ |
| HTTP | Express.js |
| LINE SDK | @line/bot-sdk |
| Telegram | 原生 fetch API（無額外依賴） |
| AI | Claude API (Haiku 4.5 / Sonnet 4.5 等) + Groq API (Kimi K2 / Qwen3 32B 等 7 款) + Cerebras Cloud (GPT-OSS 120B 等 3 款) |
| MCP | @modelcontextprotocol/sdk（支援 stdio / SSE / streamable-http transport） |
| 資料庫 | SQLite (better-sqlite3) |
| 排程 | node-cron |
| 語言 | TypeScript 5.x |

## Skill Chaining（技能串接）

當使用者的訊息同時匹配多個技能的關鍵字時，系統自動依序執行所有匹配的技能，形成 pipeline：

```
使用者：「總結 https://www.bbc.com/news/... 內容，做成一份報告」
         ↓ 匹配到 "總結"（總結網頁）+ "報告"（資料故事敘述）

Skill chaining: 「總結網頁」→「資料故事敘述」

1. 總結網頁（有 MCP 工具）→ Playwright 抓取頁面 → 產出摘要
2. 資料故事敘述（prompt-only）→ 收到摘要作為 context → 轉成敘事報告
3. 最終報告回傳給使用者
```

**執行順序規則**：有工具的技能（API / MCP）先跑（取得資料），prompt-only 技能後跑（轉換/加工）。前一個技能的輸出會注入下一個技能的 system prompt。

若只匹配到一個技能，行為與原本相同。

## MCP 工具整合

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 讓 AI 技能能呼叫外部工具伺服器，大幅擴展能力範圍。

### 架構概念

```
MyClaw (MCP Client)          MCP Server              實際服務
───────────────────    ←→    ──────────────    ←→    ──────────────
skill-executor               提供標準工具介面         瀏覽器 / 資料庫
  ↓ callMcpTool()                                    檔案系統 / API
mcp-client.ts                                        ...
```

MCP Server 是一個**工具翻譯層**，把複雜的外部服務包裝成 LLM 能呼叫的標準工具。MyClaw 的 MCP Client 會在啟動時連線所有設定的 MCP Server，技能執行時自動將 MCP 工具提供給 LLM。

### 目前已整合的 MCP Server

本專案預設配置 4 個 MCP Server，共 56 個工具：

#### tavily（[Tavily MCP](https://mcp.tavily.com/)，5 個工具）

| # | 工具 | 功能 |
|---|------|------|
| 1 | `tavily_search` | 搜尋網路即時資訊 |
| 2 | `tavily_extract` | 擷取指定 URL 的網頁內容 |
| 3 | `tavily_crawl` | 爬取整個網站（多頁） |
| 4 | `tavily_map` | 取得網站地圖結構 |
| 5 | `tavily_research` | 深度研究特定主題 |

#### browser（[Playwright MCP](https://www.npmjs.com/package/@playwright/mcp)，22 個工具）

| # | 工具 | 功能 |
|---|------|------|
| 1 | `browser_navigate` | 導航到指定 URL |
| 2 | `browser_snapshot` | 擷取頁面無障礙快照（取得文字內容） |
| 3 | `browser_click` | 點擊頁面元素 |
| 4 | `browser_type` | 輸入文字到可編輯元素 |
| 5 | `browser_fill_form` | 批次填寫表單 |
| 6 | `browser_press_key` | 按下鍵盤按鍵 |
| 7 | `browser_select_option` | 下拉選單選擇 |
| 8 | `browser_hover` | 滑鼠懸停 |
| 9 | `browser_drag` | 拖放元素 |
| 10 | `browser_take_screenshot` | 截圖 |
| 11 | `browser_navigate_back` | 上一頁 |
| 12 | `browser_tabs` | 管理分頁（列表/新增/關閉/切換） |
| 13 | `browser_close` | 關閉頁面 |
| 14 | `browser_resize` | 調整視窗大小 |
| 15 | `browser_evaluate` | 執行 JavaScript |
| 16 | `browser_run_code` | 執行 Playwright 程式碼片段 |
| 17 | `browser_file_upload` | 上傳檔案 |
| 18 | `browser_handle_dialog` | 處理對話框 |
| 19 | `browser_console_messages` | 取得 console 訊息 |
| 20 | `browser_network_requests` | 取得網路請求 |
| 21 | `browser_wait_for` | 等待文字出現/消失或指定時間 |
| 22 | `browser_install` | 安裝瀏覽器 |

#### github（[GitHub MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/github)，26 個工具）

搭配 AI 代碼生成功能，可在對話中生成代碼後直接推送到 GitHub repo。

| # | 工具 | 功能 |
|---|------|------|
| 1 | `create_or_update_file` | 建立或更新單一檔案 |
| 2 | `push_files` | 一次推送多個檔案 |
| 3 | `search_repositories` | 搜尋 GitHub repo |
| 4 | `create_repository` | 建立新 repo |
| 5 | `get_file_contents` | 取得檔案內容 |
| 6 | `fork_repository` | Fork repo |
| 7 | `create_branch` | 建立分支 |
| 8 | `list_branches` | 列出分支 |
| 9 | `create_issue` | 建立 Issue |
| 10 | `list_issues` | 列出 Issues |
| 11 | `update_issue` | 更新 Issue |
| 12 | `add_issue_comment` | Issue 留言 |
| 13 | `create_pull_request` | 建立 Pull Request |
| 14 | `list_pull_requests` | 列出 PRs |
| 15 | `get_pull_request` | 取得 PR 詳情 |
| 16 | `merge_pull_request` | 合併 PR |
| 17 | `get_pull_request_diff` | 取得 PR diff |
| 18 | `list_pull_request_files` | 列出 PR 變更檔案 |
| 19 | `create_pull_request_review` | PR 審核 |
| 20 | `search_code` | 搜尋程式碼 |
| 21 | `search_issues` | 搜尋 Issues |
| 22 | `search_users` | 搜尋使用者 |
| 23 | `get_issue` | 取得 Issue 詳情 |
| 24 | `get_pull_request_comments` | 取得 PR 留言 |
| 25 | `get_pull_request_reviews` | 取得 PR 審核 |
| 26 | `get_pull_request_status` | 取得 PR CI 狀態 |

#### test（自建測試用 MCP Server，3 個工具）

| # | 工具 | 功能 |
|---|------|------|
| 1 | `get_current_time` | 取得指定時區的時間 |
| 2 | `fetch_webpage` | 抓取網頁純文字內容 |
| 3 | `calculate` | 數學運算 |

### 更多社群 MCP Server

社群已有 3000+ 個 MCP Server，以下是常見的幾種：

| MCP Server | 用途 |
|------------|------|
| [Filesystem](https://github.com/anthropics/mcp-filesystem) | 讀寫本地檔案 |
| [PostgreSQL](https://github.com/anthropics/mcp-postgres) | 查詢資料庫 |
| [Slack](https://github.com/anthropics/mcp-slack) | 發送 Slack 訊息 |
| [Google Maps](https://github.com/anthropics/mcp-google-maps) | 搜尋地點、路線導航 |

完整目錄：[MCP Server Directory](https://github.com/modelcontextprotocol/servers)

### 使用方式（以 Playwright 瀏覽器為例）

**Step 1：設定 `.env`**

```env
# 本地開發：啟動本地 Chromium（需要瀏覽器環境）
MCP_SERVERS=[{"name":"browser","transport":{"type":"stdio","command":"npx","args":["@playwright/mcp@latest","--headless","--isolated"]}}]

# 雲端部署（Render 等）：透過 Browserless CDP 連接遠端瀏覽器（免費 1000 次/月）
MCP_SERVERS=[{"name":"browser","transport":{"type":"stdio","command":"npx","args":["@playwright/mcp@latest","--cdp-endpoint","wss://production-sfo.browserless.io?token=YOUR_TOKEN"]}}]
```

支援三種 transport：
- **stdio**（本地子程序，推薦）— MyClaw 自動啟動並管理子程序
- **sse**（遠端服務）— 適合獨立運行的 MCP Server
- **streamable-http**（HTTP 串流）— 適合雲端 MCP 服務（如 Tavily）

```env
# sse 範例：連線到已啟動的 MCP Server
MCP_SERVERS=[{"name":"browser","transport":{"type":"sse","url":"http://127.0.0.1:8080/sse"}}]

# streamable-http 範例：Tavily 搜尋/擷取
MCP_SERVERS=[{"name":"tavily","transport":{"type":"streamable-http","url":"https://mcp.tavily.com/mcp/?tavilyApiKey=YOUR_KEY"}}]
```

> **部署注意**：Render 等雲端環境無法安裝瀏覽器，Playwright 需改用 [Browserless](https://www.browserless.io/) 雲端模式（免費方案 1,000 units/月，~33 次/天，足夠個人使用）。

**Step 3：建立技能**

在 LINE / Telegram 對話中建立技能，指定使用 MCP Server：

> 「建立技能：網頁摘要助手，觸發關鍵字是『總結』，功能是幫我抓取使用者提供的網頁 URL 並摘要內容」

技能的 `api_config` 會包含 `mcp_servers` 聲明使用哪些 MCP Server：

```json
{
  "mcp_servers": ["browser"]
}
```

**Step 4：使用**

> 使用者：「總結 https://www.bbc.com/news/articles/cgk2mlv2k1r」
>
> AI 流程：
> 1. 匹配「網頁摘要助手」技能（關鍵字：總結）
> 2. 呼叫 `mcp__browser__browser_navigate` → 開啟網頁
> 3. 呼叫 `mcp__browser__browser_snapshot` → 取得頁面內容
> 4. AI 讀取內容 → 產生中文摘要回覆給使用者

### 多 MCP Server 組合

一個技能可以同時使用多個 MCP Server：

```env
MCP_SERVERS=[
  {"name":"tavily","transport":{"type":"streamable-http","url":"https://mcp.tavily.com/mcp/?tavilyApiKey=YOUR_KEY"}},
  {"name":"browser","transport":{"type":"stdio","command":"npx","args":["@playwright/mcp@latest","--cdp-endpoint","wss://production-sfo.browserless.io?token=YOUR_TOKEN"]}},
  {"name":"github","transport":{"type":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-github"],"env":{"GITHUB_PERSONAL_ACCESS_TOKEN":"YOUR_TOKEN"}}},
  {"name":"db","transport":{"type":"stdio","command":"npx","args":["@anthropic/mcp-postgres","postgresql://localhost/mydb"]}}
]
```

```json
{
  "builtin_tools": ["save_code", "list_code", "get_code"],
  "mcp_servers": ["github"]
}
```

這樣技能同時擁有內建工具（代碼存取）和 GitHub MCP 工具（push_files、create_pull_request 等），AI 可在對話中生成代碼存入 DB 後推送到 GitHub。

### 測試 MCP 整合

執行端到端測試（不需要 LLM API）：

```bash
node test-mcp-e2e.mjs
```

啟動伺服器驗證（需要 LLM API）：

```bash
# .env 中設定測試 MCP Server
MCP_SERVERS=[{"name":"test","transport":{"type":"stdio","command":"npx","args":["tsx","src/test-mcp-server.ts"]}}]

npm run dev

# 檢查 MCP 連線狀態
curl http://localhost:3000/health
# 回應會包含 mcp.servers 和 mcp.tools
```

## 技能建立與測試指南

Render 免費方案會在重新部署時重置 SQLite 資料庫。以下是透過 Telegram / LINE 對話重新建立所有技能的指令和測試方式。

### 技能總覽

| 技能名稱 | 觸發關鍵字 | 功能簡述 | 使用的工具 |
|----------|-----------|----------|-----------|
| 網路搜尋 | 搜尋 | 使用 tavily_search 即時搜尋網路資訊 | Tavily MCP |
| 網頁擷取 | 擷取 | 用 tavily_extract 抓取指定網頁內容 | Tavily MCP |
| 網站爬取 | 爬取 | 用 tavily_crawl 爬取整個網站 | Tavily MCP |
| 總結網頁 | 總結 | 用 Playwright 瀏覽器抓取並總結網頁內容 | Playwright MCP |
| 資料故事敘述 | 報告 | 將數據轉化為敘事報告，可與其他技能 Chaining | prompt-only |
| 前端設計 | 網頁 | 創建獨特且高品質的網頁介面，生成具有創意且精緻的程式碼 | prompt-only |
| 代碼助手 | 代碼 | 生成程式碼並存入 SQLite，可推送到 GitHub | builtin + GitHub MCP |
| Supabase 查詢 | 資料庫 | 執行 SQL 查詢、列出表格、管理 Supabase 專案 | Supabase MCP |
| 查詢時間 | 時間 | 用 get_current_time 查詢指定時區的目前時間 | test MCP |
| 網頁抓取 | 抓取 | 用 fetch_webpage 抓取網頁純文字內容 | test MCP |
| 數學計算 | 計算 | 用 calculate 執行數學運算 | test MCP |

### 1. 網路搜尋（Tavily）

**建立指令：**

> 建立技能：網路搜尋，觸發關鍵字是「搜尋」，功能是用 tavily_search 搜尋網路上的即時資訊，回傳整理過的重點摘要，使用工具是 Tavily MCP

**測試：**

> 搜尋 2026 年 AI 最新趨勢

### 2. 網頁擷取（Tavily）

**建立指令：**

> 建立技能：網頁擷取，觸發關鍵字是「擷取」，功能是用 tavily_extract 擷取指定網頁的內容，轉成乾淨的 Markdown 摘要，使用工具是 Tavily MCP

**測試：**

> 擷取 https://github.com/anthropics/claude-code

### 3. 網站爬取（Tavily）

**建立指令：**

> 建立技能：網站爬取，觸發關鍵字是「爬取」，功能是用 tavily_crawl 爬取整個網站並整理內容，使用工具是 Tavily MCP

**測試：**

> 爬取 https://docs.anthropic.com

### 4. 總結網頁（Playwright 瀏覽器）

**建立指令：**

> 建立技能：總結網頁，觸發關鍵字是「總結」，功能是用 browser_navigate 和 browser_snapshot 開啟使用者提供的網頁 URL，擷取頁面內容後用繁體中文摘要，使用工具是 Playwright MCP

**測試：**

> 總結 https://www.bbc.com/news

### 5. 資料故事敘述（prompt-only + Skill Chaining）

**新增技能「資料故事敘述」**

- **描述**：將數據轉化為引人入勝的故事，使用視覺化、情境和說服性結構來呈現分析結果
- **觸發方式**：keyword (報告)
- **來源**：https://github.com/wshobson/agents/tree/main/plugins/business-analytics/skills/data-storytelling

**測試（Skill Chaining — 同時觸發「總結」+「報告」兩個技能）：**

> 總結 https://www.bbc.com/news 做成一份報告

### 6. 前端設計（prompt-only）

**新增技能「前端設計」**

- **描述**：創建獨特且高品質的網頁介面，生成具有創意且精緻的程式碼
- **觸發方式**：keyword (網頁)
- **來源**：https://github.com/anthropics/claude-plugins-official/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md

**測試：**

> 網頁：設計一個現代化的個人部落格首頁，要有深色模式切換功能

### 7. 代碼助手（內建工具 + GitHub MCP）

**建立指令：**

> 建立技能：代碼助手，觸發關鍵字是「代碼」，功能是生成程式碼並用 save_code 儲存到 SQLite，也能用 push_files 推送到 GitHub，使用工具是 builtin + GitHub MCP

**測試 — 生成代碼並存入 SQLite：**

> 代碼：用 TypeScript 寫一個 fibonacci 函式

**測試 — 列出已存代碼：**

> 代碼：列出我所有的代碼

**測試 — 推送到 GitHub（需配置 GitHub MCP）：**

> 代碼：把 ID 1 的代碼推送到 GitHub repo youtube-topic-finder，帳號 nicklai12

### 8. Supabase 查詢（Supabase MCP）

**方式一：指定預設專案（推薦單一專案使用）**

在 `.env` 的 MCP_SERVERS 中加入 `--project-ref <your-project-ref>`：

```json
{"name":"supabase","transport":{"type":"stdio","command":"npx","args":["-y","@supabase/mcp-server-supabase@latest","--access-token","YOUR_TOKEN","--project-ref","nmiorcxbglrnudxafqnt"]}}
```

**方式二：Prompt 中動態指定（推薦多專案使用）**

不在設定檔寫死專案，由 AI 在呼叫工具時傳遞 `project_id`：

**建立指令：**

> 建立技能：Supabase 資料庫管理，觸發關鍵字是「資料庫」，功能是幫我查詢和管理 Supabase 資料庫。使用 Supabase MCP 工具。重要：每次呼叫 list_tables、execute_sql 等資料庫工具時，必須在參數中傳遞 project_id。預設使用 baby-lobster-bot 專案（project_id: nmiorcxbglrnudxafqnt），如果使用者指定其他專案，請先用 list_projects 取得正確的 project_id

**測試 — 列出所有專案：**

> 資料庫 列出我的所有專案和 project_id

**測試 — 列出表格（指定 project_id）：**

> 資料庫 列出 baby-lobster-bot 專案（project_id: nmiorcxbglrnudxafqnt）的所有表格

**測試 — 執行 SQL（指定 project_id）：**

> 資料庫 在 baby-lobster-bot 專案（project_id: nmiorcxbglrnudxafqnt）執行 SQL：SELECT * FROM users LIMIT 10

**測試 — 查詢其他專案：**

> 資料庫 列出 my-other-project 專案的所有表格

> 資料庫 在專案 project_id: abcdefghijklmnopqrst 執行：SELECT * FROM orders

**測試 — 查看日誌（指定 project_id 和 service_type）：**

> 資料庫 取得 baby-lobster-bot 專案（project_id: nmiorcxbglrnudxafqnt）的 api 日誌

> 資料庫 取得 baby-lobster-bot 專案（project_id: nmiorcxbglrnudxafqnt）的 postgres 日誌

**注意**：`get_logs` 需要指定 `service_type` 參數（可選值：api、postgres、edge_functions、auth、storage、realtime），請在指令中明確告知 AI 要查詢哪種服務的日誌。

### 9. 查詢時間（test MCP）

**建立指令：**

> 建立技能：查詢時間，觸發關鍵字是「時間」，功能是用 get_current_time 查詢指定時區的目前時間，使用工具是 test MCP

**測試：**

> 時間 現在台北幾點？

### 10. 網頁抓取（test MCP）

**建立指令：**

> 建立技能：網頁抓取，觸發關鍵字是「抓取」，功能是用 fetch_webpage 抓取網頁純文字內容，使用工具是 test MCP

**測試：**

> 抓取 https://example.com

### 11. 數學計算（test MCP）

**建立指令：**

> 建立技能：數學計算，觸發關鍵字是「計算」，功能是用 calculate 執行數學運算，使用工具是 test MCP

**測試：**

> 計算 123 * 456 + 789

### 12. 定時提醒測試

**建立指令：**

> 建立技能：每分鐘測試提醒，使用 cron 定時，每分鐘執行一次，回覆「這是每分鐘測試提醒」

或更實用的例子：

> 建立技能：每天喝水提醒，每天晚上 9 點提醒我喝水，訊息要溫馨可愛

**測試方法：**

1. 建立後等待 1 分鐘（cron `* * * * *`）或到指定時間（如 `0 21 * * *` 每晚 9 點）
2. 檢查 Telegram/ LINE 是否收到自動提醒
3. 確認訊息內容正確

**驗證定時任務：**

> 我的技能

應顯示技能狀態為 `[ON]`，如果是 cron 類型會自動顯示定時任務狀態。

**停用定時提醒：**

> 停用 [技能名稱]

### 建立後確認

建立完所有技能後，發送以下訊息確認：

> 我的技能

應顯示所有技能全部 `[ON]`。

### 注意事項

- 每個技能的 `api_config`（包含 `mcp_servers`、`builtin_tools`）由 AI 自動判斷生成
- 如果 AI 沒有正確加上 `mcp_servers` 或 `builtin_tools`，可刪除重建，用更明確的措辭描述（如「用瀏覽器」「推送到 GitHub」）
- Skill Chaining 會自動串接同時匹配的技能，不需額外設定

## 研究文件

完整的架構決策和研究報告請見 [`research/PLAN.md`](research/PLAN.md)。

## License

MIT
