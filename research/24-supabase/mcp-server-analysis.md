# Supabase MCP Server 研究報告

## 1. 官方資源

### 官方文件
- **Supabase MCP 官方文件**: https://supabase.com/docs/guides/getting-started/mcp
- **GitHub Repository**: https://github.com/supabase-community/supabase-mcp
- **授權**: Apache 2.0 License

### 套件資訊
- **npm 套件名稱**: `@supabase/mcp-server-supabase`
- **安裝方式**: `npx -y @supabase/mcp-server-supabase@latest`

---

## 2. 支援的工具列表

Supabase MCP Server 提供 **20+ 個工具**，分為 8 個功能群組：

### Database 工具群組
| 工具名稱 | 功能描述 |
|---------|---------|
| `execute_sql` | 執行 SQL 查詢 (SELECT, INSERT, UPDATE, DELETE) |
| `list_tables` | 列出資料庫中的所有表格 |
| `list_extensions` | 列出可用的 PostgreSQL 擴充功能 |
| `list_migrations` | 列出資料庫遷移記錄 |
| `apply_migration` | 套用資料庫遷移 |

### Debugging 工具群組
| 工具名稱 | 功能描述 |
|---------|---------|
| `get_logs` | 取得專案日誌 |
| `get_advisors` | 取得資料庫優化建議 |

### Development 工具群組
| 工具名稱 | 功能描述 |
|---------|---------|
| `get_project_url` | 取得專案 URL |
| `get_publishable_keys` | 取得可公開的金鑰 |
| `generate_typescript_types` | 從資料庫結構生成 TypeScript 型別 |

### Edge Functions 工具群組
| 工具名稱 | 功能描述 |
|---------|---------|
| `list_edge_functions` | 列出 Edge Functions |
| `get_edge_function` | 取得特定 Edge Function 資訊 |
| `deploy_edge_function` | 部署 Edge Function |

### Account Management 工具群組
| 工具名稱 | 功能描述 |
|---------|---------|
| `list_projects` | 列出所有專案 |
| `get_project` | 取得特定專案資訊 |
| `create_project` | 建立新專案 |
| `pause_project` | 暫停專案 |
| `restore_project` | 恢復專案 |
| `list_organizations` | 列出組織 |
| `get_organization` | 取得組織資訊 |
| `get_cost` | 取得成本資訊 |
| `confirm_cost` | 確認成本操作 |

### Docs 工具群組
| 工具名稱 | 功能描述 |
|---------|---------|
| `search_docs` | 搜尋 Supabase 文件 |

### Branching 工具群組 (實驗性，需付費方案)
| 工具名稱 | 功能描述 |
|---------|---------|
| `create_branch` | 建立分支 |
| `list_branches` | 列出分支 |
| `delete_branch` | 刪除分支 |
| `merge_branch` | 合併分支 |
| `reset_branch` | 重置分支 |
| `rebase_branch` | Rebase 分支 |

### Storage 工具群組 (預設停用)
| 工具名稱 | 功能描述 |
|---------|---------|
| `list_storage_buckets` | 列出儲存空間 bucket |
| `get_storage_config` | 取得儲存空間設定 |
| `update_storage_config` | 更新儲存空間設定 |

---

## 3. Transport 類型支援

Supabase MCP Server 支援以下 Transport 類型：

| Transport | 支援狀態 | 說明 |
|-----------|---------|------|
| **STDIO** | 支援 | 標準輸入/輸出，適用於本地開發、CLI 工具、Claude Desktop、Cursor |
| **SSE** | 支援 | Server-Sent Events，HTTP 基礎，適用於遠端連線 |
| **streamable-http** | 未明確支援 | 官方文件未提及此 transport 類型 |

### STDIO 配置範例
```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--access-token",
        "<personal-access-token>"
      ]
    }
  }
}
```

### SSE 配置範例
```json
{
  "mcpServers": {
    "supabase": {
      "transport": "sse",
      "url": "https://mcp.supabase.com/mcp"
    }
  }
}
```

### 本地開發配置
```json
{
  "mcpServers": {
    "supabase": {
      "transport": "sse",
      "url": "http://localhost:54321/mcp"
    }
  }
}
```

---

## 4. 安裝與配置方式

### 方式一：npx 安裝（推薦）

**安裝指令：**
```bash
npx -y @supabase/mcp-server-supabase@latest --access-token=<your-personal-access-token>
```

**MCP 客戶端配置：**
```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--access-token",
        "<personal-access-token>"
      ]
    }
  }
}
```

### 方式二：Hosted MCP Endpoint（最簡單，無需 npx）

```json
{
  "mcpServers": {
    "supabase": {
      "url": "https://mcp.supabase.com/mcp"
    }
  }
}
```

此方式自動處理 OAuth 認證流程。

### 方式三：使用連線字串（本地開發）

```bash
npx supabase-mcp@latest --connection-string "postgresql://postgres:postgres@localhost:54321/postgres"
```

### 環境變數需求

| 環境變數 | 說明 | 取得方式 |
|---------|------|---------|
| `SUPABASE_ACCESS_TOKEN` | 個人存取權杖 | Supabase Dashboard → Account Settings → Access Tokens |
| `SUPABASE_PROJECT_REF` | 專案參考 ID | 可選，用於限制特定專案 |

### 配置參數

| 參數 | 說明 | 範例 |
|-----|------|------|
| `read_only=true` | 以唯讀模式執行查詢 | `?read_only=true` |
| `project_ref=<id>` | 限制特定專案存取 | `?project_ref=abc123` |
| `features=<groups>` | 啟用特定工具群組 | `?features=database,docs` |

