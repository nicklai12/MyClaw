# MyClaw — LINE AI 個人助理

透過 LINE 對話建立專屬 AI 技能，不需要寫任何程式碼。

## 功能

- **自然語言建立技能** — 說「每天早上 8 點提醒我喝水」，AI 自動建立排程技能
- **技能觸發與執行** — 關鍵字、正則、定時排程、手動觸發
- **匯入公開技能** — 貼上 GitHub URL，AI 自動轉換並安裝（支援 Anthropic Agent Skills / OpenAI Codex Skills 格式）
- **技能目錄瀏覽** — 在 LINE 中瀏覽並一鍵安裝熱門技能
- **使用者記憶** — AI 自動記住你的偏好、習慣和重要資訊
- **多 LLM 支援** — Claude API、Groq API（免費）、或混合模式，自動偵測

## 快速開始

### 前置條件

1. [LINE Official Account](https://developers.line.biz/console/) — 取得 Channel Access Token 和 Channel Secret
2. AI API Key（擇一）：
   - [Anthropic API Key](https://console.anthropic.com/) — 付費，品質最好
   - [Groq API Key](https://console.groq.com/) — 免費，速度最快
   - 兩個都填 — 混合模式，最佳 CP 值

### 方式一：GitHub Codespaces（免費測試）

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/)

1. 點擊上方按鈕開啟 Codespace
2. 複製 `.env.example` 為 `.env`，填入 API Keys
3. `npm run dev`
4. 將 Port 3000 設為 Public，複製公開 URL
5. 到 LINE Developers Console 設定 Webhook URL：`https://{your-url}/webhook`

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
# 必填
LINE_CHANNEL_ACCESS_TOKEN=   # LINE Messaging API token
LINE_CHANNEL_SECRET=         # LINE channel secret

# AI API Key（至少填一個）
ANTHROPIC_API_KEY=           # Claude API
GROQ_API_KEY=                # Groq API（免費）
```

| 配置方式 | 模式 | 月費估算 |
|----------|------|---------|
| 只填 `ANTHROPIC_API_KEY` | Claude-only（Haiku 4.5 為主） | $1-12 |
| 只填 `GROQ_API_KEY` | Groq-only（Qwen3 32B） | $0 |
| 兩個都填 | 混合模式（簡單→Groq，複雜→Claude） | $0-3 |

## 專案結構

```
src/
├── index.ts              # Express 伺服器 + LINE Webhook
├── config.ts             # 環境變數 + 共用型別
├── llm.ts                # LLM Provider Pattern（Claude / Groq / 混合）
├── db.ts                 # SQLite 資料庫
├── memory.ts             # 使用者記憶系統
├── skill-manager.ts      # 技能建立與管理
├── skill-importer.ts     # GitHub URL 匯入 + 技能目錄
├── skill-executor.ts     # 技能觸發與執行
└── scheduler.ts          # node-cron 排程
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
| AI | Claude API (Haiku 4.5 / Sonnet 4.5) + Groq API (Qwen3 32B) |
| 資料庫 | SQLite (better-sqlite3) |
| 排程 | node-cron |
| 語言 | TypeScript 5.x |

## 研究文件

完整的架構決策和研究報告請見 [`research/PLAN.md`](research/PLAN.md)。

## License

MIT
