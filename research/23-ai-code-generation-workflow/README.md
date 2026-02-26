# AI 代碼生成工作流研究

> 研究使用 Groq 的 Kimi K2 模型來寫代碼時，代碼的保存、部署測試與 GitHub 整合方案。

## 研究背景

MyClaw 是一個 Node.js AI 助理專案，部署在 Render 上，原始碼在 GitHub。使用者透過 Telegram/LINE 跟 bot 對話。現有「技能」系統讓使用者建立 AI 技能（prompt + API 設定）。使用者希望進一步讓 AI（Kimi K2 模型）幫忙寫程式碼，但面臨三個核心問題：

1. AI 寫的代碼要存到哪裡？
2. 怎麼測試和部署？
3. 能不能直接推到 GitHub？

---

## 1. Kimi K2 代碼生成能力評估

### 模型能力

Kimi K2 是 Moonshot AI 開發的 1 兆參數 MoE 模型（32B 活躍參數），在代碼生成方面表現出色：

| 基準 | K2 分數 | 說明 |
|------|---------|------|
| LiveCodeBench | 53.7% Pass@1 | 頂級競賽程式能力 |
| SWE-Bench Verified | 76.8% (K2.5) | 理解 bug 報告、導航代碼庫、生成修復 |
| SWE-Bench Multilingual | 73.0% (K2.5) | 國際代碼庫理解 |

### Groq 上的 Kimi K2

- **Model ID**: `moonshotai/kimi-k2-instruct-0905`
- **速度**: 200+ tokens/s
- **價格**: $1.00/M input tokens, $3.00/M output tokens（Groq 免費額度內可用）
- **Tool Calling**: 支援，但在 Groq 上有 ~5-10% 失敗率（見 Round 6 研究）
- **代碼生成**: 特別擅長前端開發和 Tool Calling 場景

### 結論

Kimi K2 的代碼生成能力足夠強大，問題不在於「能不能寫代碼」，而是「寫出來的代碼怎麼處理」。

---

## 2. 代碼保存方案比較

### 方案 A：存在 SQLite 資料庫（推薦 MVP）

將 AI 生成的代碼作為技能的一部分存在 `skills` 表中。

```
skills 表
├── 現有欄位
│   ├── prompt          # AI 提示詞
│   └── api_config      # API 設定 JSON
└── 新增欄位
    └── code_snippets   # JSON: [{filename, language, content, version}]
```

| 優點 | 缺點 |
|------|------|
| 零額外依賴，沿用現有架構 | 不適合大型專案（多檔案、複雜目錄結構） |
| 與技能系統天然整合 | 無版本控制歷史 |
| 隨 SQLite 備份自動保存 | Render 需付費方案的持久磁碟 |
| 查詢/搜尋方便 | 代碼編輯器體驗差（純文字） |

**適用場景**：單檔案腳本、工具函式、配置生成、簡單自動化腳本。

### 方案 B：存在 GitHub（透過 API / MCP）

透過 GitHub API 或 GitHub MCP Server 將代碼推送到 GitHub 倉庫。

```
使用者對話 → AI 生成代碼 → GitHub API/MCP → 推送到使用者的 repo
```

| 優點 | 缺點 |
|------|------|
| 完整版本控制（git history） | 需要使用者提供 GitHub Token |
| 可觸發 CI/CD 自動部署 | 設定較複雜 |
| 多檔案、目錄結構支持佳 | GitHub API 有 rate limit |
| 業界標準，可協作 | 不適合臨時/實驗性代碼 |

**適用場景**：正式專案代碼、需要版本控制的長期維護代碼、團隊協作。

#### GitHub API 推送流程（Node.js）

```
1. 使用者提供 GitHub Personal Access Token（repo scope）
2. 存入 users.credentials（如 {"github": {"token": "ghp_xxx", "repo": "user/my-repo"}}）
3. AI 生成代碼後呼叫 GitHub API：
   a. GET /repos/{owner}/{repo}/git/refs/heads/main → 取得最新 commit SHA
   b. POST /repos/{owner}/{repo}/git/blobs → 建立 blob（base64 編碼代碼）
   c. POST /repos/{owner}/{repo}/git/trees → 建立 tree
   d. POST /repos/{owner}/{repo}/git/commits → 建立 commit
   e. PATCH /repos/{owner}/{repo}/git/refs/heads/main → 更新 ref
```

