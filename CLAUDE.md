# LINE AI Assistant

基於 NanoClaw 架構簡化而來的 LINE 個人 AI 助理。使用者透過 LINE 對話建立專屬技能，AI 自動客製化為貼身助理。

## 需求規格書

完整研究與計畫請見 [research/PLAN.md](research/PLAN.md)，所有架構決策都記錄在 `research/` 資料夾中。

## 架構

```
LINE ─→ Express.js (Webhook) ─→ LLM Provider (自動偵測模式)
                                 ├── Claude-only：只有 ANTHROPIC_API_KEY
                                 │    └── 80% Haiku 4.5 + 20% Sonnet 4.5
                                 ├── Groq-only：只有 GROQ_API_KEY
                                 │    └── Qwen3 32B (免費)
                                 └── 混合模式：兩者皆有
                                      └── 簡單→Groq, 複雜→Claude
SQLite (better-sqlite3) + node-cron
11 個源碼檔案
```

## 目錄結構

```
src/
├── index.ts              # Express 伺服器 + LINE Webhook 處理
├── config.ts             # 環境變數 + 常數 + 模型註冊表
├── llm.ts                # LLM Provider Pattern (Claude-only / Groq-only / 混合)
├── db.ts                 # SQLite schema + CRUD 操作
├── memory.ts             # 使用者記憶系統 (讀/寫/更新)
├── skill-manager.ts      # 技能建立 + 管理 (自然語言 → JSON)
├── skill-importer.ts     # GitHub URL 匯入 + 公開技能目錄瀏覽 + AI 提取 api_config
├── skill-executor.ts     # 技能觸發判斷 + 動態工具呼叫執行
├── dynamic-tool-builder.ts # 從 ApiConfig 動態建立 ToolDefinition[]
├── http-executor.ts      # 通用 HTTP 執行器 + bearer token 快取
└── scheduler.ts          # node-cron 排程任務
```

## 關鍵檔案職責

| 檔案 | 職責 | 依賴 |
|------|------|------|
| `index.ts` | HTTP 伺服器、LINE Webhook 接收與回覆、訊息路由 | config, llm, db, skill-executor |
| `config.ts` | `process.env` 讀取、常數定義、型別匯出、模型註冊表（白名單驗證） | 無 |
| `llm.ts` | Provider Pattern：自動偵測 API Key 決定模式、Tool Calling、Structured Output、錯誤重試 | config |
| `db.ts` | SQLite 初始化、表建立、users/skills/messages CRUD、credentials 欄位 | config |
| `memory.ts` | 使用者記憶的 Markdown 格式管理、上下文注入 | db |
| `skill-manager.ts` | 解析自然語言意圖、生成技能 JSON、CRUD 技能 | llm, db |
| `skill-importer.ts` | 解析 GitHub URL、fetch SKILL.md、AI 格式轉換、安全檢查、技能目錄瀏覽、AI 提取 api_config | llm, db, skill-manager |
| `skill-executor.ts` | 關鍵字/模式/cron 觸發判斷、動態工具呼叫迴圈（max 5 次）、執行技能 prompt | llm, db, memory, dynamic-tool-builder, http-executor |
| `dynamic-tool-builder.ts` | 從 ApiConfig 動態建立 ToolDefinition[]（api_call 通用工具） | config |
| `http-executor.ts` | 通用 HTTP 執行器、bearer token 自動登入與快取、api_key 注入 | config, db |
| `scheduler.ts` | node-cron 排程、定時技能觸發、任務日誌 | db, skill-executor |

## 技術棧

| 元件 | 選擇 | 版本 |
|------|------|------|
| Runtime | Node.js | 20+ |
| HTTP | Express.js | 4.x |
| LINE SDK | @line/bot-sdk | 最新 |
| AI (模式A) | Groq API (Qwen3 32B) | 免費主力 |
| AI (模式B) | Claude API (Haiku 4.5 + Sonnet 4.5) | 付費但品質更優 |
| AI (模式C) | 混合模式 (Groq + Claude) | 最佳 CP 值 |
| 資料庫 | better-sqlite3 | 最新 |
| 排程 | node-cron | 最新 |
| 語言 | TypeScript | 5.x |

## 環境變數

```env
# 必要
LINE_CHANNEL_ACCESS_TOKEN=   # LINE Messaging API token
LINE_CHANNEL_SECRET=         # LINE channel secret

# AI API Key（至少填一個）
ANTHROPIC_API_KEY=           # Claude API — 填此 key 即啟用 Claude-only 或混合模式
GROQ_API_KEY=                # Groq API (免費) — 填此 key 即啟用 Groq-only 或混合模式
# 兩個都填 → 混合模式（簡單→Groq, 複雜→Claude）
# 都不填 → 啟動失敗

# 選填
CLAUDE_DEFAULT_MODEL=claude-haiku-4-5-20250501    # Claude 主力模型
CLAUDE_COMPLEX_MODEL=claude-sonnet-4-5-20250514   # Claude 複雜任務模型
GROQ_MODEL=qwen/qwen3-32b                        # Groq 模型
PORT=3000                    # HTTP port
NODE_ENV=development         # development | production
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
users (id, line_user_id, display_name, memory_md, credentials, created_at, updated_at)
-- credentials: JSON，按服務名稱儲存認證資訊，例如 {"erp": {"username": "...", "password": "..."}}

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
- 建議設定 `max_tokens: 1024` 避免冗長回覆
- 回應速度比 Groq 慢 3-5 倍，超過 5 秒的任務建議先回「思考中...」

### Provider 自動偵測邏輯

```
啟動時檢查環境變數：
├── 只有 ANTHROPIC_API_KEY    → claude-only 模式
├── 只有 GROQ_API_KEY         → groq-only 模式
├── 兩者皆有                   → hybrid 混合模式
└── 都沒有                     → 啟動失敗，提示使用者
```

## Skill 匯入要點

### GitHub URL 匯入流程

1. 用戶在 LINE 傳送 GitHub URL + 安裝意圖
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

## LINE Webhook 要點

- 驗證 signature (x-line-signature header)
- Reply Token 只能用一次且有時效
- Reply Message 免費，Push Message 有限額
- Webhook 須回應 HTTP 200，處理邏輯異步進行
- Claude-only 模式下回應較慢，建議實作「處理中...」即時回覆 + Push Message 發送結果
