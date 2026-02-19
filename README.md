# MyClaw — 多平台 AI 個人助理

透過 LINE 或 Telegram 對話建立專屬 AI 技能，不需要寫任何程式碼。

## 功能

- **自然語言建立技能** — 說「每天早上 8 點提醒我喝水」，AI 自動建立排程技能
- **技能觸發與執行** — 關鍵字、正則、定時排程、手動觸發
- **Skill Chaining** — 多技能自動串接，有工具的技能先取得資料，prompt-only 技能後加工（例如 Playwright 抓網頁 → 數據故事敘述產出報告）
- **外部 API 串接** — 技能可綁定外部 API，AI 動態產生工具並自動呼叫（支援 bearer token / API key 認證）
- **MCP 工具整合** — 透過 [Model Context Protocol](https://modelcontextprotocol.io/) 連接外部工具伺服器（瀏覽器自動化、檔案系統等），技能可直接呼叫 MCP 工具
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
GROQ_MODEL=qwen/qwen3-32b                        # Groq 模型
CEREBRAS_MODEL=gpt-oss-120b                       # Cerebras 模型

# 選填 — MCP 工具伺服器
# MCP_SERVERS='[{"name":"browser","transport":{"type":"stdio","command":"npx","args":["@playwright/mcp@latest","--headless","--isolated"]}}]'

# 選填 — 其他
PORT=3000                    # HTTP port
WEBHOOK_BASE_URL=            # Telegram webhook 自動註冊（如 https://yourdomain.com）
```

| 配置方式 | 模式 | 月費估算 |
|----------|------|---------|
| 只填 `ANTHROPIC_API_KEY` | Claude-only（Haiku 4.5 為主） | $1-12 |
| 只填 `GROQ_API_KEY` | Groq-only（Qwen3 32B） | $0 |
| 只填 `CEREBRAS_API_KEY` | Cerebras-only（GPT-OSS 120B） | $0 |
| 填 >=2 個 LLM Key | 混合模式（簡單→Groq/Cerebras，複雜→Claude） | $0-3 |

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
├── dynamic-tool-builder.ts # 從 ApiConfig 動態建立工具定義
├── http-executor.ts      # 通用 HTTP 執行器 + token 快取
├── mcp-client.ts         # MCP Client 連線管理 + 工具路由
├── test-mcp-server.ts    # 測試用 MCP Server（3 個範例工具）
└── scheduler.ts          # node-cron 排程（多平台推送）
```

## 開發指令

```bash
npm run dev        # 開發模式（熱重載）
npm run build      # 編譯 TypeScript
npm start          # 生產模式
npm run typecheck  # 型別檢查
```

## 技術棧

| 元件 | 選擇 |
|------|------|
| Runtime | Node.js 20+ |
| HTTP | Express.js |
| LINE SDK | @line/bot-sdk |
| Telegram | 原生 fetch API（無額外依賴） |
| AI | Claude API (Haiku 4.5 / Sonnet 4.5 等) + Groq API (Qwen3 32B / Kimi K2 等 7 款) + Cerebras Cloud (GPT-OSS 120B 等 3 款) |
| MCP | @modelcontextprotocol/sdk（支援 stdio / SSE transport） |
| 資料庫 | SQLite (better-sqlite3) |
| 排程 | node-cron |
| 語言 | TypeScript 5.x |

## Skill Chaining（技能串接）

當使用者的訊息同時匹配多個技能的關鍵字時，系統自動依序執行所有匹配的技能，形成 pipeline：

```
使用者：「請用 playwright 彙總網頁 ... 做成一份報告」
         ↓ 匹配到 "playwright"（總結網頁）+ "報告"（數據故事敘述）

Skill chaining: 「總結網頁」→「數據故事敘述」

1. 總結網頁（有 MCP 工具）→ Playwright 抓取頁面 → 產出摘要
2. 數據故事敘述（prompt-only）→ 收到摘要作為 context → 轉成敘事報告
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

本專案預設配置 2 個 MCP Server，共 25 個工具：

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
| [GitHub](https://github.com/anthropics/mcp-github) | 操作 GitHub |
| [Slack](https://github.com/anthropics/mcp-slack) | 發送 Slack 訊息 |
| [Google Maps](https://github.com/anthropics/mcp-google-maps) | 搜尋地點、路線導航 |

完整目錄：[MCP Server Directory](https://github.com/modelcontextprotocol/servers)

### 使用方式（以 Playwright 瀏覽器為例）

**Step 1：設定 `.env`**

```env
# stdio（推薦）：MyClaw 自動啟動並管理子程序
MCP_SERVERS=[{"name":"browser","transport":{"type":"stdio","command":"npx","args":["@playwright/mcp@latest","--headless","--isolated"]}}]
```

支援兩種 transport：
- **stdio**（本地子程序，推薦）— MyClaw 自動啟動並管理子程序
- **sse**（遠端服務）— 適合獨立運行的 MCP Server

```env
# sse 範例：連線到已啟動的 MCP Server
MCP_SERVERS=[{"name":"browser","transport":{"type":"sse","url":"http://127.0.0.1:8080/sse"}}]
```

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
  {"name":"browser","transport":{"type":"sse","url":"http://127.0.0.1:8080/sse"}},
  {"name":"db","transport":{"type":"stdio","command":"npx","args":["@anthropic/mcp-postgres","postgresql://localhost/mydb"]}}
]
```

```json
{
  "mcp_servers": ["browser", "db"]
}
```

這樣技能就能同時操作瀏覽器和查詢資料庫。

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

## 研究文件

完整的架構決策和研究報告請見 [`research/PLAN.md`](research/PLAN.md)。

## License

MIT