或使用簡化的 Contents API：
```
PUT /repos/{owner}/{repo}/contents/{path}
Body: { message, content(base64), sha(如果更新) }
```

可用的 npm 套件：
- `@octokit/rest`（官方）
- `git-commit-push-via-github-api`（專用工具）

#### GitHub MCP Server 方案（更優雅）

GitHub 官方 MCP Server 提供以下關鍵工具：

| MCP 工具 | 功能 |
|----------|------|
| `push_files` | 一次推送多個檔案（單一 commit） |
| `create_or_update_file` | 建立/更新單一檔案 |
| `create_branch` | 建立新分支 |
| `create_pull_request` | 建立 PR |
| `create_repository` | 建立新倉庫 |
| `fork_repository` | Fork 倉庫 |
| `get_file_contents` | 讀取檔案內容 |
| `search_repositories` | 搜尋倉庫 |

**整合方式**：MyClaw 已有 MCP Client Manager，只需在 `MCP_SERVERS` 環境變數中加入 GitHub MCP Server 即可。

```json
{
  "name": "github",
  "transport": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@github/mcp-server"],
    "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx" }
  }
}
```

技能使用：`api_config.mcp_servers: ["github"]`

### 方案 C：存在 GitHub Gist

適合代碼片段和臨時腳本。

```
使用者對話 → AI 生成代碼 → Gist API → 建立/更新 Gist → 回傳 URL
```

| 優點 | 缺點 |
|------|------|
| 比完整 repo 更輕量 | 不適合多檔案專案 |
| 每個 Gist 有獨立 URL，方便分享 | 無目錄結構 |
| 支援版本歷史 | 管理較分散 |
| API 簡單（POST /gists） | 無 CI/CD 整合 |

**適用場景**：代碼片段分享、一次性腳本、教學示範。

### 方案 D：存在本地檔案系統

在 Render 上直接寫入檔案。

| 優點 | 缺點 |
|------|------|
| 最簡單直接 | **Render ephemeral storage：重新部署後檔案消失** |
| 可直接執行 | 安全風險最高（任意檔案寫入） |
| 無額外依賴 | 無版本控制 |

**結論**：**不推薦**。Render 免費方案無持久磁碟，付費方案的 Persistent Disk ($7/月) 也只有單實例可用，且增加部署失敗風險。

### 保存方案比較總表

| 方案 | 複雜度 | 持久性 | 版本控制 | 適用場景 | 推薦度 |
|------|--------|--------|----------|----------|--------|
| **A. SQLite** | 低 | 中 | 無 | 單檔腳本、快速原型 | **MVP 首選** |
| **B. GitHub API/MCP** | 中 | 高 | 完整 | 正式專案代碼 | **中期目標** |
| C. Gist | 低 | 中 | 有限 | 代碼片段分享 | 補充方案 |
| D. 本地檔案 | 最低 | 無 | 無 | 臨時測試 | 不推薦 |

---

## 3. 部署與測試方案

### 核心挑戰：安全執行 AI 生成的代碼

AI 生成的代碼**不能直接在 MyClaw 伺服器上執行**，原因：
1. **安全風險**：惡意或有 bug 的代碼可能損壞伺服器
2. **資源隔離**：無限迴圈、記憶體洩漏會影響主服務
3. **環境污染**：依賴安裝可能衝突

### 方案 A：雲端沙箱（推薦）

#### E2B（推薦 MVP）

E2B 是專為 AI Agent 設計的雲端沙箱服務。

```
AI 生成代碼 → E2B SDK → 建立沙箱 VM → 執行代碼 → 回傳結果 → 銷毀沙箱
```

**關鍵特性**：
- 啟動時間：毫秒級
- 隔離：完整 Linux microVM
- SDK：JavaScript/TypeScript + Python
- 免費額度：$100 一次性 credit（Hobby 方案）
- 付費：~$0.05/小時/沙箱（1 vCPU），按秒計費

**Node.js 整合範例**：
```typescript
import { Sandbox } from 'e2b';

const sandbox = await Sandbox.create();
// 寫入 AI 生成的代碼
await sandbox.files.write('/home/user/script.py', generatedCode);
// 執行
const result = await sandbox.commands.run('python /home/user/script.py');
console.log(result.stdout); // 回傳給使用者
// 銷毀
await sandbox.kill();
```

