# MyClaw AI Assistant

基於 NanoClaw 架構簡化而來的多平台個人 AI 助理。使用者透過 LINE 或 Telegram 對話建立專屬技能，AI 自動客製化為貼身助理。

## 需求規格書

完整研究與計畫請見 [research/PLAN.md](research/PLAN.md)，所有架構決策都記錄在 `research/` 資料夾中。

## 架構

```
LINE ──────→ Express.js (Webhook) ─→ LLM Provider (自動偵測模式)
Telegram ──→   /webhook/line           ├── Claude-only：只有 ANTHROPIC_API_KEY
               /webhook/telegram       │    └── 80% Haiku 4.5 + 20% Sonnet 4.5
                                       ├── Groq-only：只有 GROQ_API_KEY
                                       │    └── Qwen3 32B (免費)
                                       ├── Cerebras-only：只有 CEREBRAS_API_KEY
                                       │    └── GPT-OSS 120B (免費, 3000 tok/s)
                                       ├── Moonshot-only：只有 MOONSHOT_API_KEY
                                       │    └── Kimi K2.5 (Tool Calling 優秀)
                                       └── 混合模式：>=2 個 API Key
                                            └── 簡單→Groq/Cerebras/Moonshot, 複雜→Claude
SQLite (better-sqlite3) + node-cron
16 個源碼檔案
```

## 目錄結構

```
src/
├── index.ts              # Express 伺服器 + 多平台 Webhook 處理
├── config.ts             # 環境變數 + 常數 + 模型註冊表 + 平台型別
├── llm.ts                # LLM Provider Pattern (Claude / Groq / Cerebras / 混合)
├── db.ts                 # SQLite schema + CRUD 操作 + 多平台使用者
├── memory.ts             # 使用者記憶系統 (讀/寫/更新)
├── channel.ts            # 訊息平台抽象介面 (MessageChannel)
├── line-channel.ts       # LINE 平台實作 (LineChannel)
├── telegram-channel.ts   # Telegram 平台實作 (TelegramChannel)
├── skill-manager.ts      # 技能建立 + 管理 (自然語言 → JSON)
├── skill-importer.ts     # GitHub URL 匯入 + 公開技能目錄瀏覽 + AI 提取 api_config
├── skill-executor.ts     # 技能觸發判斷 + Skill Chaining Pipeline + 動態工具呼叫執行
├── dynamic-tool-builder.ts # 從 ApiConfig 動態建立 ToolDefinition[] + 內建工具註冊表
├── builtin-executor.ts   # 內建工具執行器（代碼生成/列表/取得）
├── http-executor.ts      # 通用 HTTP 執行器 + bearer token 快取
├── mcp-client.ts         # MCP Client Manager（全域 MCP Server 連線管理）
└── scheduler.ts          # node-cron 排程任務（多平台推送）
```

## 關鍵檔案職責

| 檔案 | 職責 | 依賴 |
|------|------|------|
| `index.ts` | HTTP 伺服器、多平台 Webhook 接收與回覆、訊息路由 | config, llm, db, skill-executor, channel, line-channel, telegram-channel |
| `config.ts` | `process.env` 讀取、常數定義、型別匯出、模型註冊表（白名單驗證）、平台型別 | 無 |
| `llm.ts` | Provider Pattern：自動偵測 API Key 決定模式、OpenAI 相容 Provider 泛化、Tool Calling、錯誤重試 | config |
| `db.ts` | SQLite 初始化、表建立、users/skills/messages CRUD、credentials 欄位、多平台使用者 | config |
| `memory.ts` | 使用者記憶的 Markdown 格式管理、上下文注入 | db |
| `channel.ts` | 訊息平台抽象介面定義（IncomingMessage, MessageChannel） | config |
| `line-channel.ts` | LINE 平台 MessageChannel 實作、Webhook Router | channel |
| `telegram-channel.ts` | Telegram 平台 MessageChannel 實作、原生 fetch API、訊息編輯 | channel |
| `skill-manager.ts` | 解析自然語言意圖、生成技能 JSON、CRUD 技能 | llm, db |
| `skill-importer.ts` | 解析 GitHub URL、fetch SKILL.md、AI 格式轉換、安全檢查、技能目錄瀏覽、AI 提取 api_config | llm, db, skill-manager |
| `skill-executor.ts` | 關鍵字/模式/cron 觸發判斷、Skill Chaining Pipeline（多技能依序執行）、動態工具呼叫迴圈（max 8 次）、執行技能 prompt | llm, db, memory, dynamic-tool-builder, http-executor, mcp-client |
| `dynamic-tool-builder.ts` | 從 ApiConfig 動態建立 ToolDefinition[]（api_call 通用工具）+ 內建工具註冊表 | config |
| `builtin-executor.ts` | 內建工具執行器：save_code / list_code / get_code 路由與執行 | db |
| `http-executor.ts` | 通用 HTTP 執行器、bearer token 自動登入與快取、api_key 注入 | config, db |
| `mcp-client.ts` | MCP Client Manager：全域 MCP Server 連線、工具列表快取、工具呼叫路由 | config |
| `scheduler.ts` | node-cron 排程、定時技能觸發、多平台推送 | db, skill-executor, channel |

