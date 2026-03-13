# Supabase MCP 整合影響評估報告

## 1. 執行摘要

本報告評估將 Supabase MCP Server 整合到 MyClaw 所需的程式碼改動幅度，提供兩種實施方案：

| 方案 | 改動範圍 | 複雜度 | 適用場景 |
|------|----------|--------|----------|
| **最小改動** | 新增 MCP 工具 | 低 (~30 行) | 僅需 AI 通過 MCP 操作 Supabase |
| **完整遷移** | 替換 SQLite 為 Supabase | 高 (~500+ 行) | 需要雲端持久化、多實例部署 |

---

## 2. 現有架構分析

### 2.1 資料庫架構 (`src/db.ts`)

當前使用 **SQLite** (better-sqlite3) 作為本地資料庫，包含 5 個表：

| 表名 | 用途 | 記錄數預估 |
|------|------|-----------|
| `users` | 使用者資訊、記憶、憑證 | 1 使用者 = 1 行 |
| `skills` | 使用者技能設定 | 每使用者最多 20 個 |
| `messages` | 對話歷史 | 無上限 |
| `scheduled_tasks` | 定時任務 | 每 skill 0-1 個 |
| `code_snippets` | 程式碼片段儲存 | 使用者自訂 |

**關鍵特性：**
- WAL 模式支援並發讀寫
- JSON 欄位儲存複雜資料 (`credentials`, `api_config`, `tools`)
- 所有 CRUD 操作使用同步 API (`db.prepare().run()` / `.get()` / `.all()`)

### 2.2 資料流分析

```
┌─────────────────────────────────────────────────────────────┐
│                        MyClaw 資料流                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Webhook → Channel → index.ts → skill-executor.ts           │
│                                       ↓                     │
│                              ┌─────────────────┐             │
│                              │  技能匹配/執行   │             │
│                              └────────┬────────┘             │
│                                       ↓                     │
│  ┌──────────────┬─────────────────────┼─────────────────┐   │
│  ↓              ↓                     ↓                 ↓   │
│ memory.ts   db.ts (SQLite)    http-executor.ts    mcp-client │
│  (使用者記憶)   (CRUD操作)          (外部API)          (MCP)   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 skill-executor.ts 依賴分析

```typescript
// skill-executor.ts 依賴的資料庫函數
import { getUserCredentials } from './db';  // 第 10 行

// 使用場景 (第 200-201 行):
const creds = getUserCredentials(userId, credentialService);
```

**結論：** skill-executor 僅通過 `getUserCredentials` 與資料庫交互，其餘資料通過參數傳入。

---

## 3. 方案一：最小改動方案

### 3.1 方案概述

將 Supabase MCP Server 作為可選工具加入，**保留現有 SQLite 架構不變**。

**使用場景：**
- 使用者希望 AI 能直接操作 Supabase 資料庫
- 需要跨系統資料共享
- 雲端資料備份/同步需求

### 3.2 實作方式

通過 MCP_SERVERS 環境變數設定 Supabase MCP：

```env
MCP_SERVERS='[{
  "name": "supabase",
  "transport": {
    "type": "streamable-http",
    "url": "https://mcp.supabase.io/v1/servers/{ref}/mcp"
  }
}]'
```

### 3.3 需要改動的文件

| 文件 | 改動內容 | 行數 |
|------|----------|------|
| `src/config.ts` | 無需改動，已支援 streamable-http | 0 |
| `src/mcp-client.ts` | 無需改動，已支援 streamable-http | 0 |
| `src/skill-executor.ts` | 無需改動 | 0 |

**總改動：0 行程式碼**

Supabase MCP 工具將通過現有 MCP 架構自動可用。

### 3.4 技能使用範例

使用者可建立技能讓 AI 操作 Supabase：

```yaml
# 技能設定範例
name: "Supabase 資料查詢"
description: "查詢 Supabase 資料庫"
trigger:
  type: "keyword"
  value: "查詢資料庫"
prompt: |
  當使用者要求查詢資料時，使用 supabase 工具執行 SQL 查詢。
  表結構：users(id, name, email), orders(id, user_id, amount)
api_config:
  mcp_servers: ["supabase"]