**與 MyClaw 整合**：
1. 新增 `SANDBOXE2B_API_KEY` 環境變數
2. 建立 `code-executor.ts`：封裝 E2B SDK
3. 在 skill-executor 中新增 `execute_code` 工具
4. AI 生成代碼 → 呼叫 `execute_code` → E2B 執行 → 回傳結果

#### Daytona（開源替代方案）

Daytona 是開源的 AI 代碼執行基礎設施。

**關鍵特性**：
- 啟動時間：200ms
- 隔離：Docker 容器（可選 Kata Containers 強化）
- 開源：可自行部署
- SDK：JavaScript + Python

**適用場景**：需要自建基礎設施、對數據安全要求高的場景。但對 MyClaw 個人助理場景，E2B 的托管方案更合適。

#### Modal（ML 工作流導向）

Modal 專注於 Python ML/AI 工作流。

**關鍵特性**：
- 免費：$30/月 credit
- 隔離：gVisor
- 強項：GPU 支援、大規模並行

**適用場景**：如果 MyClaw 未來需要執行 ML 代碼（如數據分析、模型推理），Modal 是好選擇。目前不適合一般代碼執行。

### 方案 B：Docker 容器化（自建）

在 Render 上運行 Docker 容器來執行代碼。

```
AI 生成代碼 → 寫入臨時檔案 → docker run --rm --network=none 執行 → 回傳結果
```

| 優點 | 缺點 |
|------|------|
| 完全自控 | Render 免費方案不支援 Docker-in-Docker |
| 無外部依賴 | 需要管理 Docker 映象 |
| 可自定義環境 | 啟動較慢（秒級） |

**Render 限制**：Render 的 Docker 服務是每個 Service 一個 Container，不支援在 Container 內再啟動 Container（Docker-in-Docker）。需要付費方案 + 特殊配置。

**結論**：不適合 Render 免費方案，但適合自建 VPS 部署場景。

### 方案 C：不執行，只生成

最簡單的方案：AI 只生成代碼，不執行。

```
使用者：「幫我寫一個 Python 爬蟲」
AI：生成代碼 → 存到 SQLite/GitHub → 回傳代碼文字 → 使用者自行執行
```

| 優點 | 缺點 |
|------|------|
| 零安全風險 | 使用者需要自己執行 |
| 零額外成本 | 無法即時驗證代碼正確性 |
| 實作最簡單 | 體驗較差 |

**適用場景**：MyClaw 作為代碼生成助手，而非代碼執行平台。

### 測試/執行方案比較總表

| 方案 | 安全性 | 成本 | 複雜度 | 體驗 | 推薦度 |
|------|--------|------|--------|------|--------|
| **E2B 沙箱** | 高 | $0-5/月 | 中 | 好 | **MVP 首選** |
| Daytona | 高 | 自建成本 | 高 | 好 | 進階方案 |
| Modal | 高 | $0-30/月 | 中 | 好 | ML 專用 |
| Docker-in-Docker | 中 | Render 付費 | 高 | 好 | 不適合 Render |
| **不執行** | 最高 | $0 | 最低 | 中 | **最小 MVP** |

---

## 4. GitHub 整合方案

### 方案 A：GitHub MCP Server（推薦）

MyClaw 已有 MCP Client Manager，整合 GitHub MCP Server 是最自然的選擇。

```
MCP_SERVERS 環境變數新增：
{
  "name": "github",
  "transport": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@github/mcp-server"],
    "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx" }
  }
}
```

**支援的操作**：
- `push_files`：推送多檔案（單 commit）
- `create_branch`：建立分支
- `create_pull_request`：建立 PR
- `create_or_update_file`：建立/更新單檔
- `get_file_contents`：讀取檔案
- `search_repositories`：搜尋倉庫
- `fork_repository`：Fork 倉庫

**安全考量**：
- GitHub Token 需要 `repo` scope（讀寫倉庫）
- Token 存在環境變數，不存 DB
- MCP Server 以 stdio 子程序運行，與主程序隔離

