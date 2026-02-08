# LINE AI Assistant

基於 NanoClaw 架構簡化而來的 LINE 個人 AI 助理。使用者透過 LINE 對話建立專屬技能，AI 自動客製化為貼身助理。

## 需求規格書

完整研究與計畫請見 [research/PLAN.md](research/PLAN.md)，所有架構決策都記錄在 `research/` 資料夾中。

## 架構

```
LINE ─→ Express.js (Webhook) ─→ Groq API (Qwen3 32B, 免費主力)
                                 ↘ Claude API (複雜任務 fallback)
SQLite (better-sqlite3) + node-cron
~800 行代碼，8 個源碼檔案
```

## 目錄結構

```
src/
├── index.ts              # Express 伺服器 + LINE Webhook 處理
├── config.ts             # 環境變數 + 常數
├── llm.ts                # Groq API + Claude fallback 整合
├── db.ts                 # SQLite schema + CRUD 操作
├── memory.ts             # 使用者記憶系統 (讀/寫/更新)
├── skill-manager.ts      # 技能建立 + 管理 (自然語言 → JSON)
├── skill-executor.ts     # 技能觸發判斷 + 執行
└── scheduler.ts          # node-cron 排程任務
```

## 關鍵檔案職責

| 檔案 | 職責 | 依賴 |
|------|------|------|
| `index.ts` | HTTP 伺服器、LINE Webhook 接收與回覆、訊息路由 | config, llm, db, skill-executor |
| `config.ts` | `process.env` 讀取、常數定義、型別匯出 | 無 |
| `llm.ts` | Groq/Claude API 呼叫、Tool Calling 處理、錯誤重試 | config |
| `db.ts` | SQLite 初始化、表建立、users/skills/messages CRUD | config |
| `memory.ts` | 使用者記憶的 Markdown 格式管理、上下文注入 | db |
| `skill-manager.ts` | 解析自然語言意圖、生成技能 JSON、CRUD 技能 | llm, db |
| `skill-executor.ts` | 關鍵字/模式/cron 觸發判斷、執行技能 prompt | llm, db, memory |
| `scheduler.ts` | node-cron 排程、定時技能觸發、任務日誌 | db, skill-executor |

## 技術棧

| 元件 | 選擇 | 版本 |
|------|------|------|
| Runtime | Node.js | 20+ |
| HTTP | Express.js | 4.x |
| LINE SDK | @line/bot-sdk | 最新 |
| AI (主力) | Groq API (Qwen3 32B) | - |
| AI (fallback) | Claude API | - |
| 資料庫 | better-sqlite3 | 最新 |
| 排程 | node-cron | 最新 |
| 語言 | TypeScript | 5.x |

## 環境變數

```env
# 必要
LINE_CHANNEL_ACCESS_TOKEN=   # LINE Messaging API token
LINE_CHANNEL_SECRET=         # LINE channel secret
GROQ_API_KEY=                # Groq API key (免費)

# 選填
ANTHROPIC_API_KEY=           # Claude API (fallback)
PORT=3000                    # HTTP port
NODE_ENV=development         # development | production
```

## 開發指令

```bash
npm install          # 安裝依賴
npm run dev          # 開發模式 (ts-node + 熱重載)
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
users (id, line_user_id, display_name, memory_md, created_at, updated_at)

-- 技能
skills (id, user_id, name, trigger_type, trigger_value, prompt, enabled, created_at)
  -- trigger_type: 'keyword' | 'pattern' | 'cron' | 'manual'

-- 對話紀錄
messages (id, user_id, role, content, created_at)

-- 排程任務
scheduled_tasks (id, skill_id, user_id, cron_expression, next_run, last_run, enabled)
```

## Groq API 使用要點

- Model ID: `qwen/qwen3-32b`
- 使用 OpenAI 兼容格式 (openai SDK 或 fetch)
- Tool Calling 用於技能建立 (function schema 強制 JSON 格式)
- 免費額度：RPM 30, RPD 14400
- 加 `/no_think` 到 user prompt 可關閉思考模式以加速回應

## LINE Webhook 要點

- 驗證 signature (x-line-signature header)
- Reply Token 只能用一次且有時效
- Reply Message 免費，Push Message 有限額
- Webhook 須回應 HTTP 200，處理邏輯異步進行