## 技術棧

| 元件 | 選擇 | 版本 |
|------|------|------|
| Runtime | Node.js | 20+ |
| HTTP | Express.js | 4.x |
| LINE SDK | @line/bot-sdk | 最新 |
| Telegram | 原生 fetch API | 無額外依賴 |
| AI (模式A) | Groq API (Qwen3 32B) | 免費主力 |
| AI (模式B) | Claude API (Haiku 4.5 + Sonnet 4.5) | 付費但品質更優 |
| AI (模式C) | Cerebras Cloud (GPT-OSS 120B) | 免費, 3000 tok/s |
| AI (模式D) | Moonshot AI (Kimi K2.5) | Tool Calling 優秀 |
| AI (模式E) | 混合模式 (>=2 providers) | 最佳 CP 值 |
| 資料庫 | better-sqlite3 | 最新 |
| 排程 | node-cron | 最新 |
| 語言 | TypeScript | 5.x |

## 環境變數

```env
# 平台（至少填一個）
LINE_CHANNEL_ACCESS_TOKEN=   # LINE Messaging API token
LINE_CHANNEL_SECRET=         # LINE channel secret
TELEGRAM_BOT_TOKEN=          # Telegram Bot token

# AI API Key（至少填一個）
ANTHROPIC_API_KEY=           # Claude API — 填此 key 即啟用 Claude-only 或混合模式
GROQ_API_KEY=                # Groq API (免費) — 填此 key 即啟用 Groq-only 或混合模式
CEREBRAS_API_KEY=            # Cerebras Cloud (免費) — 填此 key 即啟用 Cerebras-only 或混合模式
MOONSHOT_API_KEY=            # Moonshot AI (Kimi K2.5) — 填此 key 即啟用 Moonshot-only 或混合模式
# >=2 個 LLM key → hybrid 混合模式（簡單→Groq/Cerebras/Moonshot, 複雜→Claude）
# 都不填 → 啟動失敗

# 選填
CLAUDE_DEFAULT_MODEL=claude-haiku-4-5-20250501    # Claude 主力模型
CLAUDE_COMPLEX_MODEL=claude-sonnet-4-5-20250514   # Claude 複雜任務模型
GROQ_MODEL=qwen/qwen3-32b                        # Groq 模型
CEREBRAS_MODEL=gpt-oss-120b                       # Cerebras 模型
MOONSHOT_MODEL=kimi-k2-5                          # Moonshot 模型
PORT=3000                    # HTTP port
NODE_ENV=development         # development | production
WEBHOOK_BASE_URL=            # Telegram webhook 自動註冊用（如 https://yourdomain.com）

# MCP Servers（選填，JSON 陣列）
MCP_SERVERS='[{"name":"playwright","transport":{"type":"sse","url":"http://127.0.0.1:8080/sse"}}]'
```

## 開發指令

```bash
npm install          # 安裝依賴
npm run dev          # 開發模式 (tsx watch 熱重載)
npm run build        # 編譯 TypeScript
npm start            # 生產模式 (node dist/)
```

## 開發規範

### 代碼風格
- TypeScript strict mode
- 使用 ES modules (import/export)
- 錯誤處理用 try/catch，不要 swallow errors
- 函式保持小而專注，單一職責

### 檔案規範
- 每個檔案只負責一個明確的功能區域
- 檔案之間透過 import/export 明確依賴
- 共用型別定義放在各自檔案中 export
- 避免循環依賴

### Agent 協作規範
- 每個 agent 只修改分配給自己的檔案
- 不要修改其他 agent 負責的檔案
- 共用介面 (型別、函式簽名) 需要先在 config.ts 或各自檔案中定義好
- 有依賴關係的檔案，被依賴方先完成

### 命名規範
- 檔案名：kebab-case (skill-manager.ts)
- 函式名：camelCase (createSkill)
- 型別/介面：PascalCase (SkillConfig)
- 常數：UPPER_SNAKE_CASE (MAX_RETRIES)
- 資料庫表名：snake_case (user_skills)