**優點**：
1. 與現有 MCP 架構完美整合（零新架構概念）
2. AI 可以在 Tool Calling Loop 中自主決定何時推送代碼
3. 支援完整 Git 工作流（branch → commit → PR）
4. GitHub 官方維護，工具定義穩定

### 方案 B：GitHub REST API 直接呼叫

透過 `api_config` 定義 GitHub API 端點，使用現有 `http-executor` 呼叫。

```json
{
  "base_url": "https://api.github.com",
  "auth": {
    "type": "api_key",
    "header": "Authorization",
    "prefix": "Bearer"
  },
  "endpoints": [
    {
      "tool_name": "github_push_file",
      "method": "PUT",
      "path": "/repos/{owner}/{repo}/contents/{path}",
      "parameters": [
        {"name": "owner", "type": "string"},
        {"name": "repo", "type": "string"},
        {"name": "path", "type": "string"},
        {"name": "message", "type": "string"},
        {"name": "content", "type": "string", "description": "Base64 encoded"},
        {"name": "sha", "type": "string", "description": "Optional, for updates"}
      ]
    }
  ]
}
```

**缺點**：需要 AI 自己做 base64 編碼，且多檔案推送需要使用底層 Git Database API（複雜度高）。

### 方案 C：使用者的 GitHub Token 管理

無論用哪種方案，都需要管理使用者的 GitHub Token。

**流程設計**：
```
使用者：「我想把代碼推到 GitHub」
Bot：「請提供你的 GitHub Personal Access Token（需要 repo scope）。
      建立方式：GitHub Settings → Developer Settings → Personal Access Tokens → Generate New Token」
使用者：提供 token
Bot：驗證 token → 存入 users.credentials → 確認可用
```

**Token 存儲**：
```json
// users.credentials
{
  "github": {
    "token": "ghp_xxxxxxxxxxxx",
    "default_repo": "user/my-scripts",
    "default_branch": "main"
  }
}
```

### GitHub 整合比較

| 方案 | 複雜度 | 功能完整性 | 與 MyClaw 整合 | 推薦度 |
|------|--------|-----------|---------------|--------|
| **GitHub MCP Server** | 低 | 高 | 最佳（已有 MCP） | **首選** |
| GitHub REST API | 中 | 中 | 可行（via api_config） | 備選 |
| 第三方 npm 套件 | 低 | 低 | 需新增程式碼 | 不推薦 |

---

## 5. 業界參考

### Claude Code

- **代碼寫入**：直接修改本地檔案系統，使用 OS 級沙箱（Linux: bubblewrap, macOS: Seatbelt）限制存取範圍
- **執行**：在沙箱中執行 bash 命令，filesystem + network 隔離
- **版本控制**：直接操作 git（git add, commit, push）
- **關鍵設計**：沙箱減少 84% 的權限提示，讓 AI 可以自主操作

**MyClaw 可借鑑**：Claude Code 的沙箱思路，但 MyClaw 是遠端服務（非本地 IDE），不能直接操作使用者的檔案系統。

### Cursor / Windsurf

- **代碼寫入**：直接修改 IDE 中打開的檔案
- **執行**：透過 IDE 內建 terminal
- **版本控制**：IDE 整合 Git
- **關鍵設計**：所有操作在使用者的本地環境中進行

**MyClaw 可借鑑**：有限，Cursor 是本地 IDE 插件，MyClaw 是聊天機器人。

### OpenHands (前 OpenDevin)

- **代碼寫入**：在 Docker 沙箱中寫入檔案
- **執行**：Docker 容器內的 bash + IPython
- **版本控制**：在沙箱內操作 git
- **架構**：Event Stream 模式（Agent → Actions → Environment → Observations → Agent）
- **關鍵設計**：完整的 Docker 沙箱環境，包含 bash、瀏覽器、IPython server

**MyClaw 可借鑑**：Event Stream 的循環模式類似 MyClaw 的 Tool Calling Loop。Docker 沙箱的概念可以用 E2B 雲端沙箱替代。

### Replit Agent

- **代碼寫入**：在 Replit 雲端工作區中寫入
- **執行**：Replit 容器內直接執行
- **部署**：一鍵部署到 Replit 基礎設施
- **關鍵設計**：全托管環境，使用者無需關心基礎設施。Agent 3 可連續工作 200 分鐘，自動測試並修復。

