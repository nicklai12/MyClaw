# NanoClaw 架構分析 — 可複用模式提取

## 1. 整體架構概覽

```
使用者 (WhatsApp)
    ↓ Baileys library (非官方 WhatsApp Web API)
Node.js 主程序 (單一程序)
    ├── SQLite 訊息儲存
    ├── Polling Loop (每 2 秒)
    ├── IPC Watcher (每 1 秒, 檔案系統)
    └── Task Scheduler (每 60 秒)
        ↓
Apple Container / Docker (隔離的 Linux VM)
    └── Claude Agent SDK (agent-runner)
        ├── Claude Code 完整工具集
        ├── MCP Server (nanoclaw IPC)
        └── 結構化輸出 (JSON Schema)
```

## 2. 核心模組分析

### 2.1 訊息通道層 (`src/index.ts`)
- **連接管理**: 使用 `@whiskeysockets/baileys` 建立 WhatsApp Web 連線
- **訊息接收**: `messages.upsert` 事件 → 存入 SQLite
- **觸發機制**: `@Andy` 前綴觸發 (可配置)
- **回應發送**: 直接透過 socket 發送文字訊息

**LINE 版本可複用**: 整體 routing 邏輯、群組管理、觸發模式都可以直接移植。只需替換 WhatsApp 連接層為 LINE Webhook。

### 2.2 資料層 (`src/db.ts`)
- **SQLite**: 使用 `better-sqlite3`，零配置
- **表結構**:
  - `chats`: 群組/聊天室元資料
  - `messages`: 訊息內容
  - `scheduled_tasks`: 排程任務
  - `task_run_logs`: 任務執行紀錄
  - `router_state`: 路由狀態
  - `sessions`: Agent 會話
  - `registered_groups`: 已註冊群組

**LINE 版本可複用**: 100% 可複用。將 `chat_jid` 改為 LINE 的 userId/groupId 即可。

### 2.3 容器隔離層 (`src/container-runner.ts`)
- 每次 Agent 調用都 spawn 新的 container
- Volume Mounts 實現檔案隔離
- stdin/stdout JSON 作為 IPC
- 支持 Apple Container 和 Docker

**LINE 版本簡化方案**: 對於 MVP，可以先不用容器隔離，直接在主程序中呼叫 Claude API。這大幅降低複雜度。

### 2.4 Agent 執行器 (`container/agent-runner/`)
- 使用 `@anthropic-ai/claude-agent-sdk`
- 支持 session resume (對話連續性)
- 結構化輸出 (message 或 log)
- MCP Server 提供 IPC 工具 (排程、發送訊息)

**LINE 版本關鍵洞察**: Agent SDK 是核心價值所在。LINE 版本的核心差異在於：
- 不需要容器隔離 (降低門檻)
- 直接使用 Anthropic API 取代 Claude Agent SDK (更輕量)

### 2.5 技能系統 (`.claude/skills/`)
- 技能 = Claude Code Skill (SKILL.md 檔案)
- 只在開發環境中使用 (由開發者透過 Claude Code 執行)
- 不是給終端使用者的功能

**LINE 版本的核心創新**: 要讓終端使用者透過 LINE 對話創建技能，這需要全新設計。

## 3. 可直接複用的模式

| 模式 | 原始實現 | LINE 版本調整 |
|------|----------|--------------|
| 輪詢式訊息處理 | Polling loop + SQLite | 改為 Webhook (LINE 原生支持) |
| 觸發詞機制 | `@Andy` 前綴 | 相同，或使用 LINE 1:1 聊天 (無需觸發詞) |
| 群組隔離記憶 | `groups/{name}/CLAUDE.md` | 相同，`users/{userId}/memory.md` |
| 排程任務 | cron/interval/once | 可簡化版複用 |
| IPC 檔案系統 | `/workspace/ipc/` | 如不用容器，則不需要 |
| 結構化輸出 | JSON Schema | 直接複用 |

## 4. 不需要複用的部分

| 元件 | 原因 |
|------|------|
| Apple Container 整合 | LINE 版不需要 OS 級隔離 |
| WhatsApp Baileys 連線 | 替換為 LINE SDK |
| LID/JID 翻譯 | WhatsApp 特有 |
| QR Code 認證 | LINE 使用 OAuth / Channel Token |
| 容器建置系統 | 簡化版不需要 |

## 5. 架構簡化機會

NanoClaw 的複雜度主要來自：
1. **非官方 API** (Baileys) → LINE 有官方 SDK，更穩定
2. **容器隔離** → MVP 可以跳過
3. **多群組支持** → LINE 版先支持 1:1 對話
4. **IPC 檔案系統** → 不用容器就不需要

**結論: LINE 版本可以用 NanoClaw ~30% 的代碼量達到 ~80% 的功能。**
