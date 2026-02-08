# 快速原型計畫 (MVP)

## 目標

在最短時間內建立一個可運作的 LINE AI 助理原型，使用者能透過 LINE 對話與 Claude 互動並建立自訂技能。

## MVP 範圍 — 只做必要的

### ✅ 包含 (Week 1-2)

| 功能 | 說明 | 優先級 |
|------|------|--------|
| LINE 連接 | Webhook 接收訊息，Reply/Push 回應 | P0 |
| Claude 對話 | 呼叫 Anthropic API 進行對話 | P0 |
| 使用者記憶 | 每個使用者獨立的 memory.md | P0 |
| 對話式技能建立 | 透過對話建立自訂技能 | P1 |
| 定時技能執行 | cron 排程執行技能 | P1 |
| 技能管理 | 列出/暫停/刪除技能 | P1 |

### ❌ 不包含 (MVP 之後再做)

| 功能 | 原因 |
|------|------|
| 容器隔離 | 增加複雜度，個人使用不需要 |
| 群組支持 | 先做 1:1 |
| Rich Menu | 可以後加 |
| Flex Message | 先用純文字 |
| 對話歷史回放 | 非核心 |
| 多語言 | 先支援中文 |

## 技術選型

### 核心堆疊

```
Runtime:      Node.js 20+ (與 NanoClaw 一致)
框架:         Express.js (輕量 HTTP 伺服器)
LINE SDK:     @line/bot-sdk (官方)
AI:           @anthropic-ai/sdk (直接呼叫 API)
資料庫:       SQLite (better-sqlite3)
排程:         node-cron
部署:         Railway / Render (免費方案)
```

### 為什麼不用 Claude Agent SDK?

NanoClaw 使用完整的 Claude Agent SDK (claude-code)，但 MVP 使用直接 API 呼叫：

| 比較 | Claude Agent SDK | Anthropic API 直接呼叫 |
|------|-----------------|----------------------|
| 安裝 | 需要 claude-code CLI | `npm install @anthropic-ai/sdk` |
| 容器 | 需要容器環境 | 不需要 |
| 工具 | Bash, Read, Write, Glob... | 自訂 tools (web_search 等) |
| 成本 | 較高 (工具呼叫多) | 較低 (精確控制) |
| 複雜度 | 高 | 低 |
| 彈性 | 超強 (完整 coding agent) | 足夠 (對話 + 簡單工具) |

MVP 選擇直接 API 是因為:
1. 零額外依賴 (不需要 CLI 工具)
2. 更容易部署到雲端
3. 成本可控
4. 對個人助理功能已經足夠

## 檔案結構

```
line-ai-assistant/
├── package.json
├── .env                    # LINE & Anthropic 憑證
├── src/
│   ├── index.ts            # 主程序 (Express + Webhook)
│   ├── config.ts           # 配置
│   ├── line.ts             # LINE SDK 封裝
│   ├── ai.ts               # Claude API 封裝
│   ├── db.ts               # SQLite 操作
│   ├── skills.ts           # 技能系統
│   ├── scheduler.ts        # 排程系統
│   └── memory.ts           # 記憶管理
├── data/
│   ├── store.db            # SQLite 資料庫
│   └── users/              # 使用者資料
│       └── {userId}/
│           ├── memory.md   # 使用者記憶
│           └── skills/     # 使用者技能
└── templates/
    └── skills/             # 預設技能範本
```

**總共約 8 個源碼檔案，估計 ~800 行代碼。**

## 核心流程

### 訊息處理流程

```
LINE Webhook POST /webhook
    ↓
解析事件 (message/postback/follow)
    ↓
識別使用者 (userId)
    ↓
載入使用者上下文 (memory.md + skills)
    ↓
判斷意圖:
├── 技能管理? → skills.ts 處理
├── 匹配關鍵字技能? → 執行對應技能
└── 一般對話? → 送到 Claude API
    ↓
格式化回應 → 回覆 LINE
```