**MyClaw 可借鑑**：「生成→執行→修復」的循環模式。但 Replit 是完整的雲端 IDE，MyClaw 是聊天機器人，定位不同。

### 業界趨勢總結

| 工具 | 代碼寫入 | 執行環境 | 版本控制 | 定位 |
|------|----------|----------|----------|------|
| Claude Code | 本地檔案 + OS 沙箱 | 本地 bash | 本地 git | 終端 AI 助手 |
| Cursor | 本地 IDE 檔案 | 本地 terminal | IDE git | IDE 插件 |
| OpenHands | Docker 沙箱 | Docker 容器 | 沙箱內 git | AI 開發平台 |
| Replit Agent | 雲端工作區 | Replit 容器 | Replit git | 雲端 IDE |
| **MyClaw（建議）** | **SQLite + GitHub** | **E2B 雲端沙箱** | **GitHub MCP** | **聊天機器人助手** |

---

## 6. MyClaw 可行方案建議

### 考量因素

1. **專案規模**：個人 AI 助理，不是大型 IDE 或開發平台
2. **部署環境**：Render（免費/付費方案），資源有限
3. **使用場景**：使用者透過 Telegram/LINE 對話要求 AI 寫代碼
4. **現有架構**：已有技能系統、MCP Client、Tool Calling Loop

### MVP（最小可行方案）

**目標**：讓使用者可以要求 AI 寫代碼，代碼保存在技能系統中，可選推送到 GitHub。

#### 架構設計

```
使用者：「幫我寫一個 Python 爬蟲抓取新聞」
         ↓
AI（Kimi K2）生成代碼
         ↓
┌─ 保存：存入 skills.code_snippets（SQLite）
├─ 展示：回傳代碼文字給使用者（Telegram Markdown 格式）
├─ 執行（可選）：E2B 沙箱執行 → 回傳結果
└─ 推送（可選）：GitHub MCP → push_files → 回傳 commit URL
```

#### 實作步驟

**Phase 1：代碼生成 + 保存（~80 行新程式碼）**

1. `db.ts`：skills 表新增 `code_snippets TEXT` 欄位
2. `skill-executor.ts`：新增 `save_code` 工具定義
3. 建立「代碼助手」內建技能（trigger: `always` 或 pattern 匹配「寫代碼」「寫程式」）
4. System prompt 指示 AI 生成代碼時使用 `save_code` 工具保存

**Phase 2：GitHub 推送（~30 行新程式碼）**

1. 在 `MCP_SERVERS` 中配置 GitHub MCP Server
2. 建立「GitHub 推送」技能，`api_config.mcp_servers: ["github"]`
3. 使用者提供 GitHub Token 後，AI 可用 `push_files` 推送代碼

**Phase 3：代碼執行（~100 行新程式碼）**

1. 安裝 `e2b` npm 套件
2. 建立 `code-executor.ts`：封裝 E2B SDK
3. `skill-executor.ts`：新增 `execute_code` 工具
4. AI 生成代碼後可選擇在沙箱中執行並回傳結果

#### 成本估算

| 項目 | MVP 月費 | 說明 |
|------|---------|------|
| Kimi K2 (Groq) | $0 | 免費額度內 |
| SQLite 存儲 | $0 | 隨 Render 方案 |
| GitHub MCP | $0 | 開源工具 |
| E2B 沙箱 | $0-5 | $100 一次性 credit |
| **總計** | **$0-5/月** | |

### 漸進式升級路線

```
Phase 1（MVP）
├── AI 生成代碼 → 存 SQLite → 回傳文字
├── 改動：~80 行
├── 成本：$0
└── 時間：1-2 天

Phase 2（GitHub 整合）
├── GitHub MCP Server → push_files / create_PR
├── 使用者 Token 管理
├── 改動：~30 行（MCP 配置 + Token 流程）
├── 成本：$0
└── 時間：0.5-1 天

Phase 3（代碼執行）
├── E2B 雲端沙箱 → 執行 AI 生成的代碼
├── 支援 Python / Node.js / Shell
├── 改動：~100 行
├── 成本：$0-5/月
└── 時間：1-2 天

Phase 4（進階功能，未來）
├── 代碼版本歷史（code_snippets 加版本號）
├── 多檔案專案支援
├── 自動測試 + 修復迴圈
├── Gist 分享
└── 自建沙箱（Daytona）
```