**組合參數範例：**
```
https://mcp.supabase.com/mcp?project_ref=abc123&read_only=true&features=database,docs
```

---

## 5. 與現有 SQLite 架構的差異比較

### 架構層面比較

| 特性 | Supabase MCP Server | MyClaw 現有 SQLite |
|-----|--------------------|-------------------|
| **資料庫類型** | PostgreSQL (雲端託管) | SQLite (本地檔案) |
| **部署方式** | 雲端服務 | 本地嵌入 |
| **連線方式** | 網路 API | 本地檔案系統 |
| **擴充性** | 水平擴充，支援百萬連線 | 單機限制 |
| **認證機制** | JWT + OAuth 2.1 | 無（本地檔案權限） |
| **Row Level Security** | 原生支援 | 需自行實作 |
| **Vector Search** | 內建 pgvector 支援 | 需額外擴充 |
| **即時訂閱** | WebSocket 支援 | 不支援 |
| **Edge Functions** | 支援 | 不支援 |

### 工具呼叫方式比較

| 項目 | Supabase MCP | 現有 SQLite (better-sqlite3) |
|-----|-------------|-----------------------------|
| **呼叫方式** | MCP 工具呼叫 | 直接 SQL 執行 |
| **延遲** | 網路延遲 | 本地零延遲 |
| **離線支援** | 否 | 是 |
| **並發處理** | 連線池管理 | 單一寫入限制 |
| **錯誤處理** | MCP 協定錯誤回傳 | 直接拋出異常 |

### 資料持久化比較

| 特性 | Supabase | SQLite |
|-----|----------|--------|
| **備份** | 自動備份 | 需手動備份 |
| **還原** | 時間點還原 | 檔案複製還原 |
| **多環境** | 分支管理 | 多個檔案 |
| **資料遷移** | 內建遷移工具 | 需自行管理 |
| **資料匯出** | SQL/CSV | SQL/CSV |

### 適用場景比較

| 場景 | 建議方案 | 原因 |
|-----|---------|------|
| **生產環境用戶資料** | Supabase | 企業級安全性、RLS、擴充性 |
| **本地開發/測試** | SQLite | 零配置、快速、無網路依賴 |
| **AI/ML 向量搜尋** | Supabase | 內建 pgvector |
| **多使用者協作** | Supabase | 並發支援、權限管理 |
| **離線/嵌入式應用** | SQLite | 無網路需求 |
| **快速原型開發** | SQLite | 設定簡單 |
| **行動/桌面應用** | SQLite | 輕量、可攜 |

---

## 6. 安全考量

### Supabase MCP Server 安全特性

1. **唯讀模式**
   - 設定 `read_only=true` 限制為只讀操作
   - 使用專用的 `supabase_read_only_user` 執行查詢

2. **專案範圍限制**
   - 透過 `project_ref` 參數限制只能存取特定專案
   - 防止跨專案資料存取

3. **功能群組限制**
   - 透過 `features` 參數啟用特定工具群組
   - 例如：只啟用 `database` 和 `docs` 工具

4. **手動確認**
   - 大多數 MCP 客戶端（如 Cursor）會要求手動確認每個工具呼叫

5. **SQL 結果包裝**
   - Supabase MCP 會包裝 SQL 結果，防止 LLM 執行資料中可能存在的惡意指令

### 官方安全建議

- **不要連線到生產環境** - 僅用於開發專案
- **不要提供給客戶** - 僅供內部開發人員使用
- **使用分支功能** - 利用 Supabase 的分支功能進行安全測試
- **啟用手動確認** - 確保每個工具呼叫都經過人工審核

---

## 7. MyClaw 整合建議

### 整合可行性

Supabase MCP Server 可以與 MyClaw 整合，但需注意以下事項：

1. **Transport 相容性**
   - MyClaw 已支援 `stdio` 和 `streamable-http` transport
   - Supabase MCP 支援 `stdio` 和 `sse`，需確認 SSE 相容性

2. **認證流程**
   - 需要使用者提供 Supabase Personal Access Token
   - 可透過環境變數 `SUPABASE_ACCESS_TOKEN` 注入

3. **工具對應**
   - Supabase 的 `execute_sql` 工具可對應到 MyClaw 的資料庫操作需求
   - 現有 SQLite 操作需評估是否遷移或並存

### 潛在整合架構

```
MyClaw
├── 現有 SQLite (better-sqlite3)
│   ├── 使用者資料 (users)
│   ├── 技能資料 (skills)
│   ├── 對話紀錄 (messages)
│   └── 排程任務 (scheduled_tasks)
│
└── Supabase MCP Server (選配)
    ├── 外部資料查詢
    ├── 向量搜尋
    └── 生產資料整合
```

### 建議實作步驟

1. **評估需求**：確認是否需要 Supabase 的進階功能（向量搜尋、RLS、即時訂閱）
2. **Transport 驗證**：測試 SSE transport 與現有 MCP Client 的相容性
3. **工具對應**：將 Supabase 工具整合到 `dynamic-tool-builder.ts`
4. **安全設定**：建議使用 `read_only=true` 和 `features=database` 限制
5. **文件更新**：更新 `CLAUDE.md` 說明 Supabase MCP 整合方式

---

## 8. 參考資源

- [Supabase MCP 官方文件](https://supabase.com/docs/guides/getting-started/mcp)
- [Supabase MCP GitHub](https://github.com/supabase-community/supabase-mcp)
- [Supabase MCP Server 完整指南](https://chat2db.ai/resources/blog/supabase-mcp-server-guide)
- [Top MCP Servers for Databases](https://fast.io/resources/top-mcp-servers-databases/)