### 技能建立流程

```
使用者: "我想要每天早上收到天氣報告"
    ↓
ai.ts: 呼叫 Claude，system prompt 包含技能建立指令
    ↓
Claude 回應: 解析出技能配置 JSON
    ↓
skills.ts: 儲存技能到 users/{userId}/skills/
    ↓
scheduler.ts: 如果是定時技能，註冊 cron job
    ↓
回覆使用者: "技能已建立 ✅"
```

## 開發時程

### Phase 1: 基礎對話 (Day 1-2)

- [ ] 專案初始化 (package.json, TypeScript config)
- [ ] LINE Webhook 伺服器 (Express)
- [ ] Claude API 整合 (基本對話)
- [ ] SQLite 資料庫 (使用者、訊息)
- [ ] 使用者記憶系統 (memory.md)
- [ ] 基本回應 (接收 → Claude → 回覆)

交付: 能透過 LINE 與 Claude 對話。

### Phase 2: 技能系統 (Day 3-4)

- [ ] 技能資料模型 (JSON schema)
- [ ] 對話式技能建立 (prompt engineering)
- [ ] 關鍵字觸發技能
- [ ] 技能管理 (列出/刪除)
- [ ] 預設技能範本 (3-5 個)

交付: 能透過對話建立和使用自訂技能。

### Phase 3: 排程與部署 (Day 5-6)

- [ ] 排程系統 (node-cron)
- [ ] 定時技能執行
- [ ] 部署到 Railway/Render
- [ ] 環境變數設定文件
- [ ] 一鍵部署按鈕 (Deploy to Railway)

交付: 完整可部署的 MVP。

### Phase 4: 美化與文件 (Day 7)

- [ ] README.md (安裝指南)
- [ ] 設定說明文件
- [ ] Rich Menu (選擇性)
- [ ] 錯誤處理完善
- [ ] 使用範例 demo

## 安裝步驟 (使用者角度)

### 最簡流程 (目標: 5 分鐘)

```bash
# 1. 複製專案
git clone https://github.com/你的帳號/line-ai-assistant.git
cd line-ai-assistant

# 2. 安裝依賴
npm install

# 3. 設定環境變數
cp .env.example .env
# 編輯 .env，填入:
# - LINE_CHANNEL_ACCESS_TOKEN
# - LINE_CHANNEL_SECRET
# - ANTHROPIC_API_KEY

# 4. 部署 (二選一)
npm run deploy        # 一鍵部署到 Railway
# 或
npm run dev           # 本地開發 (需要 ngrok)
```

### 或一鍵雲端部署

在 README 中放置一鍵部署按鈕:
- **Deploy to Railway** — 點擊 → 填入環境變數 → 完成
- **Deploy to Render** — 同上

## 成本估算 (個人使用)

| 項目 | 月費 | 說明 |
|------|------|------|
| LINE Official Account | NT$0 | 免費方案 |
| Railway / Render | $0-5 USD | 免費方案足夠 |
| Anthropic API | $5-15 USD | 依使用量 |
| **總計** | **~$5-20 USD/月** | 約 NT$160-640 |

## 與 NanoClaw 的比較

| 項目 | NanoClaw | LINE AI Assistant (MVP) |
|------|----------|------------------------|
| 代碼量 | ~2000 行 | ~800 行 |
| 檔案數 | ~15+ | ~8 |
| 依賴數 | 7 | 5 |
| 安裝時間 | 30+ 分鐘 | 5 分鐘 |
| 需要容器 | ✅ | ❌ |
| 需要本地運行 | ✅ | ❌ (雲端) |
| 通訊軟體 | WhatsApp | LINE |
| 技能建立 | 開發者寫 SKILL.md | 使用者用對話 |
| 安全隔離 | OS 級容器 | 使用者 ID 隔離 |
| 目標使用者 | 開發者 | 任何人 |