## SQLite Schema 設計方向

```sql
-- 使用者
users (id, line_user_id, display_name, memory_md, credentials, platform, platform_user_id, created_at, updated_at)
-- credentials: JSON，按服務名稱儲存認證資訊，例如 {"erp": {"username": "...", "password": "..."}}
-- platform: 'line' | 'telegram'（預設 'line'）
-- platform_user_id: 跨平台統一的使用者 ID

-- 技能
skills (
  id, user_id, name, description,
  trigger_type,    -- 'keyword' | 'pattern' | 'cron' | 'manual' | 'always'
  trigger_value,
  prompt,
  tools,           -- JSON array (legacy，由 api_config 取代)
  api_config,      -- JSON: ApiConfig | null（外部 API 連線設定）
  enabled,
  source_type,     -- 'user_created' | 'github_import' | 'catalog' | 'shared'
  source_url,      -- 匯入來源 URL（追溯用）
  created_at
)

-- 對話紀錄
messages (id, user_id, role, content, created_at)

-- 排程任務
scheduled_tasks (id, skill_id, user_id, cron_expression, next_run, last_run, enabled)
```

## LLM Provider 使用要點

### Groq API (Groq-only / 混合模式)

- 預設 Model ID: `qwen/qwen3-32b`（通用），另支援 `qwen-qwq-32b`（推理）、`moonshotai/kimi-k2-instruct-0905`、`meta-llama/llama-4-scout-17b-16e-instruct`、`meta-llama/llama-3.3-70b-versatile`、`mistralai/mistral-saba-24b` 等
- 透過 `GROQ_MODEL` 環境變數切換，啟動時白名單驗證
- 使用 OpenAI 兼容格式 (openai SDK 或 fetch)
- Tool Calling 用於技能建立 (function schema 強制 JSON 格式)
- 免費額度：RPM 30, RPD 14400
- 加 `/no_think` 到 user prompt 可關閉思考模式以加速回應
- ⚠️ JSON 輸出可靠性問題：thinking mode 關閉時可能產生無效 JSON，需實作 retry

### Claude API (Claude-only / 混合模式)

- 主力模型：`claude-haiku-4-5-20250501`（快速便宜，~101 TPS）
- 複雜任務：`claude-sonnet-4-5-20250514`（品質最佳）
- 使用 `@anthropic-ai/sdk`
- Structured Output：原生 JSON Schema 支援，穩定可靠
- Tool Calling：業界頂級，參數提取精確
- Prompt Caching：啟用可節省 50-80% input 費用（system prompt + 歷史對話快取）
- Rate Limit：Tier 1 ($5 儲值) 即有 50 RPM，個人使用綽綽有餘
- 技能執行統一 `max_tokens: 4096`（Telegram 單則上限 4096 字元，4096 tokens ≈ 1500-2000 中文字）
- 回應速度比 Groq 慢 3-5 倍，超過 5 秒的任務建議先回「思考中...」

### Cerebras Cloud API (Cerebras-only / 混合模式)

- 預設 Model ID: `gpt-oss-120b`（Production, 3000 tok/s, 131K context）
- 另支援 `qwen-3-235b-a22b-instruct-2507`（Preview, 需 /no_think）、`zai-glm-4.7`（Preview, RPD=100）
- 使用 OpenAI 兼容格式（共用 `chatWithOpenAICompat()`）
- baseURL: `https://api.cerebras.ai/v1`
- 免費，速度極快
- 透過 `CEREBRAS_MODEL` 環境變數切換，啟動時白名單驗證

### Moonshot AI API (Moonshot-only / 混合模式)

- 預設 Model ID: `kimi-k2-5`（Kimi K2.5，Tool Calling 優秀）
- 另支援 `moonshot-v1-8k`、`moonshot-v1-32k`、`moonshot-v1-128k`（不同 context length）
- 使用 OpenAI 兼容格式（共用 `chatWithOpenAICompat()`）
- baseURL: `https://api.moonshot.ai/v1`
- 透過 `MOONSHOT_MODEL` 環境變數切換，啟動時白名單驗證

### Provider 自動偵測邏輯

```
啟動時檢查環境變數：
├── 只有 ANTHROPIC_API_KEY    → claude-only 模式
├── 只有 GROQ_API_KEY         → groq-only 模式
├── 只有 CEREBRAS_API_KEY     → cerebras-only 模式
├── 只有 MOONSHOT_API_KEY     → moonshot-only 模式
├── >=2 個 LLM API Key        → hybrid 混合模式
│    ├── complex（報告/生成）→ Claude（品質最好）→ Cerebras（速度快）→ Moonshot → Groq
│    └── simple（tool calling）→ Groq（工具呼叫精準）→ Cerebras（速度快）→ Moonshot → Claude
└── 都沒有                     → 啟動失敗，提示使用者
```

