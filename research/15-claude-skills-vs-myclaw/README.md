# Claude Code Agent Skills vs MyClaw 技能系統研究

> 研究日期：2026-02-08
> 研究目的：深入對比 Claude Code 的 Agent Skills 機制與 MyClaw 技能系統的設計差異，找出 MyClaw 可借鏡之處

## 一、Claude Code Agent Skills 機制

### 1.1 .claude 資料夾結構

Claude Code 使用 `.claude/` 資料夾作為專案級配置中心：

```
.claude/
├── settings.json          # 專案共享設定（環境變數、實驗性功能）
├── settings.local.json    # 本地設定（權限、工具白名單）
├── skills/                # 技能目錄
│   └── <skill-name>/
│       ├── SKILL.md       # 技能入口（必要）
│       ├── scripts/       # 可執行腳本
│       ├── references/    # 參考文件
│       └── assets/        # 靜態資源
├── commands/              # 斜線指令（已合併至 skills）
└── agents/                # 子代理定義
```

技能存放位置決定其作用範圍：

| 層級 | 路徑 | 適用範圍 |
|------|------|---------|
| Enterprise | 由組織管理設定部署 | 組織內所有使用者 |
| Personal | `~/.claude/skills/<name>/SKILL.md` | 使用者所有專案 |
| Project | `.claude/skills/<name>/SKILL.md` | 僅此專案 |
| Plugin | `<plugin>/skills/<name>/SKILL.md` | 啟用 plugin 的專案 |

同名技能的優先權：Enterprise > Personal > Project。

MyClaw 專案本身的 `.claude/` 設定很精簡：
- `settings.json`：啟用 Agent Teams 實驗功能
- `settings.local.json`：定義權限白名單（WebSearch、特定網域 WebFetch、git 操作等）

### 1.2 CLAUDE.md 的角色

CLAUDE.md 是 Claude Code 的「持久記憶」機制，類似於 MyClaw 的 `users.memory_md` 欄位：

| 面向 | CLAUDE.md | MyClaw memory_md |
|------|-----------|-------------------|
| 儲存位置 | 檔案系統（.md 檔案） | SQLite 資料庫欄位 |
| 作用方式 | 注入 system prompt | 注入 system prompt |
| 更新機制 | 手動編輯或 AI 自動更新 | AI 對話後自動更新 |
| 格式 | Markdown | Markdown |
| 內容範圍 | 專案規範、架構說明、開發指引 | 個人偏好、備忘、習慣 |

CLAUDE.md 在 Claude Code 中的角色是**專案級知識庫**，而 MyClaw 的 memory_md 是**個人級記憶**。

### 1.3 Agent Skills 格式與規範

