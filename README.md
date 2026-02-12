# MyClaw — 多平台 AI 個人助理

透過 LINE 或 Telegram 對話建立專屬 AI 技能，不需要寫任何程式碼。

## 功能

- **自然語言建立技能** — 說「每天早上 8 點提醒我喝水」，AI 自動建立排程技能
- **技能觸發與執行** — 關鍵字、正則、定時排程、手動觸發
- **外部 API 串接** — 技能可綁定外部 API，AI 動態產生工具並自動呼叫（支援 bearer token / API key 認證）
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
├── skill-executor.ts     # 技能觸發與動態工具呼叫執行
├── dynamic-tool-builder.ts # 從 ApiConfig 動態建立工具定義
├── http-executor.ts      # 通用 HTTP 執行器 + token 快取
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
| 資料庫 | SQLite (better-sqlite3) |
| 排程 | node-cron |
| 語言 | TypeScript 5.x |

## 研究文件

完整的架構決策和研究報告請見 [`research/PLAN.md`](research/PLAN.md)。

## License

MIT