```

---

## 4. 方案二：完整遷移方案

### 4.1 方案概述

將 **SQLite 完全替換為 Supabase PostgreSQL**，實現雲端持久化。

**使用場景：**
- 多實例部署需要共享資料庫
- 需要高可用性和自動備份
- 資料量增長超出 SQLite 適用範圍
- 需要使用 PostgreSQL 進階特性

### 4.2 改動範圍總覽

```
┌──────────────────────────────────────────────────────────────┐
│                    完整遷移改動範圍                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. db.ts (完全重寫)                                          │
│     ├─ 替換 better-sqlite3 為 @supabase/supabase-js          │
│     ├─ 所有同步 API → 非同步 API (Promise)                      │
│     ├─ 重寫所有 CRUD 函數                                     │
│     └─ 新增連線池管理                                         │
│                                                              │
│  2. 所有呼叫 db.ts 的文件 (需改為 async/await)                 │
│     ├─ skill-executor.ts: getUserCredentials()               │
│     ├─ memory.ts: updateUserMemory()                         │
│     ├─ skill-manager.ts: createSkill(), getUserSkills()      │
│     ├─ skill-importer.ts: findSkillBySourceUrl()             │
│     ├─ http-executor.ts: saveUserCredentials()               │
│     ├─ builtin-executor.ts: saveCodeSnippet()                │
│     └─ scheduler.ts: getActiveScheduledTasks()               │
│                                                              │
│  3. config.ts                                                │
│     └─ 新增 Supabase 設定類型                                 │
│                                                              │
│  4. 部署設定                                                  │
│     └─ 新增環境變數                                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 4.3 詳細改動分析

#### 4.3.1 db.ts 改動 (約 400 行)

**當前 SQLite 實作：**
```typescript
// 同步 API
export function getUserById(userId: number): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined;
}
```

**改為 Supabase 實作：**
```typescript
// 非同步 API
export async function getUserById(userId: number): Promise<User | undefined> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data || undefined;
}
```

**需要修改的函數 (共 25 個)：**

| 函數名 | 當前簽名 | 新簽名 | 影響文件數 |
|--------|----------|--------|-----------|
| `getOrCreateUser` | 同步 | async | 2 (index.ts, scheduler.ts) |
| `getUserById` | 同步 | async | 3 (skill-executor, scheduler, etc) |
| `getUserByPlatformId` | 同步 | async | 1 (scheduler.ts) |
| `updateUserMemory` | 同步 | async | 2 (memory.ts, skill-executor.ts) |
| `createSkill` | 同步 | async | 2 (skill-manager.ts, skill-importer.ts) |
| `getUserSkills` | 同步 | async | 2 (skill-executor.ts, skill-manager.ts) |
| `getEnabledSkills` | 同步 | async | 1 (skill-executor.ts) |
| `toggleSkill` | 同步 | async | 1 (skill-manager.ts) |
| `deleteSkill` | 同步 | async | 1 (skill-manager.ts) |
| `findSkillBySourceUrl` | 同步 | async | 1 (skill-importer.ts) |
| `updateSkill` | 同步 | async | 1 (skill-importer.ts) |
| `saveMessage` | 同步 | async | 1 (index.ts) |
| `getRecentMessages` | 同步 | async | 1 (llm.ts) |
| `createScheduledTask` | 同步 | async | 2 (skill-manager.ts, scheduler.ts) |
| `getActiveScheduledTasks` | 同步 | async | 1 (scheduler.ts) |
| `updateLastRun` | 同步 | async | 1 (scheduler.ts) |
| `skillHasScheduledTask` | 同步 | async | 1 (skill-manager.ts) |
| `getScheduledTaskBySkillId` | 同步 | async | 1 (scheduler.ts) |
| `getUserCredentials` | 同步 | async | 2 (skill-executor.ts, http-executor.ts) |
| `saveUserCredentials` | 同步 | async | 1 (http-executor.ts) |
| `saveCodeSnippet` | 同步 | async | 1 (builtin-executor.ts) |
| `listCodeSnippets` | 同步 | async | 1 (builtin-executor.ts) |
| `getCodeSnippet` | 同步 | async | 1 (builtin-executor.ts) |
| `deleteCodeSnippet` | 同步 | async | 1 (builtin-executor.ts) |

#### 4.3.2 skill-executor.ts 改動

```typescript
// 第 200-201 行：當前同步呼叫
const creds = getUserCredentials(userId, credentialService);

// 改為非同步呼叫
const creds = await getUserCredentials(userId, credentialService);
```

**影響：** `executeSkill` 函數需改為 async，呼叫鏈上的所有函數都需要調整。

#### 4.3.3 config.ts 改動

```typescript
// 新增設定類型
export interface AppConfig {
  // ... 現有設定
  supabase?: {
    url: string;
    serviceRoleKey: string;
  };
}

// 新增環境變數讀取
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
```

### 4.4 資料庫 Schema 遷移

需要建立 Supabase 對應的表結構：