## 訊息平台

### 平台抽象架構

```
MessageChannel (channel.ts) — 抽象介面
├── LineChannel (line-channel.ts) — LINE 實作
│    ├── reply() → replyMessage / pushMessage fallback
│    ├── push() → pushMessage
│    └── createWebhookRouter() → /webhook/line
└── TelegramChannel (telegram-channel.ts) — Telegram 實作
     ├── reply() / push() → sendMessage (原生 fetch)
     ├── editMessage() → editMessageText（思考中→最終結果 UX）
     ├── sendAndGetId() → sendMessage + 回傳 message_id
     ├── sendTypingIndicator() → sendChatAction("typing")
     └── createWebhookRouter() → /webhook/telegram
```

### LINE Webhook 要點

- 驗證 signature (x-line-signature header)
- Reply Token 只能用一次且有時效
- Reply Message 免費，Push Message 有限額
- Webhook 須回應 HTTP 200，處理邏輯異步進行
- `/webhook` 路徑向後相容指向 LINE

### Telegram Webhook 要點

- 使用原生 `fetch()` 呼叫 Telegram Bot API，無額外依賴
- 訊息可編輯：技能執行時先發「思考中...」再 `editMessageText` 為最終結果
- 完全免費，無訊息數限制
- 設定 `WEBHOOK_BASE_URL` 啟動時自動註冊 webhook

## Skill Chaining（Sequential Pipeline）

當使用者的訊息同時匹配多個技能時，系統會依序執行所有匹配的技能，形成 pipeline。

### 運作流程

```
使用者訊息 → findMatchingSkills() 收集所有匹配技能
                    ↓
           sortSkillsForChaining() 排序
           （有工具的先跑，prompt-only 後跑）
                    ↓
           executeSkillChain() 依序執行
           前一個技能的輸出 → 注入下一個技能的 system prompt
                    ↓
           回傳最後一個技能的輸出
```

### 範例

```
使用者：「請用 playwright 彙總網頁 ... 做成一份報告」
         ↓ 匹配到 "playwright" + "報告"

Skill chaining: 「總結網頁」→「數據故事敘述」

1. 總結網頁（有 MCP 工具）→ Playwright 抓頁面 → 產出摘要
2. 數據故事敘述（prompt-only）→ 收到摘要 context → 轉成敘事報告
3. 最終報告回傳給使用者
```

### 關鍵函式

| 函式 | 職責 |
|------|------|
| `findMatchingSkills()` | 收集所有匹配技能（keyword + pattern 全部收集，always 僅在無其他匹配時） |
| `sortSkillsForChaining()` | 排序：有工具（API/MCP）的先跑，prompt-only 後跑 |
| `executeSkillChain()` | Pipeline 主邏輯，單一技能時等同 `executeSkill()` |
| `findMatchingSkill()` | 向下相容，回傳第一個匹配（供 scheduler 使用） |

### System Prompt 注入規則

- **有工具的技能**：指示 AI 必須使用工具取得真實數據
- **prompt-only + 有前置資料**：指示 AI 基於前置技能的真實資料完成任務
- **prompt-only + 無前置資料**：指示 AI 誠實告知無法取得即時資料

## Skill 匯入要點

### GitHub URL 匯入流程

1. 用戶在 LINE/Telegram 傳送 GitHub URL + 安裝意圖
2. 解析 URL → fetch `SKILL.md`（raw.githubusercontent.com）
3. 解析 YAML frontmatter + Markdown body
4. AI 轉換為 MyClaw JSON 格式（判斷觸發類型、翻譯中文、提取 prompt）
5. 安全檢查（prompt 注入模式掃描、長度限制）
6. 用戶預覽確認後儲存

### 支援的外部格式

- Anthropic Agent Skills (SKILL.md + YAML frontmatter) — 5,700+ 社群 skills
- OpenAI Codex Skills (相同 SKILL.md 格式)
- MyClaw 原生 JSON (skill.json)

### 安全原則

- Skills 是「prompt-only」設計，不執行任何外部程式碼
- 匯入時掃描危險關鍵字（prompt injection 模式）
- System Prompt 優先權保護（系統指令 > 技能 prompt > 用戶輸入）
- 限制 prompt 長度上限（10000 字元）
- 保留 source URL 供追溯
