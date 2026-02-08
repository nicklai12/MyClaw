# 獨立專案 + Agent Teams 並行開發工作流

## 問題

將 `research/` 資料夾複製到其他空白專案，再開始使用 agent teams 並行開發，是否可行？

## 結論：完全可行，而且是更好的做法

---

## 1. 為什麼應該分開專案

| 理由 | 說明 |
|------|------|
| 乾淨的 git history | 新專案從零開始，不帶 NanoClaw 的歷史包袱 |
| 獨立的 dependencies | `package.json` 只包含 LINE bot 需要的套件 |
| Agent 不會被干擾 | NanoClaw 有 2000+ 行代碼，agent 不會誤讀或誤改 |
| CLAUDE.md 可以重寫 | 針對新專案寫全新的開發指引 |

## 2. 具體做法

```
1. 建立新專案資料夾 (例如 C:\Project\line-assistant)
2. git init
3. 複製 research/ 資料夾過去
4. 建立新的 CLAUDE.md（引用 research/PLAN.md 作為規格書）
5. 用 agent teams 並行開發
```

## 3. Agent Teams 並行分工建議

```
Team Lead (主 Claude session)
├── Agent A: Express + LINE Webhook + 健康檢查
├── Agent B: Groq API 整合 + 對話邏輯
├── Agent C: SQLite schema + 使用者記憶系統
└── Agent D: 技能系統 (建立 + 觸發 + 執行)
```

每個 agent 都能讀 `research/` 裡的文件來了解需求和架構決策。

## 4. 注意事項

- 新專案的 `CLAUDE.md` 要寫清楚目錄結構和開發規範，agent 才能協作不衝突
- 多個 agent 同時寫不同檔案沒問題，但避免讓兩個 agent 同時改同一個檔案
- 建議在 `CLAUDE.md` 中明確指出 `research/PLAN.md` 是需求規格書

## 5. 新專案建議的初始結構

```
line-assistant/
├── CLAUDE.md                 ← 開發指引（引用 research/PLAN.md）
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── src/
│   ├── index.ts              ← Express + LINE Webhook
│   ├── config.ts             ← 環境變數 + 常數
│   ├── llm.ts                ← Groq API + Claude fallback
│   ├── db.ts                 ← SQLite (better-sqlite3)
│   ├── memory.ts             ← 使用者記憶系統
│   ├── skill-manager.ts      ← 技能建立 + 管理
│   ├── skill-executor.ts     ← 技能觸發 + 執行
│   └── scheduler.ts          ← node-cron 排程
├── research/                 ← 從 NanoClaw 複製過來
│   ├── PLAN.md
│   ├── 01-architecture-analysis/
│   ├── 02-line-api-feasibility/
│   ├── ...
│   └── 11-separate-project-workflow/
├── .devcontainer/
│   └── devcontainer.json     ← Codespace 設定
├── Dockerfile
└── docker-compose.yml
```