```sql
-- Supabase PostgreSQL Schema
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  line_user_id TEXT UNIQUE NOT NULL,
  display_name TEXT DEFAULT '',
  memory_md TEXT DEFAULT '',
  credentials JSONB DEFAULT '{}',
  platform TEXT DEFAULT 'line',
  platform_user_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE skills (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  trigger_type TEXT NOT NULL,
  trigger_value TEXT DEFAULT '',
  prompt TEXT NOT NULL,
  tools JSONB DEFAULT '[]',
  api_config JSONB DEFAULT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  source_type TEXT DEFAULT 'user_created',
  source_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE scheduled_tasks (
  id SERIAL PRIMARY KEY,
  skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  cron_expression TEXT NOT NULL,
  next_run TIMESTAMPTZ,
  last_run TIMESTAMPTZ,
  enabled BOOLEAN DEFAULT TRUE
);

CREATE TABLE code_snippets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  language TEXT DEFAULT 'typescript',
  code TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_users_platform ON users(platform, platform_user_id);
CREATE INDEX idx_skills_user_id ON skills(user_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_scheduled_tasks_enabled ON scheduled_tasks(enabled);
```

### 4.5 使用者資料遷移策略

**方案 A：手動遷移腳本**
```bash
# 匯出 SQLite
sqlite3 data/myclaw.db ".dump" > backup.sql

# 使用 Supabase CLI 匯入
supabase db reset --db-url $SUPABASE_DB_URL
```

**方案 B：雙寫遷移（零停機）**
1. 部署新版本，同時寫入 SQLite 和 Supabase
2. 執行資料同步腳本回填歷史資料
3. 驗證資料一致性
4. 切換到僅 Supabase 模式

**方案 C：AI 輔助遷移**
- 利用 Supabase MCP 工具
- 建立遷移技能，讓 AI 自動遷移使用者資料
- 適合個人使用者自行遷移

---

## 5. 兩種方案對比

| 維度 | 最小改動方案 | 完整遷移方案 |
|------|-------------|-------------|
| **程式碼改動** | ~0 行 | ~500+ 行 |
| **文件影響** | 0 個 | 10+ 個 |
| **風險等級** | 極低 | 高 |
| **測試需求** | 無需測試 | 需要完整回歸測試 |
| **部署複雜度** | 零 | 需要設定 Supabase 專案 |
| **資料遷移** | 無需遷移 | 需要遷移策略 |
| **回滾難度** | 無需回滾 | 困難 |
| **長期維護** | 簡單 | 增加外部依賴 |
| **多實例支援** | 不支援 | 支援 |
| **雲端備份** | 需手動備份 SQLite | 自動備份 |

---

## 6. 建議

### 6.1 推薦方案：最小改動

**理由：**
1. **風險可控**：不影響現有穩定執行的系統
2. **漸進式演進**：使用者可按需選擇是否使用 Supabase
3. **保留 SQLite 優勢**：
   - 零配置部署
   - 單文件備份
   - 低延遲本地訪問
   - 無需網路依賴

### 6.2 何時考慮完整遷移

- 使用者量 > 1000，需要水平擴展
- 需要多實例負載均衡
- 有即時資料同步需求（Supabase Realtime）
- 需要 PostgreSQL 進階特性（全文搜尋、GIS 等）

### 6.3 混合方案（未來考慮）

可以設計 **SQLite + Supabase 雙模式**：

```typescript
// db.ts 抽象層
interface DatabaseAdapter {
  getUserById(id: number): Promise<User | undefined>;
  // ... 其他方法
}

class SQLiteAdapter implements DatabaseAdapter { /* ... */ }
class SupabaseAdapter implements DatabaseAdapter { /* ... */ }

// 根據設定選擇
const db = process.env.DATABASE_MODE === 'supabase'
  ? new SupabaseAdapter()
  : new SQLiteAdapter();
```

這樣使用者可以通過環境變數切換，無需修改業務程式碼。

---

## 7. 環境變數設定

### 7.1 最小改動方案

```env
# 僅需設定 Supabase MCP（可選）
MCP_SERVERS='[{
  "name": "supabase",
  "transport": {
    "type": "streamable-http",
    "url": "https://mcp.supabase.io/v1/servers/{ref}/mcp"
  }
}]'
```

### 7.2 完整遷移方案

```env
# 資料庫模式選擇
DATABASE_MODE=supabase  # 或 sqlite

# Supabase 設定
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# MCP Servers（可選，保留現有設定）
MCP_SERVERS='[...]'
```

---

## 8. 結論

| 評估項 | 結論 |
|--------|------|
| **db.ts 改動範圍** | 最小方案：0 行；完整遷移：約 400 行（完全重寫） |
| **是否保留 SQLite** | 推薦保留，作為預設儲存 |
| **雙模式支援** | 可通過抽象層實作，增加約 100 行程式碼 |
| **skill-executor.ts 調整** | 最小方案：無需調整；完整遷移：需 async 化 |
| **CRUD 遷移難度** | 中等，主要是同步→非同步的轉換 |
| **資料遷移** | 需提供遷移腳本或雙寫方案 |
| **環境變數變更** | 最小方案：無；完整遷移：新增 3 個變數 |

**最終建議：**
- **現階段**：採用最小改動方案，將 Supabase MCP 作為可選工具
- **未來**：如確有雲端資料庫需求，再考慮完整遷移或雙模式支援