Agent Skills 遵循 [agentskills.io](https://agentskills.io/specification) 開放標準，OpenAI Codex CLI 也已採用同一格式。

#### SKILL.md 結構

```yaml
---
# 必要欄位
name: skill-name          # 1-64 字元，僅限小寫字母+連字號
description: 描述文字      # 1-1024 字元，說明功能與觸發時機

# 選填欄位
license: Apache-2.0
compatibility: "Requires git, docker"
allowed-tools: "Bash(git:*) Read"
metadata:
  author: example-org
  version: "1.0"

# Claude Code 擴展欄位
disable-model-invocation: false   # true = 僅手動觸發
user-invocable: true              # false = 僅 AI 自動觸發
context: fork                     # 在子代理中執行
agent: Explore                    # 指定子代理類型
model: claude-sonnet-4-5          # 指定模型
argument-hint: "[issue-number]"   # 自動補全提示
---

# 技能指令（Markdown 格式）

任意 Markdown 內容，描述 AI 應如何執行此技能...
```

#### 命名規則

- 僅限 Unicode 小寫字母、數字和連字號
- 不能以連字號開頭或結尾
- 不能包含連續連字號（`--`）
- 必須與父資料夾名稱一致

### 1.4 技能的發現、載入與執行

Claude Code 使用**三層漸進式揭露**（Progressive Disclosure）機制：

```
第一層：Metadata（~100 tokens）
├── 啟動時載入所有技能的 name + description
├── 佔上下文窗口的 2%（動態計算）
└── 讓 AI 知道有哪些技能可用

第二層：Instructions（< 5000 tokens 建議）
├── 當 AI 判斷技能相關時，載入完整 SKILL.md
└── 或使用者手動 /skill-name 觸發

第三層：Resources（按需載入）
├── scripts/、references/、assets/ 中的檔案
└── 僅在技能執行過程中需要時才載入
```

**觸發方式**有兩種：

1. **AI 自動觸發**：Claude 根據 description 判斷是否相關，自動載入技能
2. **使用者手動觸發**：輸入 `/skill-name` 直接調用

**控制矩陣**：

| 設定 | 使用者可觸發 | AI 可觸發 | 何時載入上下文 |
|------|-------------|----------|---------------|
| 預設 | 是 | 是 | description 常駐，技能內容觸發時載入 |
| `disable-model-invocation: true` | 是 | 否 | description 不載入，僅使用者觸發時載入 |
| `user-invocable: false` | 否 | 是 | description 常駐，AI 觸發時載入 |

**動態上下文注入**：支援 `` !`command` `` 語法，在技能內容發送給 AI 前先執行 shell 指令，將輸出嵌入 prompt。

**子代理執行**：設定 `context: fork` 可在隔離的子代理中執行技能，不會影響主對話上下文。

**字串替換**：支援 `$ARGUMENTS`、`$ARGUMENTS[N]`、`$N`、`${CLAUDE_SESSION_ID}` 等動態變數。

### 1.5 社群生態系統

- **官方倉庫**：[github.com/anthropics/skills](https://github.com/anthropics/skills) — 65.6k stars，6.5k forks
- **開放標準**：[agentskills.io](https://agentskills.io) — 跨平台規範（Claude Code + OpenAI Codex CLI + ChatGPT）
- **技能市場**：[skillsmp.com](https://skillsmp.com) — 第三方技能市場
- **安裝方式**：
  - Claude Code plugin：`/plugin marketplace add anthropics/skills`
  - 手動複製到 `~/.claude/skills/` 或 `.claude/skills/`
- **官方分類**：
  - Creative & Design
  - Development & Technical
  - Enterprise & Communication
  - Document Skills（docx、pdf、pptx、xlsx）

---

## 二、MyClaw 技能系統實作

### 2.1 技能儲存（SQLite）

MyClaw 使用 SQLite 資料庫儲存技能，schema 定義於 `src/db.ts`：

```sql
skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,           -- 所屬使用者
  name TEXT NOT NULL,                 -- 技能名稱（繁體中文）
  description TEXT DEFAULT '',        -- 功能描述
  trigger_type TEXT NOT NULL,         -- 觸發類型
  trigger_value TEXT DEFAULT '',      -- 觸發值
  prompt TEXT NOT NULL,               -- AI 執行指令
  tools TEXT DEFAULT '[]',            -- 可用工具（JSON array）
  enabled INTEGER DEFAULT 1,          -- 啟用/停用
  source_type TEXT DEFAULT 'user_created',  -- 來源類型
  source_url TEXT DEFAULT '',         -- 匯入來源 URL
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
)
```

技能型別定義於 `src/config.ts`：

```typescript
type TriggerType = 'keyword' | 'pattern' | 'cron' | 'manual' | 'always';
type SourceType = 'user_created' | 'github_import' | 'catalog' | 'shared';

interface Skill {
  id: number;
  user_id: number;
  name: string;
  description: string;
  trigger_type: TriggerType;
  trigger_value: string;
  prompt: string;
  tools: string;       // JSON array string
  enabled: number;     // SQLite boolean
  source_type: SourceType;
  source_url: string;
  created_at: string;
}
```

CRUD 操作：`createSkill()`、`getUserSkills()`、`getEnabledSkills()`、`toggleSkill()`、`deleteSkill()`。

### 2.2 技能建立（自然語言 → JSON）

MyClaw 的核心創新在於**透過 LLM Tool Calling 將自然語言轉換為結構化技能配置**（`src/skill-manager.ts`）。

流程：

```
使用者自然語言 → LLM (with create_skill tool) → Tool Call 結構化輸出 → 驗證 → 存入 DB
```

關鍵設計：

1. **Tool Calling Schema**：定義 `create_skill` 工具，包含 name、description、trigger（type+value）、prompt、tools 等欄位
2. **System Prompt 引導**：提供觸發類型判斷規則和 cron 表達式範例
3. **智能意圖偵測**：如果 AI 沒有呼叫 create_skill 工具，表示使用者不是在建立技能
4. **管理指令偵測**：透過關鍵字匹配偵測「我的技能」「停用」「啟用」「刪除技能」等管理意圖

### 2.3 技能觸發機制

觸發邏輯定義於 `src/skill-executor.ts`，使用**優先級匹配**：

```
訊息進入 → 逐一比對已啟用技能
├── 優先級 1：keyword — 訊息包含觸發關鍵字
├── 優先級 2：pattern — 訊息符合正則表達式
├── 優先級 3：always  — 永遠匹配（最低優先級）
└── manual / cron — 不由訊息觸發
```

匹配邏輯：
- `keyword`：`text.includes(skill.trigger_value)`
- `pattern`：`new RegExp(skill.trigger_value, 'i').test(text)`
- `always`：所有訊息都匹配
- `cron`：由 `src/scheduler.ts` 的 node-cron 排程觸發

### 2.4 技能執行流程

`executeSkill()` 的完整流程：

```
1. 載入使用者記憶（getUserMemory）
2. 組合 System Prompt：
   ├── 「你正在執行技能『{name}』」
   ├── ## 技能指令 → skill.prompt
   ├── ## 使用者記憶 → memory_md
   └── ## 注意事項 → 繁體中文、簡潔、不提及技能
3. 解析技能可用工具（parseSkillTools）
4. 呼叫 chat() 取得 AI 回應
5. 回傳回應文字
```

目前 `parseSkillTools()` 回傳空陣列，內建工具系統尚未實作。

### 2.5 技能匯入（GitHub URL）

MyClaw 支援從 GitHub 匯入 Agent Skills 格式的技能（`src/skill-importer.ts`）。

完整流程：

```
1. 偵測匯入意圖（GitHub URL + 安裝關鍵字）
2. 解析 GitHub URL → owner/repo/branch/path
3. Fetch SKILL.md（嘗試 SKILL.md → skill.md → README.md）
4. gray-matter 解析 YAML frontmatter + Markdown body
5. AI 格式轉換（convert_skill Tool Calling）：
   ├── 翻譯為繁體中文
   ├── 智能判斷觸發類型
   └── 適配 LINE 對話情境
6. 安全檢查：
   ├── Prompt injection 模式掃描（16 種危險模式）
   ├── Prompt 長度限制（5000 字元）
   └── 程式碼區塊數量檢查
7. 回傳結果（附帶警告訊息）
```

安全模式掃描的危險關鍵字包括：`ignore previous instructions`、`forget system prompt`、`override system`、`execute command`、`eval(`、`require(`、`process.env`、`child_process` 等。

---

## 三、對比分析

### 3.1 架構比較表

| 面向 | Claude Code Agent Skills | MyClaw 技能系統 |
|------|-------------------------|----------------|
| **儲存方式** | 檔案系統（.claude/skills/） | SQLite 資料庫 |
| **技能格式** | SKILL.md + YAML frontmatter | JSON（DB rows） |
| **技能內容** | Markdown 指令 + 腳本 + 參考文件 | 純 prompt 文字 |
| **觸發機制** | AI 語義判斷 + 手動 /command | keyword / pattern / cron / always |
| **執行方式** | 注入 context 或子代理 fork | 組合 system prompt + chat() |
| **記憶系統** | CLAUDE.md（專案級） | memory_md（使用者級） |
| **多檔案支援** | 是（scripts/、references/、assets/） | 否（單一 prompt 欄位） |
| **動態上下文** | `` !`command` `` shell 預處理 | 無 |
| **變數替換** | $ARGUMENTS、$N、$SESSION_ID | 無 |
| **權限控制** | allowed-tools、disable-model-invocation | enabled 開關 |
| **生態系統** | 開放標準（65.6k stars）+ 跨平台 | 個人化建立 + GitHub 匯入 |
| **安全模型** | 沙箱 + 權限系統 + 工具白名單 | prompt-only + 注入掃描 |
| **使用者介面** | CLI（/command） | LINE 對話 |
| **技能建立** | 手動撰寫 SKILL.md | 自然語言 → AI → JSON |

### 3.2 各面向詳細對比

#### 1. 技能儲存方式：檔案系統 vs SQLite

**Claude Code**：技能是資料夾，包含 SKILL.md 和支援檔案。這讓技能可以版本控制（git）、跨專案分享（~/.claude/skills/）、透過 plugin 機制安裝。

**MyClaw**：技能是資料庫中的一行。這讓技能可以按使用者隔離、快速查詢、透過 API 動態建立和管理，且不需要檔案系統存取權限。

**分析**：兩種方式各有適用場景。Claude Code 面向開發者，檔案系統更自然；MyClaw 面向一般使用者，資料庫更適合多用戶的 SaaS 場景。

#### 2. 技能定義格式：SKILL.md vs JSON

**Claude Code**：使用 YAML frontmatter（機器可讀的 metadata）+ Markdown body（人可讀的指令）。這種格式的優勢是可讀性高，且 AI 本身擅長理解 Markdown。

**MyClaw**：使用結構化的資料庫欄位。trigger_type、trigger_value 是明確的類別欄位，prompt 是純文字。這種格式的優勢是查詢效率高、欄位強型別。

**分析**：MyClaw 的結構化設計更適合程式化處理（如 cron 排程、keyword 匹配），但失去了 SKILL.md 的彈性和可擴展性。

#### 3. 技能發現機制：語義理解 vs 規則匹配

**Claude Code**：啟動時將所有技能的 description 載入上下文，AI 根據語義判斷何時使用哪個技能。這是一種**語義發現**機制。

**MyClaw**：使用 `findMatchingSkill()` 進行規則匹配（keyword 包含、regex 匹配、always）。這是一種**規則發現**機制。

**分析**：語義發現更智能但消耗更多 tokens；規則發現更精確但較不靈活。MyClaw 的規則方式適合 LINE 對話的即時性需求（低延遲），而 Claude Code 有更多上下文空間進行語義判斷。

#### 4. 技能觸發方式：AI 自動判斷 vs 明確規則

**Claude Code**：
- AI 自動觸發：根據 description 語義判斷
- 使用者手動：`/skill-name`
- 可設定 `disable-model-invocation` 控制

**MyClaw**：
- keyword：訊息包含指定關鍵字
- pattern：正則表達式匹配
- cron：定時排程（node-cron）
- always：每次對話都執行
- manual：僅手動觸發

**分析**：MyClaw 的 cron 觸發是 Claude Code 不具備的功能（Claude Code 需要使用者主動開啟會話）。但 Claude Code 的語義觸發更適合處理模糊意圖。

#### 5. 技能執行方式：漸進式載入 vs 直接注入

**Claude Code**：
1. 僅 description 常駐（~100 tokens/skill）
2. 觸發時才載入完整 SKILL.md
3. 執行中按需載入 references/scripts
4. 可選子代理隔離（`context: fork`）

**MyClaw**：
1. 匹配到技能後直接將 `skill.prompt` 注入 system prompt
2. 加上使用者記憶（memory_md）
3. 單次 chat() 呼叫取得結果

**分析**：Claude Code 的漸進式載入在大量技能場景下更高效（避免 token 浪費）。MyClaw 的直接注入更簡單直接，適合技能數量有限（MAX_SKILLS_PER_USER = 20）的場景。

#### 6. 生態系統：開放社群 vs 個人化建立

**Claude Code**：
- 開放標準（agentskills.io），跨平台支援
- 官方倉庫 65.6k stars
- Plugin 市場安裝機制
- 社群貢獻 + 企業級技能
- OpenAI Codex 也採用同一標準

**MyClaw**：
- 使用者自然語言建立
- GitHub URL 匯入（相容 Agent Skills 格式）
- 內建預設技能目錄（6 個推薦技能）
- 以個人使用者為中心

**分析**：MyClaw 的「自然語言建立技能」是獨特優勢，降低了技能建立的門檻。而 GitHub 匯入功能讓 MyClaw 能間接利用整個 Agent Skills 生態。

#### 7. 安全模型

**Claude Code**：
- 權限系統：`settings.json` 定義工具白名單
- `allowed-tools`：技能級別的工具限制
- 子代理隔離：`context: fork` 隔離執行
- 企業管理設定：組織級安全策略
- 建議：僅安裝信任來源的技能

**MyClaw**：
- **Prompt-only 設計**：技能不執行任何外部程式碼
- **注入掃描**：16 種 prompt injection 危險模式
- **長度限制**：prompt 上限 5000 字元
- **System Prompt 優先權**：系統指令 > 技能 prompt > 用戶輸入
- **來源追溯**：保留 source_url

**分析**：MyClaw 的「prompt-only」設計是天然的安全屏障 — 技能只能影響 AI 的回應，不能執行系統指令。Claude Code 因為支援 scripts/ 和 Bash 工具，需要更複雜的權限系統。

### 3.3 MyClaw 的設計優勢

1. **零門檻技能建立**：使用者用自然語言描述需求，AI 自動生成技能配置，無需了解 YAML 或 Markdown 格式

2. **Cron 排程觸發**：支援定時執行技能（「每天早上 8 點提醒我喝水」），這是 Claude Code 不具備的功能

3. **個人化記憶整合**：每個使用者有獨立的 memory_md，技能執行時自動注入，實現跨技能的個人化

4. **LINE 對話即介面**：不需要額外的 CLI 或 IDE，一切在 LINE 中完成

5. **Prompt-only 安全模型**：技能不能執行程式碼，天然免疫代碼注入攻擊

6. **多 LLM Provider 支援**：自動偵測 API Key，支援 Claude-only、Groq-only、混合模式

7. **GitHub 匯入橋接**：能直接匯入 Agent Skills 生態的技能，並自動翻譯為繁體中文

### 3.4 MyClaw 的限制與改進方向

1. **無多檔案支援**：技能只有一個 prompt 欄位，無法像 Claude Code 那樣引用腳本、範本和參考文件

2. **無漸進式載入**：所有匹配到的技能 prompt 直接注入，沒有 description 預覽層。當技能數量增多時可能浪費 tokens

3. **觸發機制較僵化**：keyword/pattern 是精確匹配，缺少 Claude Code 的語義理解能力。使用者說「幫我翻成英文」可能匹配不到 trigger_value 為「翻譯」的技能

4. **無變數替換**：不支援 `$ARGUMENTS` 等動態變數，技能的彈性較低

5. **無執行隔離**：所有技能在同一個 chat() 呼叫中執行，沒有子代理或 fork 機制

6. **技能數量限制**：每個使用者最多 20 個技能（MAX_SKILLS_PER_USER = 20），而 Claude Code 理論上無限制

7. **內建工具未實作**：`parseSkillTools()` 目前回傳空陣列，技能無法使用 web_search、get_weather 等工具

---

## 四、結論

### 4.1 MyClaw 技能系統定位

MyClaw 的技能系統定位為**「對話式個人助理的 prompt 管理層」**，而非 Claude Code 的**「開發者工具的擴展機制」**。

兩者服務的使用者群體和場景截然不同：

| 維度 | Claude Code | MyClaw |
|------|------------|--------|
| 目標使用者 | 開發者 | 一般 LINE 使用者 |
| 使用環境 | 終端機 / IDE | LINE 對話介面 |
| 技能複雜度 | 高（多檔案、腳本、子代理） | 低（單一 prompt） |
| 技能建立方式 | 手寫 SKILL.md | 自然語言對話 |
| 核心價值 | 擴展 AI 的工具能力 | 個人化 AI 助理行為 |

MyClaw 不需要也不應該完全複製 Claude Code 的技能系統。其核心競爭力在於**「讓不懂技術的人也能定製 AI 助理」**。

### 4.2 可借鏡的 Claude Code 設計

1. **漸進式載入**：只將技能 description 載入初始 prompt，觸發時才載入完整 prompt。這可以讓 MyClaw 支援更多技能而不浪費 tokens

2. **語義觸發作為補充**：在現有 keyword/pattern 匹配失敗時，可以用 AI 語義判斷作為 fallback。成本稍高但體驗更好

3. **技能元資料標準化**：採用 Agent Skills 開放標準的 `name` + `description` 格式，有助於與更大的生態系統互通

4. **支援檔案引用**：允許技能 prompt 中引用外部知識（如 `## 參考：[weather-api.md]`），在需要時動態載入

5. **執行隔離概念**：對於複雜技能（如同時使用多個工具的技能），考慮將其隔離在獨立的 chat 會話中，避免污染主對話

### 4.3 建議的改進方向

**短期（低成本、高價值）**：

1. **語義 fallback 觸發**：當 keyword/pattern 都不匹配時，將使用者訊息 + 所有技能的 name+description 一起傳給 AI，讓 AI 判斷是否應觸發某個技能
2. **技能 description 預載入**：將所有啟用技能的 description 加入一般對話的 system prompt，讓 AI 知道使用者有哪些技能可用
3. **變數替換**：支援 `{user_message}`、`{user_name}`、`{current_time}` 等基本變數，增加技能彈性

**中期（適度改動）**：

4. **技能模板系統**：預設一批高品質技能模板，使用者一鍵啟用
5. **匯入時保留原始 SKILL.md**：在 skills 表增加 `raw_content` 欄位，保留匯入技能的原始內容，方便除錯和更新
6. **實作內建工具**：完成 `parseSkillTools()` 的 web_search、get_weather 等內建工具映射

**長期（架構級改動）**：

7. **多 prompt 段落**：允許技能定義多個 prompt 段落（如 `pre_prompt`、`main_prompt`、`post_prompt`），類似 Claude Code 的 SKILL.md + references/
8. **技能市集**：建立 MyClaw 專屬的技能分享平台，使用者可以一鍵安裝其他人分享的技能
9. **技能組合**：允許技能引用其他技能（技能鏈），實現更複雜的工作流程