---

## 7. 技術細節

### skills 表 code_snippets 格式設計

```json
[
  {
    "filename": "news_scraper.py",
    "language": "python",
    "content": "import requests\nfrom bs4 import BeautifulSoup\n...",
    "version": 1,
    "created_at": "2026-02-26T10:00:00Z",
    "description": "新聞爬蟲腳本"
  }
]
```

### E2B 整合設計

```typescript
// code-executor.ts
import { Sandbox } from 'e2b';

export async function executeCode(
  code: string,
  language: 'python' | 'javascript' | 'shell',
  timeout: number = 30000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const sandbox = await Sandbox.create();
  try {
    const filename = language === 'python' ? 'script.py'
                   : language === 'javascript' ? 'script.js'
                   : 'script.sh';
    await sandbox.files.write(`/home/user/${filename}`, code);

    const cmd = language === 'python' ? `python ${filename}`
              : language === 'javascript' ? `node ${filename}`
              : `bash ${filename}`;

    const result = await sandbox.commands.run(cmd, { timeout });
    return {
      stdout: result.stdout.slice(0, 5000), // 截斷防溢出
      stderr: result.stderr.slice(0, 2000),
      exitCode: result.exitCode
    };
  } finally {
    await sandbox.kill();
  }
}
```

### GitHub MCP 工作流設計

```
使用者：「把剛剛的爬蟲推到 GitHub」
         ↓
Skill Chaining：
1. 「代碼助手」技能 → 從 code_snippets 取出代碼
2. 「GitHub 推送」技能 → MCP 工具 push_files
         ↓
AI Tool Calling Loop：
  → mcp__github__push_files({
      owner: "user",
      repo: "my-scripts",
      branch: "main",
      files: [{path: "news_scraper.py", content: "..."}],
      message: "Add news scraper script"
    })
         ↓
回傳：「已推送到 https://github.com/user/my-scripts/commit/abc123」
```

---

## 8. 安全考量

### 代碼生成安全

| 風險 | 緩解方案 |
|------|---------|
| AI 生成惡意代碼 | E2B 沙箱隔離，無法影響主服務 |
| 代碼包含敏感資訊 | System prompt 指示 AI 不要在代碼中硬編碼密碼 |
| 無限迴圈/資源耗盡 | E2B 沙箱有 timeout + 資源限制 |

### GitHub 整合安全

| 風險 | 緩解方案 |
|------|---------|
| Token 洩漏 | 存在環境變數，不存 DB，不記錄 log |
| 推送到錯誤 repo | AI 推送前確認 repo 名稱 |
| 覆蓋重要檔案 | 預設推送到使用者指定的分支 |
| Token scope 過大 | 建議使用 Fine-grained PAT，限制特定 repo |

### 代碼存儲安全

| 風險 | 緩解方案 |
|------|---------|
| SQL injection via code content | 使用 parameterized query（better-sqlite3 已支援） |
| 代碼過大導致 DB 膨脹 | 限制 code_snippets 大小（如 100KB/技能） |
| Prompt injection via code | 代碼作為 tool_result 回傳，有 system prompt 優先權保護 |

---

## 9. 結論

### 推薦方案

| 階段 | 保存 | 執行 | GitHub | 優先級 |
|------|------|------|--------|--------|
| **MVP** | SQLite code_snippets | 不執行（回傳文字） | 無 | **立即可做** |
| **V1** | SQLite + GitHub MCP | E2B 沙箱 | push_files | **短期目標** |
| **V2** | SQLite + GitHub | E2B + 自動修復 | branch + PR | 中期 |

### 核心建議

1. **從最簡單開始**：Phase 1 只需 ~80 行代碼，讓 AI 生成代碼並存到 SQLite，0 成本
2. **善用現有架構**：GitHub MCP Server 直接透過 MCP Client Manager 接入，無需新增架構概念
3. **安全第一**：代碼執行必須在沙箱中，E2B 是個人專案最佳選擇（免費 credit 足夠用很久）
4. **不要過度設計**：MyClaw 是聊天機器人，不是 IDE，代碼生成是輔助功能，不是核心功能
5. **漸進式升級**：先存、再推、後執行，每個階段都是獨立可交付的功能
