# LINE AI 個人助理 — 總體計畫

> 基於 NanoClaw 架構，打造人人都能用的 LINE AI 助理

## 專案願景

讓每個 LINE 使用者都能在 5 分鐘內擁有自己的 AI 助理，透過自然語言對話建立專屬技能，不需要寫任何程式碼。

## 架構（更新版）

```
LINE AI Assistant:
LINE ─→ Node.js (Express) ─→ Groq API (Qwen3 32B, 免費)
  官方SDK    ~800行           ↘ Claude API (複雜任務, fallback)
  Webhook    Docker 容器化
  Token設定  Codespace 測試 / Railway 部署
```

## 技術選型（確認版）

| 元件 | 選擇 | 理由 |
|------|------|------|
| Runtime | Node.js 20+ | 與 NanoClaw 一致 |
| HTTP | Express.js | 輕量穩定 |
| LINE | @line/bot-sdk | 官方 SDK |
| **AI (主力)** | **Groq API — Qwen3 32B** | **免費、中文優秀、Tool Calling 頂級** |
| AI (fallback) | Claude API (Haiku 4.5) | 複雜任務 |
| **AI (替代)** | **Claude-only 模式** | **用戶可選擇只用 Claude API（$1-25/月）** |
| 資料庫 | SQLite (better-sqlite3) | 零配置 |
| 排程 | node-cron | 輕量 |
| 容器化 | Docker + Docker Compose | 一鍵啟動、環境一致 |
| 測試 | GitHub Codespaces | 免費、內建公開 URL |
| 部署 | Railway (一鍵按鈕) | 最簡部署 |
| 安裝 | `npx create-line-assistant` | 開發者友善 |

---

## 研究成果摘要

### Round 1 研究

#### 1. 架構分析 (`01-architecture-analysis/`)
- NanoClaw 的核心模式可以 70% 複用
- 去掉容器層可以減少 60% 的代碼
- SQLite + 檔案記憶系統直接適用

#### 2. LINE API 可行性 (`02-line-api-feasibility/`)
- ✅ 高度可行，官方 SDK 穩定
- Reply Message 不計入免費額度 (關鍵優勢)
- 需要公開 HTTPS URL (雲端部署解決)
- Rich Menu + Flex Message 可打造更好的 UX

#### 3. 對話式技能系統 (`03-skill-creation-system/`)
- 使用者用自然語言描述 → AI 自動生成技能配置
- 技能 = JSON 配置 + prompt + 觸發條件
- 支援 cron 排程、關鍵字觸發、手動觸發
- 提供預設範本降低上手門檻

#### 4. MVP 計畫 (`04-mvp-rapid-prototype/`)
- 預計 7 天開發時間
- ~800 行代碼、8 個源碼檔案
- Phase 1 (Day 1-2): 基礎對話
- Phase 2 (Day 3-4): 技能系統
- Phase 3 (Day 5-6): 排程與部署
- Phase 4 (Day 7): 文件與美化

#### 5. 部署策略 (`05-deployment-strategy/`)
- 推薦 Railway 一鍵部署
- 只需要 3 個環境變數
- 5 分鐘完成設定

### Round 2 研究

#### 6. 免費 LLM API (`06-free-llm-api-alternatives/`)
- **NVIDIA NIM**: ❌ 不推薦（Credits 一次性，用完即止）
- **Groq API**: ✅ 強烈推薦（持續免費，速度極快）
- **最佳方案**: 混合架構 — Groq 80% + Claude 20%
- **月費可降到 $0~3**

#### 7. 免費部署平台 (`07-free-deployment-platforms/`)
- **Vercel**: ❌ 不推薦（Serverless 不適合有狀態聊天機器人）
- **Render**: ⚠️ 勉強可行（休眠問題、無持久磁碟）
- **Railway**: ✅ 推薦（$0-5/月，SQLite 可用，不休眠）

### Round 3 研究（最新）

#### 8. Qwen3 32B 技能能力 (`08-qwen3-skill-capability/`)
- ✅ **能勝任技能建立**: BFCL 排行榜頂級，Tool Calling 優秀
- ✅ **能勝任技能調用**: 支持複雜 System Prompt、並行工具呼叫
- ✅ **繁中能力優秀**: 119 語言支持，中文是核心優化語言
- Groq Model ID: `qwen/qwen3-32b`（通用）和 `qwen-qwq-32b`（推理）
- 免費額度足夠：每天 500+ 次對話

#### 9. Codespace + Docker 測試 (`09-codespace-docker-testing/`)
- ✅ **Codespace 非常適合 MVP 測試**:
  - 免費 60 小時/月
  - **公開 Port Forwarding** 解決 LINE Webhook 問題（自動 HTTPS）
  - 零安裝，瀏覽器即可
- ✅ **Docker 容器化比較簡單**:
  - `docker compose up` 一鍵啟動
  - 環境一致，跨平台
  - Volume 自動持久化 SQLite
- **推薦**: Codespace（開發測試）+ Docker（部署）

#### 10. 一鍵安裝方案 (`10-one-click-install/`)
- ✅ **`npx create-line-assistant` 可行**: 開發者友善，互動式設定
- ✅ **Railway Deploy Button 可行**: 非技術使用者最佳選擇
- ✅ **GitHub Codespace Button 可行**: 免費測試最佳方式
- ⚠️ **`curl | sh` 可行但有限**: 只支持 macOS/Linux
- ❌ **`npm install -g` 不推薦**: 伺服器不適合全域安裝
- **無法自動化的步驟**: LINE 帳號設定 (~10 分鐘)，使用者必須手動完成

### Round 4 研究（2026-02-08）

#### 13a. 僅使用 Claude API 可行性 (`13-claude-only-feasibility/`)
- ✅ **完全可行，品質更優**：Claude API 在 tool calling、structured output、繁體中文方面均優於 Groq + Qwen3 32B
- **成本估算**：使用 Claude Haiku 4.5 作為主力
  - 輕度 50 對話/天：**~$1-3/月**
  - 中度 200 對話/天：**~$5-12/月**
  - 重度 500 對話/天：**~$12-25/月**
- **效能差異**：比 Groq 慢 3-5 倍（~3-5 秒回覆），但 LINE 聊天場景可接受
- **架構建議**：`llm.ts` 採用 Provider Pattern，自動偵測 API Key：
  - 只有 `ANTHROPIC_API_KEY` → Claude-only 模式（80% Haiku + 20% Sonnet）
  - 只有 `GROQ_API_KEY` → Groq-only 模式
  - 兩者皆有 → 混合模式
  - 都沒有 → 啟動失敗
- **結論**：用戶只填 Claude API Key 完全可行，不需要 Groq API

#### 13b. Claude Pro/Max Plan 接入可行性 (`13-claude-pro-max-vs-api/`)
- ❌ **不可行**：Claude Pro/Max 訂閱和 Claude API 是完全獨立的產品線
- **關鍵事實**：
  - Anthropic 官方明確聲明：訂閱方案不包含 API 存取權限
  - 2026 年 1 月 9 日 Anthropic 實施伺服器端技術封鎖，阻止第三方工具透過訂閱 OAuth token 存取
  - 使用條款明確禁止透過 bot/script 方式使用訂閱服務
- **MCP 也無法解決**：MCP 只能讓 Claude「發送」LINE 訊息，無法「接收並自動回應」LINE 用戶訊息
- **對 MyClaw 影響**：無需改動架構，用戶需使用 API 按量計費（Groq 免費 + Claude API $0-3/月）
- **用戶溝通建議**：向用戶解釋訂閱和 API 的區別，強調 MyClaw 主要用免費 Groq，Claude API 月費極低

#### 13c. 接入公開 Skills 可行性 (`13-public-skill-import/`)
- ✅ **可行，需格式轉換**：AI 生態系已有大量公開 skills（Anthropic Agent Skills 5,700+、OpenAI Codex Skills 等）
- ✅ **GitHub URL 匯入機制完全可行**：用戶貼上 URL → AI fetch SKILL.md → 解析轉換為 MyClaw JSON → 用戶確認後儲存
- **安全優勢**：MyClaw 的 skill 是「prompt-only」設計（純 JSON + prompt），天然免疫程式碼執行攻擊
- **MVP 實現方案**（約 100-150 行新程式碼）：
  1. 建立 `myclaw/skill-catalog` GitHub repo（10 個預設 skills）
  2. GitHub URL 匯入功能（URL 解析 → fetch → AI 轉換 → 儲存）
  3. 「瀏覽技能」指令（讀取 catalog.json 列表展示）
- **分階段實施**：
  - MVP：GitHub repo + URL 匯入 + 瀏覽指令
  - V2：LINE 內建技能商店 UI + 用戶間分享
  - V3：選擇性 MCP 橋接（進階用戶）

### Round 5 研究（2026-02-08）

#### 14a. GPT-OSS-120B 替換 Qwen3 32B 可行性 (`14-gpt-oss-120b-model-switch/`)
- ❌ **不建議切換到 openai/gpt-oss-120b**，三個致命缺陷：
  1. 繁體中文能力極差（C-Eval 僅 20%，遠低於 Qwen3）
  2. Groq 社群回報 Tool Calling 可靠性問題（模型會忽略 tool 定義）
  3. Structured Outputs 與 Tool Use 不能同時使用
- **最佳替代方案：Kimi K2-0905**（`moonshotai/kimi-k2-instruct-0905`）
  - Tool Calling ~95% 首次成功率、繁中能力優秀、支援 Parallel Tool Calling
  - 缺點：速度較慢（200 TPS vs Qwen3 的 662 TPS）、免費 TPD 只有 300K
- **建議策略**：
  - 短期：保留 Qwen3 32B，加強 JSON 驗證和 fallback 解析邏輯
  - 中期：新增 Kimi K2-0905 作為 skill parsing 專用模型
- **Groq 免費模型 Tool Calling 比較**：
  | 模型 | RPM | TPD | Tool Calling | 繁中 |
  |------|-----|-----|-------------|------|
  | Qwen3 32B | 60 | 500K | 良好 | 優秀 |
  | Kimi K2-0905 | 60 | 300K | 優秀(~95%) | 優秀 |
  | GPT-OSS-120B | 30 | 200K | 不穩定 | 極差 |
  | Llama 4 Scout | 30 | 500K | 良好 | 一般 |

#### 14b. 模型用戶自選機制 (`14-user-model-selection/`)
- ✅ **可以且應該支援模型選填**
- **MVP 推薦：方案 A 增強版（.env 配置 + 模型白名單）**
  - `config.ts` 讀取 `GROQ_MODEL` / `CLAUDE_DEFAULT_MODEL` 環境變數
  - 建立支援 Tool Calling 的模型白名單驗證
  - 改動量極小（~60 行），不需 DB 變更
- **後續迭代路線**：
  - Phase 1 (MVP)：.env 配置模型選擇
  - Phase 2：LINE 中查詢可用模型資訊
  - Phase 3：LINE 動態切換 + DB 儲存用戶偏好
- **重要發現**：不同 Groq 模型需要不同前處理（Qwen3 需要 `/no_think`，其他模型不需要），需在模型註冊表中標記

### Round 6 研究（2026-02-08）

#### 15a. Kimi K2 技能執行能力問題 (`15-kimi-k2-skill-execution/`)
- ⚠️ **Kimi K2 在 Groq 上的 Tool Calling 不穩定，是技能無法正確操作的主因**
- **問題現象**：AI 可以正確回答「有什麼 skills」（走關鍵字匹配，不需 LLM），但無法正確建立/執行 skill
- **根因分析**（按影響程度排序）：
  1. **Tool Calling 失敗率 ~5-10%**：Groq Community 多篇報告顯示 Kimi K2 的 tool call 會出現格式錯誤、驗證失敗、通用失敗等問題
  2. **Tool Call ID 格式不兼容**：Kimi K2 期望 `functions.{func_name}:{idx}` 格式，但 Groq 可能不產生此格式
  3. **嵌套 JSON Schema 解析問題**：`create_skill` 工具的 trigger 子物件可能被解析為不完整或畸形 JSON
  4. **觸發條件建立不精確**：即使 Tool Calling 成功，trigger_value 可能與預期不符
  5. **System Prompt 遵循能力影響最小**：Kimi K2 的中文文字生成能力仍然優秀
- **關鍵發現**：不同 Provider 的 Kimi K2 表現差異顯著
  - Moonshot AI（官方）：Tool Calling 100% 可靠，但速度最慢（~10 TPS）
  - Groq：速度最快（170-230 TPS），但 Tool Calling 有問題
  - DeepInfra：品質最高，速度中等
- **建議解決方案**：
  1. **立即**：`parseSkillFromText()` 增加 Tool Calling 重試邏輯（方案 A）
  2. **短期**：改用 Prompt-based JSON 取代 Tool Calling（方案 B，最推薦）
  3. **中期**：混合策略 — 技能建立用 prompt-based JSON，其他操作用 Kimi K2 文字生成（方案 E）
- **結論**：「列出技能」不需 LLM 所以 100% 正常；「建立/執行技能」依賴 LLM 的 Tool Calling 和結構化輸出，受 Kimi K2 在 Groq 上的限制影響

#### 15b. Claude Code Agent Skills vs MyClaw 技能系統對比 (`15-claude-skills-vs-myclaw/`)
- ✅ **完成深度對比分析**：兩個系統定位截然不同
- **Claude Code Agent Skills 機制**：
  - `.claude/skills/` 資料夾儲存，SKILL.md + YAML frontmatter 格式
  - 三層漸進式載入：metadata（常駐）→ instructions（觸發時）→ resources（按需）
  - AI 語義觸發 + 使用者 `/command` 手動觸發
  - 開放標準 agentskills.io，社群 65.6k stars
  - 支援子代理 fork、動態 shell 命令、變數替換
- **MyClaw 技能系統**：
  - SQLite 資料庫儲存，JSON 格式
  - 自然語言 → LLM Tool Calling → 結構化技能配置
  - keyword/pattern/cron/always 規則觸發
  - Prompt-only 設計，天然免疫程式碼注入
  - GitHub URL 匯入，相容 Agent Skills 格式
- **MyClaw 獨特優勢**：
  1. 零門檻技能建立（自然語言對話）
  2. Cron 排程觸發（Claude Code 不具備）
  3. 個人化記憶整合（memory_md）
  4. LINE 對話即介面
  5. Prompt-only 安全模型
- **可借鏡的設計**：
  1. 漸進式載入（只預載 description，觸發時才載入完整 prompt）
  2. 語義 fallback 觸發（keyword/pattern 失敗時用 AI 判斷）
  3. 變數替換（{user_message}、{user_name}、{current_time}）

---

## 確認的安裝策略

```
非技術使用者     → Railway Deploy Button (純瀏覽器，3 分鐘)
想試用的使用者   → GitHub Codespace Button (免費，零安裝)
開發者           → npx create-line-assistant my-bot
進階使用者       → Docker Compose
```

## 確認的開發工作流

```
1. 在 GitHub Codespace 中開發
2. 公開 Port 3000 → LINE Webhook 直接測試
3. Docker Compose 打包
4. Railway Deploy Button 發布
5. README 提供 4 種安裝方式
```

## 快速開始路線圖

```
Week 1: 🏗️ 基礎建設
├── Day 1: 專案初始化 + LINE Webhook + Codespace devcontainer
├── Day 2: Groq API (Qwen3 32B) 整合 + 基礎對話
├── Day 3: 使用者記憶系統 + SQLite
├── Day 4: 技能建立系統 (Tool Calling)
└── Day 5: 技能觸發與執行

Week 2: 🚀 完善與發布
├── Day 6: 排程系統 (node-cron)
├── Day 7: Docker Compose + Dockerfile
├── Day 8: Railway 一鍵部署 + npx create 工具
├── Day 9: 測試 + Bug 修復
└── Day 10: README + 安裝指南 + 公開發布
```

## 目錄結構

```
research/
├── PLAN.md                              ← 你在這裡
├── 01-architecture-analysis/            # NanoClaw 架構分析
├── 02-line-api-feasibility/             # LINE API 可行性
├── 03-skill-creation-system/            # 對話式技能系統
├── 04-mvp-rapid-prototype/              # MVP 計畫
├── 05-deployment-strategy/              # 部署策略
├── 06-free-llm-api-alternatives/        # Groq / NIM 替代方案
├── 07-free-deployment-platforms/        # Vercel / Render 可行性
├── 08-qwen3-skill-capability/           # Qwen3 技能能力
├── 09-codespace-docker-testing/         # Codespace + Docker
├── 10-one-click-install/                # 一鍵安裝方案
├── 13-claude-only-feasibility/          # Claude-only API 可行性分析
├── 13-claude-pro-max-vs-api/            # Claude Pro/Max vs API 研究
├── 13-public-skill-import/              # 公開 Skills 導入機制研究
├── 14-gpt-oss-120b-model-switch/        # GPT-OSS-120B 替換可行性研究
├── 14-user-model-selection/             # 模型用戶自選機制研究
├── 15-kimi-k2-skill-execution/          # Kimi K2 技能執行能力研究
├── 15-claude-skills-vs-myclaw/          # Claude Code Skills vs MyClaw 對比研究
├── 17-agent-skills-testing/             # Agent Skills 動態架構深度測試
├── 18-gemini-anti-fabrication/          # Gemini 模型防造假可行性研究
├── 19-cerebras-cloud-models/            # Cerebras Cloud 免費模型研究
├── 19-messaging-platform-comparison/    # LINE/Telegram/Discord 平台比較研究
├── 20-mcp-integration/                  # MCP 整合可行性研究
│   ├── mcp-protocol-research.md         # MCP 協議規格與 SDK 生態
│   ├── mcp-integration-analysis.md      # MyClaw 架構與 MCP 整合點分析
│   └── mcp-chrome-devtools-research.md  # Chrome DevTools MCP Server 研究
├── free-api-alternatives-research.md    # 研究員報告
└── LINE-CHATBOT-DEPLOYMENT-RESEARCH.md  # 研究員報告
```

## 成本預估（最終版）

| 項目 | 月費 | 說明 |
|------|------|------|
| LINE Official Account | NT$0 | 免費方案，Reply 不限量 |
| Groq API (Qwen3 32B) | **$0** | **免費 tier，每天 500+ 次對話** |
| Claude API (fallback) | $0~3 | 只用於複雜任務 |
| Railway 部署 | $0~5 | Trial 免費 |
| GitHub Codespace 測試 | $0 | 免費 60 小時/月 |
| **總計** | **$0~8/月** | **約 NT$0~256** |

## 風險與緩解

| 風險 | 影響 | 緩解 |
|------|------|------|
| Groq 免費額度不夠 | 每天 >500 次對話觸頂 | Claude fallback + 限流 |
| Qwen3 中文不夠好 | 技能建立品質下降 | 複雜技能走 Claude |
| Railway 免費結束 | 服務停止 | 遷移到 Render 或 Fly.io |
| LINE Reply Token 超時 | 回應失敗 | 先回「處理中」+ Push |
| Codespace URL 變更 | Webhook 失效 | 每次啟動更新 LINE 設定 |

### Round 7 研究（2026-02-08）— API Tool Calling 功能測試

#### 16a. 技能匯入/刪除功能測試 (`16-skill-import-delete-test/`)

**測試結論：基本功能正常，但有數個需要修復的問題。**

##### 匯入技能測試

- **GitHub URL 偵測** ✅ 正常：`isSkillImportIntent()` 能偵測 `github.com/owner/repo/tree/branch/path` 格式，且 URL 含 `skill` 關鍵字時自動視為匯入意圖
- **完整匯入鏈路** ✅ 正常：`parseGitHubUrl()` → `fetchSkillContent()` → `parseSkillMd()` → `convertToMyClawFormat()` → `detectToolsFromContent()` → `createSkill()`
- **`detectToolsFromContent()` 工具偵測** ✅ 正常：能從 SKILL.md 原始內容偵測 18 個 ERP API 端點路徑並映射到工具名稱，作為 AI 轉換的後備方案
- **`tools` 欄位填入** ✅ 已修復：之前的 bug 是 AI 轉換時遺漏 tools，現在由 `detectToolsFromContent()` 自動補充

##### 發現的問題

| # | 問題 | 嚴重性 | 說明 |
|---|------|--------|------|
| 1 | **重複匯入無防護** | ⚠️ 中 | 重複匯入同一 SKILL.md 會建立多筆同名技能，DB 無唯一約束。兩個同名技能同時啟用且 trigger 相同（keyword: 查詢），只有排序靠前的會被觸發 |
| 2 | **URL 正則 trailing 問題** | ⚠️ 低 | `GITHUB_URL_REGEX` 結尾要求 `(?:\s|$)`，如果 URL 後面緊跟標點（如 `。`）會匹配失敗 |
| 3 | **匯入成功前 `createSkill` 已在 index.ts 呼叫** | ⚠️ 低 | `importSkillFromURL()` 回傳結果後由 `index.ts` 呼叫 `createSkill()` 儲存，流程正確但使用者無「確認預覽」步驟 |
| 4 | **`findSkillByName()` 模糊搜尋** | ⚠️ 低 | 使用 `includes()` 做模糊匹配，可能誤匹配子字串（如「ERP」匹配到「ERP資料查詢」和「ETL基本資料查詢」取第一筆） |

##### 刪除/管理技能測試

- **刪除** ✅ 正常：`deleteSkill()` 正確先刪 `scheduled_tasks` 再刪 `skills`
- **啟用/停用** ✅ 正常：已啟用再啟用會提示「已經是啟用狀態」，停用同理
- **名稱解析** ✅ 正常：`extractSkillName("刪除技能 每日天氣提醒", "刪除技能")` → `"每日天氣提醒"`

---

#### 16b. AI 真實 API 調用驗證 (`16-api-call-verification/`)

**測試結論：Tool Calling Loop 邏輯正確，能確實調用 API，不會造假。但有格式轉換細節需注意。**

##### Tool Calling Loop ✅

- `parseToolNames()` 正確從 `skill.tools` JSON 字串（如 `'["search_employee","list_department"]'`）解析出字串陣列
- `getToolDefinitions()` 回傳的 ToolDefinition 包含正確的 per-endpoint `input_schema`（gen01/gen02 用於員工、pmc24 用於供應商等）
- 呼叫 `chat()` 時透過 spread 運算子 `...(toolDefs.length > 0 ? { tools: toolDefs } : {})` 確實傳入 tools
- Loop 邏輯正確：`while (response.toolCalls.length > 0 && iteration < 5)` → 執行工具 → 回饋結果 → 再次呼叫
- 5 輪限制合理（ERP 查詢通常 1-2 輪即完成）

##### 訊息格式轉換 ✅（有一個潛在問題）

- **Claude**：`convertToAnthropicMessages()` 正確處理三種角色：
  - `user` → 直接傳遞
  - `assistant` + `toolCalls` → 包含 `TextBlockParam` + `ToolUseBlockParam`
  - `tool` → 轉為 `user` role with `tool_result` content block
- **Groq**：正確處理 `tool` role + `tool_call_id`，assistant 的 `tool_calls` 格式也正確
- **⚠️ 潛在問題**：Groq `chatWithGroq` 中 `msg.role as 'user' | 'assistant'` 的型別斷言，若 `msg.role` 為 `'tool'` 但沒有 `toolCallId` 會走到 else 分支，造成角色錯誤。實際上 `tool` 角色的 if 判斷在前面已處理，不會走到 else，但程式碼可以更明確

##### Credential 流程 ✅

- 無帳密時：`executeSkill()` 偵測到 ERP 工具且 `getUserCredentials()` 回傳 null → 自動加入 `set_erp_credentials` 工具
- `getToken()` 無 credentials 時正確拋出 `ERP_NO_CREDENTIALS`
- `executeErpTool()` 捕獲此錯誤後回傳 `{ error: true, message: "尚未設定 ERP 帳密..." }` → LLM 收到此訊息會引導用戶設定
- Token 快取 ✅：`Map<userId, { token, expiresAt }>` 結構，30 分鐘過期

##### 防造假機制 ✅

- `buildSkillSystemPrompt()` 中有明確指示：
  - `「使用提供的工具呼叫真實 API，不要編造或虛構資料」`
  - `「如果 API 回傳錯誤，如實告知使用者」`
  - `「如果用戶尚未設定帳密，使用 set_erp_credentials 工具引導用戶提供帳號密碼」`
- API 失敗時，`executeErpTool()` 回傳 JSON 錯誤訊息，LLM 能看到真實錯誤並轉告用戶

##### API 路徑一致性 ✅

- 所有路徑已修正，與 SKILL.md 定義一致：
  - Search: `/api/etl/employee/search` 等（POST）
  - List: `/api/etl/department` 等（GET，無 `/list` 後綴）
- 參數 schema 使用正確的欄位代碼（gen01/gen02、pmc24、occ01/occ02 等）

---

#### 16c. Agent Skills 動態架構可行性分析 (`16-dynamic-agent-skills/`)

**核心結論：方案可行，但目前架構確實是「寫死」的，需要重構為動態架構才能實現「不寫任何功能程式碼，只透過 Agent Skills」的目標。**

##### 1. 當前架構是「寫死」的嗎？— **是的**

| 檔案 | 寫死的內容 | 影響 |
|------|-----------|------|
| `tool-registry.ts` | 19 個工具的 name、description、input_schema 全部硬編碼 | 新增任何 API 都需修改此檔案 |
| `erp-client.ts` | 18 個 API 的 URL path、HTTP method 全部硬編碼 | 新增任何端點都需修改此檔案 |
| `skill-importer.ts` | `detectToolsFromContent()` 只認 ERP API 端點 | 匯入非 ERP 的 Skill 不會偵測到工具 |

**如果要匯入天氣 API 或 Jira API 的 Skill，需要：**
1. 在 `tool-registry.ts` 手動新增工具定義
2. 在新的 `xxx-client.ts` 實作 HTTP 呼叫
3. 在 `skill-importer.ts` 的 `detectToolsFromContent()` 新增偵測規則

**這完全違背了「只透過 Agent Skills」的設計目標。**

##### 2. SKILL.md 包含的資訊量 — **足夠自動生成工具**

分析 ETL SKILL.md 的內容，每個 API 端點都包含：
- ✅ 端點 URL（如 `/api/etl/employee/search`）
- ✅ HTTP 方法（POST / GET）
- ✅ 參數名稱和描述（如 `gen01` 員工編號、`gen02` 員工姓名）
- ✅ 回傳欄位說明
- ✅ Base URL（`https://zpos-api-stage.zerozero.com.tw`）
- ✅ 認證方式（Bearer Token）
- ✅ Token 管理方式（30 分鐘過期、用帳密登入取得）

**結論：SKILL.md 已包含足夠資訊，讓 AI（或規則解析）自動生成 ToolDefinition + HTTP executor。**

##### 3. 動態架構設計提案

```
SKILL.md 匯入 → AI 解析 API 定義 → 儲存到 DB → 執行時動態生成工具

匯入階段：
  SKILL.md → AI 提取 → api_definitions JSON → 儲存到 skills 表

執行階段：
  skill.api_definitions → 動態生成 ToolDefinition[]
                       → 通用 HTTP executor 取代 erp-client.ts
```

**需要的改動：**

| 改動 | 說明 | 工作量 |
|------|------|--------|
| DB: skills 表新增 `api_config` 欄位 | 儲存完整的 API 定義 JSON（base_url、auth、endpoints） | ~20 行 |
| 新增 `src/dynamic-tool-builder.ts` | 從 `api_config` 動態生成 ToolDefinition[] | ~80 行 |
| 新增 `src/http-executor.ts` | 通用 HTTP executor（替代 erp-client.ts） | ~100 行 |
| 修改 `skill-importer.ts` | AI 提取 API 定義時輸出完整的 endpoint schema | ~60 行 |
| 修改 `skill-executor.ts` | 改為從 DB 動態載入工具定義 | ~30 行 |
| **可移除** `tool-registry.ts` | 不再需要靜態註冊 | -280 行 |
| **可移除** `erp-client.ts` | 被通用 HTTP executor 取代 | -250 行 |

**`api_config` JSON 格式設計：**
```json
{
  "base_url": "https://zpos-api-stage.zerozero.com.tw",
  "auth": {
    "type": "bearer_token",
    "login_endpoint": "/api/etl/auth/login",
    "credentials_service": "erp",
    "token_field": "token",
    "token_ttl_minutes": 30
  },
  "endpoints": [
    {
      "tool_name": "search_employee",
      "description": "搜尋員工資料",
      "method": "POST",
      "path": "/api/etl/employee/search",
      "parameters": [
        {"name": "gen01", "type": "string", "description": "員工編號"},
        {"name": "gen02", "type": "string", "description": "員工姓名"}
      ]
    },
    {
      "tool_name": "list_department",
      "description": "列出所有部門",
      "method": "GET",
      "path": "/api/etl/department",
      "parameters": []
    }
  ]
}
```

##### 4. 安全性與限制

| 風險 | 緩解方案 |
|------|---------|
| 動態 HTTP 請求可能打到惡意 URL | URL 白名單 / domain 驗證 |
| 認證資訊洩漏 | credentials 加密儲存、不記錄密碼到 log |
| API 回傳大量資料 | 限制回傳大小（truncate to 5000 chars） |
| Prompt injection via API 回傳 | 回傳內容標記為 tool_result，LLM 有 system prompt 優先權保護 |

##### 5. 最終結論

**YES — 動態 Agent Skills 架構完全可行。**

- SKILL.md 已包含足夠資訊自動生成工具
- LLM 的 tool calling 本身就支援動態工具定義（工具定義就是 JSON，不需要編譯時確定）
- 改為動態架構後，匯入任何新 Skill（天氣、Jira、CRM...）都不需要寫程式碼
- 工作量約 ~300 行新程式碼 + 刪除 ~530 行寫死的程式碼
- **建議分兩階段實施**：
  1. **Phase 1**（當前）：保持現有 ERP 寫死架構，先驗證 tool calling 端到端可行
  2. **Phase 2**（下一步）：重構為動態架構，實現真正的「只透過 Agent Skills」

---

#### 16d. 發現的問題總清單

| # | 問題 | 嚴重性 | 類別 | 建議 |
|---|------|--------|------|------|
| 1 | 重複匯入同名技能無防護 | ⚠️ 中 | 匯入 | 新增 DB 唯一約束或匯入前檢查 |
| 2 | 架構是「寫死」的，無法支援非 ERP 的 Skill | ⚠️ 高 | 架構 | Phase 2 重構為動態架構 |
| 3 | `detectToolsFromContent()` 只認 ERP 端點 | ⚠️ 中 | 匯入 | 動態架構後此函式可移除 |
| 4 | 匯入無用戶確認預覽步驟 | ⚠️ 低 | 匯入 | 未來加入確認對話 |
| 5 | Groq tool message 型別斷言可更嚴謹 | ⚠️ 低 | LLM | 加入 `role === 'tool'` 排除 |
| 6 | `set_erp_credentials` 可能重複加入 toolDefs | ⚠️ 低 | 執行 | 已有 `includes()` 檢查，但檢查的是 `toolNames` 不是 `toolDefs` |

---

## 下一步

### 短期（當前驗證）
1. 修復重複匯入問題（匯入前檢查同名技能是否已存在）
2. 端到端測試：提供 ERP 帳密 → 觸發查詢 → 確認回傳真實 API 資料
3. 修復 `set_erp_credentials` 重複加入的邊界問題

### 中期（Phase 2 動態架構）
1. 設計 `api_config` JSON schema
2. 實作 `dynamic-tool-builder.ts` + `http-executor.ts`
3. 修改 `skill-importer.ts`：AI 提取完整 API 定義
4. 移除 `tool-registry.ts` + `erp-client.ts`（寫死的程式碼）
5. 驗證：匯入一個全新的 Skill（如天氣 API）不需寫任何程式碼

---

### Round 8 研究（2026-02-08）— Agent Skills 動態架構深度測試

> 完整報告：`research/17-agent-skills-testing/README.md`

#### 17a. 技能匯入/刪除功能測試結果

**匯入**：基本正常，api_config 鏈路端到端完整（匯入提取→DB 儲存→查詢→解析→執行）。

**發現的問題：**

| # | 優先級 | 問題 |
|---|--------|------|
| P6 | **高** | 缺少技能更新功能（無 `updateSkill()`） |
| P7 | **高** | 重複匯入無防護（同 URL 建立多筆同名技能） |
| P3 | 中 | 匯入無使用者預覽確認（自動儲存） |
| P2 | 中 | 安全檢查 safe=false 時不阻擋匯入 |

**刪除**：正常（含 scheduled_tasks 級聯刪除）。缺少二次確認。

#### 17b. AI 造假資料根因分析

**tool_choice 傳遞路徑正確**（`toolChoice: 'any'` → Claude `tool_choice: {type:'any'}` / Groq `tool_choice: 'required'`）。

**五個根因（按嚴重度排序）：**

| # | 根因 | 嚴重度 |
|---|------|--------|
| A | **無 api_config 的技能完全沒有工具 → tool_choice 機制被繞過** | **致命** |
| C | System prompt「不要造假」指示只在 hasTools=true 時才出現 | **高** |
| B | parseApiConfig 靜默失敗，畸形 JSON 降級為無工具 | 中 |
| D | Groq tool_choice='required' 可靠性 ~90-95% | 中 |
| E | API 錯誤後 AI 可能在後續輪次編造回覆 | 低 |

**核心問題**：用戶自建的技能不會有 api_config → `hasTools=false` → 完全沒有工具也沒有防造假指示 → AI 100% 會造假。

**建議修復：**
1. `buildSkillSystemPrompt` 無論 hasTools 為何，都加入「不要編造數據，無法取得真實資料時誠實告知」
2. 無 api_config 且 prompt 提及 API 的技能，明確告知 AI「你無法存取外部 API」
3. API 呼叫失敗後加入更強的「不要猜測或編造」指示

#### 17c. Agent Skills 動態架構可行性評估

**結論：有條件可行（Conditionally Feasible）**

Phase 2 重構已完成，目前架構已經是動態的：
- `api_call` 通用工具（3 個參數：method/path/body）
- `http-executor` 自動處理 base_url 拼接和認證
- SKILL.md 全文保留為 skill.prompt，AI 自行閱讀決定呼叫哪個端點

**可行前提：**
1. SKILL.md 品質好（包含清晰的 API 文件）
2. Claude 模式 tool calling ~99% 可靠；Groq 需接受 5-10% 失敗率
3. 適合 RESTful JSON API + 簡單認證
4. SKILL.md 來源需可信

**需要改善：**
- P0：API response truncation（防 context 溢出）
- P0：path 參數驗證（禁止 `/../`、絕對 URL）
- P1：無工具技能的防造假 system prompt
- P1：Tool calling 失敗的 graceful fallback

---

### Round 9 研究（2026-02-08）— Gemini 模型防造假可行性

> 完整報告：`research/18-gemini-anti-fabrication/README.md`

#### 18a. Gemini Tool Calling 能力（`18-gemini-anti-fabrication/tool-calling.md`）
- ❌ **Gemini Tool Calling 可靠性不如 Claude**
- Gemini `mode: ANY` 成功率 ~85-95%，不如 Claude `tool_choice: any` (~99%)，未明顯優於 Groq (~90-95%)
- BFCL V4 排名：Claude 穩居前三，Gemini 未進前列
- Gemini 3 Preview 有 `thought_signature` 並行呼叫 bug，導致 400 錯誤
- 社群大量回報 function calling 不穩定：500 錯誤、靜默繞過、JSON 偽裝

#### 18b. Gemini 防造假 / Instruction Following（`18-gemini-anti-fabrication/anti-fabrication.md`）
- ❌ **Gemini 3 系列幻覺率極高**
- AA-Omniscience 基準：Gemini 3 Pro 幻覺率 **88%**，Claude 4.1 Opus 幻覺率最低
- Gemini 3 被設計為「優先保持有幫助性」，傾向猜測而非拒絕回答
- 社群大量回報 Gemini 3 忽略 System Prompt 指示
- Google 官方建議避免否定約束（「不要...」），但防造假本質就是否定約束
- Claude 系列更傾向在不確定時誠實說「不知道」

#### 18c. Google Search Grounding（差異化優勢）
- ✅ **唯一能讓無 API 技能取得真實數據的機制**
- Gemini 獨有功能：模型回應前自動搜尋 Google，取得可驗證的即時資訊
- 可與 Function Calling 組合使用，原生支援繁體中文
- 定價：Gemini 3 Flash 免費 5,000 search/day，超出 $14/1,000 查詢
- **可部分解決根因 A**（無 api_config 技能沒有工具→造假）：提供 Google Search 作為 fallback

#### 18d. API 整合可行性
- SDK：`@google/genai`（npm）或 OpenAI 相容模式
- Gemini 2.5 Flash 免費：10 RPM、250 RPD，月費 ~$0-1
- Gemini 3 Flash Preview 免費，Gemini 3 Pro Preview **無免費額度**
- 整合工作量：新增 Gemini provider ~150 行 + Grounding 邏輯 ~50 行

#### 18e. 綜合結論

**Gemini 不能透過更好的 Tool Calling 解決造假問題，但 Google Search Grounding 提供了其他 Provider 沒有的 fallback 機制。**

| 建議 | 說明 |
|------|------|
| ✅ 維持 Claude tool_choice: any 作為主力 | 最可靠 (~99%) |
| ✅ 有限度整合 Gemini Grounding | 僅用於無 API 技能的 Search fallback |
| ✅ 優先使用 Gemini 2.5 Flash | 穩定 + 免費 + 低成本 |
| ❌ 不用 Gemini 取代 Claude 做 Tool Calling | 可靠性不如 Claude |
| ❌ 不用 Gemini 3 Preview 做主力 | 幻覺率太高、指令遵循有問題 |

---

### Round 10 研究（2026-02-12）— Cerebras Cloud + 平台比較

#### 19a. Cerebras Cloud 免費模型研究 (`19-cerebras-cloud-models/`)

**結論：推薦有條件整合，Cerebras 值得作為第三個免費 LLM 提供者。**

##### 免費模型列表

| 模型 | Model ID | 參數量 | 速度 | Context (Free) | RPD | 狀態 |
|------|----------|--------|------|----------------|-----|------|
| **gpt-oss-120b** | `gpt-oss-120b` | 120B MoE | ~3,000 tok/s | 131K | 14,400 | **Production ✅** |
| **Qwen3 235B** | `qwen-3-235b-a22b-instruct-2507` | 235B MoE (22B active) | ~1,400 tok/s | 64K | 14,400 | Preview |
| **GLM-4.7** | `zai-glm-4.7` | 358B MoE (32B active) | ~1,000 tok/s | 200K | **100** | Preview |
| Qwen3 32B | `qwen-3-32b` | 32B | ~2,600 tok/s | 8K | 14,400 | **2026/02/16 停用** |
| Llama 3.3 70B | `llama-3.3-70b` | 70B | ~2,100 tok/s | 8K | 14,400 | **2026/02/16 停用** |

##### Tool Calling 評估

- ✅ API 格式為 **OpenAI 相容**（與 Groq 相同模式，改 baseURL 即可）
- ✅ 支援 **strict mode**（受限解碼，保證參數符合 JSON Schema）
- ✅ 支援平行工具呼叫
- GLM-4.7 在 BFCL (Berkeley Function Calling Leaderboard) **排名 #1**，tau2-Bench Telecom 96%
- gpt-oss-120b 原生支援 function calling、structured output

##### Tool Calling 可靠性比較

| 模型 | 估計可靠性 | 說明 |
|------|-----------|------|
| Claude Sonnet 4.5 | ~99% | 業界頂級 |
| **Cerebras GLM-4.7** | **~96-98%** | BFCL #1 + strict mode |
| **Cerebras gpt-oss-120b** | **~93-97%** | 原生 function calling |
| **Cerebras Qwen3 235B** | **~90-95%** | 參數量大，表現穩定 |
| Groq Qwen3 32B | ~90-95% | 現有免費方案 |

##### 防造假能力

- GLM-4.7 支援 interleaved thinking + preserved thinking → 有助於呼叫工具前推理
- gpt-oss-120b 支援 chain-of-thought + 可配置推理深度
- strict mode 可確保工具參數正確，減少呼叫失敗
- ⚠️ **GLM-4.7 免費方案 RPD 僅 100**，嚴重不適合日常使用

##### 整合建議

```
推薦模型組合：
├── 主力：gpt-oss-120b（Production、131K context、最快 3000 tok/s、RPD 14,400）
├── 智能備用：qwen-3-235b（更大模型、64K context、支援推理模式）
└── 特殊用途：zai-glm-4.7（工具呼叫最強、200K context、但 RPD 僅 100）

LLM 三層架構：
Layer 1: 免費快速 → Groq Qwen3 32B 或 Cerebras gpt-oss-120b
Layer 2: 免費智能 → Cerebras Qwen3 235B 或 GLM-4.7（限量）
Layer 3: 付費頂級 → Claude Haiku 4.5 / Sonnet 4.5
```

---

#### 19b. LINE / Telegram / Discord 平台比較 (`19-messaging-platform-comparison/`)

**結論：技術最佳 Telegram，市場最佳 LINE；建議 LINE 為主 + Telegram 為輔的雙平台策略。**

##### 延遲回應處理能力比較

| 特性 | LINE | Telegram | Discord |
|------|------|----------|---------|
| 「思考中」指示 | Loading Indicator (5-60秒) | sendChatAction (每5秒重發) | deferReply (原生) |
| 原地更新結果 | ❌ 不支援 | ✅ editMessageText | ✅ editReply |
| 串流輸出 | ❌ 不支援 | ✅ 可模擬 | ✅ 可模擬 |
| 中間進度回饋 | ❌ 需發新訊息 | ✅ edit 同一訊息 | ✅ editReply |
| 最大等待時間 | Loading 60秒 + Push | 無限 | 15 分鐘 |
| 訊息費用 | Push 計費 (200則/月免費) | **完全免費** | **完全免費** |

##### 綜合評分

| 維度 | LINE | Telegram | Discord |
|------|------|----------|---------|
| 延遲回應 UX | 6/10 | **9/10** | 8/10 |
| 中間狀態回饋 | 3/10 | **9/10** | 7/10 |
| 串流輸出能力 | 1/10 | **8/10** | 7/10 |
| 訊息成本 | 4/10 | **10/10** | **10/10** |
| 台灣市場觸及 | **10/10** | 3/10 | 2/10 |
| 個人助理 UX | **8/10** | 7/10 | 4/10 |
| **總分** | **44/80** | **63/80** | **53/80** |

##### 結論與建議

- **Telegram 技術最優**：訊息可編輯、完全免費、可模擬串流、無 token 過期問題
- **LINE 市場無可取代**：台灣 94% 滲透率、使用者無需安裝新 App
- **Discord 不適合**：社群導向、非個人助理場景、Slash Command 非自然語言
- **建議策略**：
  - 短期：優化 LINE（善用 Loading Indicator API、Reply 優先、Push 節制）
  - 中期：新增 Telegram 作為進階選項（開發測試 + 高頻使用者 + 串流輸出）
  - 不建議：放棄 LINE、以 Discord 為主、同時維護三平台

```
MyClaw 架構擴充方向：
├── LINE Channel   → 大眾使用者（簡單互動、觸及率優先）
└── Telegram Channel → 進階使用者（串流輸出、進度回饋、無成本限制）
```

---

## 下一步（更新版）

### 已完成
1. ✅ **防造假 system prompt 強化** — 無論 hasTools 為何都加入禁止造假指示
2. ✅ **API response truncation** — 限制 5000 字元防止 context 溢出
3. ✅ **path 參數驗證** — 禁止路徑遍歷和絕對 URL
4. ✅ 重複匯入防護（匯入前檢查同 source_url）
5. ✅ 新增 `updateSkill()` 功能

### 短期
6. 端到端測試：匯入 ERP SKILL.md → 設定帳密 → 觸發查詢 → 確認回傳真實 API 資料
7. 新增 Gemini Grounding provider（選填 `GEMINI_API_KEY`）
8. 無 API 技能執行時自動啟用 Google Search Grounding fallback
9. 🆕 整合 Cerebras Cloud 作為第三個免費 LLM 提供者（`CEREBRAS_API_KEY`，預設 gpt-oss-120b）
10. 🆕 優化 LINE 延遲回應 UX（Loading Indicator API + Reply 優先策略）

### 中期
11. 匯入預覽確認流程
12. 安全檢查阻擋（safe=false 時拒絕匯入）
13. 支援 Basic Auth
14. Credential 加密儲存
15. 🆕 新增 Telegram Channel 支援（MessageChannel 抽象接口 + Telegram Bot API 整合）
16. 🆕 Telegram 串流輸出（editMessageText 模擬逐字顯示）
17. 🆕 MCP 整合 Phase 1：基礎 MCP Client + Playwright MCP Server 連線
18. 🆕 MCP 整合 Phase 2：skill-executor MCP 工具路由 + Agent Skills 支援 MCP 工具
19. 🆕 MCP 整合 Phase 3：Browser 技能範本 + 圖片訊息回傳

---

### Round 11 研究（2026-02-18）— MCP 整合可行性

> 完整報告：`research/20-mcp-integration/`
> - `mcp-protocol-research.md` — MCP 協議規格與 SDK 生態
> - `mcp-integration-analysis.md` — MyClaw 架構整合點分析
> - `mcp-chrome-devtools-research.md` — Chrome DevTools MCP Server 研究

#### 20a. MCP 協議規格與 SDK 生態

**MCP (Model Context Protocol) 是 Anthropic 推出的開放協議標準，用於標準化 LLM 應用與外部工具的整合。**

##### 核心架構
- **Host/Client/Server 三層模型**：MyClaw 作為 Host，透過 Client 連接多個 MCP Servers
- **Transport 層**：stdio（本地子程序）和 Streamable HTTP（遠端服務）兩種標準
- **JSON-RPC 2.0 通訊**，Client 與 Server 維持有狀態連線

##### Tool Schema 高度相容
- **MCP、OpenAI、Anthropic 三者核心都是 JSON Schema**，轉換幾乎 1:1 映射
- MCP `inputSchema` ↔ MyClaw `input_schema`：只需重新命名 key，JSON Schema 內容完全相同
- 現有 `ToolDefinition` 介面無需修改，轉換函式只需 3 行

##### SDK 選擇
- 推薦 `@modelcontextprotocol/sdk` v1（穩定版），需 `zod` peer dependency
- v2 預計 2026 Q1 發布，拆分為 `@modelcontextprotocol/client` + `@modelcontextprotocol/server`

##### MCP Server 生態
- 3,000+ 個 MCP servers 已上線（registry.modelcontextprotocol.io）
- 官方 Reference Servers：Filesystem、Git、Memory、Fetch 等
- 知名社群 Servers：Chrome DevTools、Playwright、Figma、Slack 等

##### 限制
- ESM/CJS 互操作問題（MCP SDK 是 ESM，MyClaw 是 CommonJS）
- stdio transport 需管理子程序生命週期
- Zod 依賴（MyClaw 目前未使用）

#### 20b. MyClaw 架構整合點分析

**核心發現：現有架構天然適合 MCP 整合，改動極小。**

##### 整合架構圖

```
                          MCP Servers（全域管理）
                          ├── playwright (SSE/HTTP)
                          ├── filesystem (stdio)
                          └── custom-api (SSE)
                               │
                               ▼
┌─────────────────────────────────────────────────────┐
│  mcp-client.ts: McpClientManager（新增）              │
│  ├── connect() / disconnect()                        │
│  ├── listTools(serverName?) → ToolDefinition[]       │
│  └── callTool(prefixedName, args) → string           │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
┌──────────────────┐    ┌───────────────────────┐
│ dynamic-tool-    │    │ mcp-tool-adapter.ts   │
│ builder.ts       │    │ (新增)                 │
│ (不修改)          │    │ mcpTool→ToolDefinition│
│ api_call 工具    │    │ 名稱前綴管理            │
└────────┬─────────┘    └───────────┬───────────┘
         └────────┬─────────────────┘
                  ▼ 合併
┌──────────────────────────────────────────────────────┐
│  skill-executor.ts: executeSkill()（修改）             │
│  ├── toolDefs = [...apiCallTools, ...mcpTools]        │
│  └── Tool Calling Loop:                               │
│      ├── api_call      → http-executor.ts（原有）      │
│      ├── mcp__*        → mcp-client.ts callTool()     │
│      └── set_*_creds   → http-executor.ts（原有）      │
└──────────────────────────────────────────────────────┘
                  │
                  ▼
         llm.ts: chat()  ← 完全不需修改
```

##### 改動範圍

| 操作 | 檔案 | 說明 |
|------|------|------|
| **新增** | `mcp-client.ts` | MCP Client Manager，管理 server 連線、工具列表、工具呼叫 |
| **新增** | `mcp-tool-adapter.ts` | MCP tool → ToolDefinition 轉換、`mcp__{server}__{tool}` 名稱前綴 |
| **修改** | `config.ts` | 新增 `McpServerConfig` 型別 |
| **修改** | `skill-executor.ts` | Tool calling loop 新增 MCP 路由分支 |
| **修改** | `index.ts` | 啟動時初始化 McpClientManager |
| **不修改** | `llm.ts` | 只消費 ToolDefinition/ToolCall，MCP 完全透明 |
| **不修改** | `channel.ts`, `dynamic-tool-builder.ts`, `http-executor.ts`, `db.ts` | 無影響 |

##### Agent Skills 能否調用 MCP 工具？— **可以**

**推薦方案：全域 MCP Server + 技能選擇器**

- MCP servers 在 app 層全域管理（啟動時連線，常駐）
- 技能透過 `api_config.mcp_servers: ["playwright", "filesystem"]` 聲明使用哪些 server
- 執行時從全域 MCP manager 取得對應工具，合併到 toolDefs
- **向後完全相容**：沒有 `mcp_servers` 的技能行為不變

**不建議技能級管理 MCP server**：MCP 連線有狀態（stdio 進程或 SSE），每技能一個太浪費資源。

##### 全域 MCP 配置方式

```json
// mcp-servers.json（或環境變數 MCP_SERVERS）
{
  "servers": [
    {
      "name": "playwright",
      "transport": {
        "type": "sse",
        "url": "http://127.0.0.1:8080/sse"
      }
    },
    {
      "name": "filesystem",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/data"]
      }
    }
  ]
}
```

#### 20c. Chrome DevTools MCP Server 研究

**比較了 6 個主要實作，推薦 Microsoft Playwright MCP。**

##### 比較表

| 項目 | Google chrome-devtools-mcp | **Microsoft playwright-mcp** | ByteDance browser-mcp |
|------|---------------------------|------------------------------|----------------------|
| 工具數 | 26 | 19 核心 + 擴展 30+ | 21 + 2 vision |
| 核心方法 | Screenshot + DOM | **Accessibility Tree** | Accessibility + Vision |
| Transport | stdio 僅 | **stdio / SSE / HTTP** | stdio / SSE |
| 維護 | Google 官方 | **Microsoft 官方** | ByteDance |
| Headless | 是 | **是** | 是 |

##### 推薦 Playwright MCP 理由

1. **原生 SSE/HTTP transport** — MyClaw Server 可直接連線，無需 proxy
2. **Accessibility Tree 方法** — 不需 vision model，LLM token 用量低，與文字 LLM 完美搭配
3. **Microsoft 官方維護**，跨瀏覽器（Chromium/Firefox/WebKit）
4. **`--headless` 原生支援**，Server 部署友好

##### 部署架構

```
MyClaw Server (Express.js)
├── 現有：LLM Provider (Claude / Groq / Cerebras)
├── 現有：SQLite + skill-executor
└── 新增：MCP Client
      ↓ SSE (localhost:8080)
    Playwright MCP Server (--headless --port 8080)
      ↓ CDP
    Headless Chromium (~1GB RAM)
```

##### MyClaw 用例場景

| 場景 | 所需工具 | 優先度 |
|------|----------|--------|
| 網頁截圖 | navigate + screenshot | 高 |
| 資料擷取 | navigate + snapshot + evaluate | 高 |
| 表單填寫 | navigate + fill_form + click | 中 |
| 定時監控 | cron + navigate + getText | 中 |
| PDF 生成 | navigate + pdf_save | 低 |

##### 風險

| 風險 | 緩解 |
|------|------|
| Chrome 記憶體高（200-500 MB/實例） | 單實例模式、操作完關閉頁面 |
| 操作耗時（>5s） | 先回「處理中...」再 editMessage |
| 並發限制 | Queue 機制、per-user browser context |

#### 20d. 綜合結論與實作建議

##### MCP 整合可行性：✅ 高度可行

| 面向 | 結論 |
|------|------|
| Schema 相容 | MCP ↔ ToolDefinition 近乎 1:1，轉換極簡單 |
| 架構影響 | 新增 2 檔、修改 3 檔、不修改 6 檔，llm.ts 零改動 |
| Agent Skills 支援 MCP | ✅ 可行，透過 `api_config.mcp_servers` 聲明即可 |
| 向後相容 | 完全相容，無 MCP 配置時行為不變 |
| 新依賴 | `@modelcontextprotocol/sdk` + `zod`（2 個） |

##### 建議分三階段實施

**Phase 1：MCP Client 基礎建設**
- 新增 `mcp-client.ts` + `mcp-tool-adapter.ts`
- 修改 `config.ts`（McpServerConfig 型別）+ `index.ts`（初始化）
- 環境變數 `MCP_SERVERS` 或配置檔 `mcp-servers.json`
- 驗證：連線 MCP server、listTools()、callTool()

**Phase 2：skill-executor 整合**
- `skill-executor.ts` tool calling loop 新增 `mcp__*` 路由分支
- `api_config` 擴展 `mcp_servers?: string[]` 欄位
- 驗證：Agent Skill 透過 `mcp_servers: ["playwright"]` 調用瀏覽器工具

**Phase 3：Browser 技能範本 + 圖片回傳**
- 預建「網頁截圖」「資料擷取」等技能範本
- LINE/Telegram 圖片訊息回傳支援
- Playwright MCP Server Docker 化部署

---

### 21. Tavily MCP Server 整合研究（2026-02-24）

> 研究資料：`research/21-tavily-mcp-integration/`

#### 21a. 研究結論：✅ 可整合，改動極小

| 項目 | 結論 |
|------|------|
| **可行性** | ✅ 完全可行，已實測成功 |
| **Transport** | Tavily Remote MCP 使用 **Streamable HTTP**（MCP 規範 2025-03-26） |
| **SDK 相容** | `@modelcontextprotocol/sdk@1.26.0` 已內建 `StreamableHTTPClientTransport`，**無需升級** |
| **改動範圍** | 僅 2 個檔案（`config.ts` + `mcp-client.ts`），約 15 行 |
| **向下相容** | 完全相容，不影響現有 stdio/sse 連線 |
| **認證方式** | API Key 透過 URL query parameter（`?tavilyApiKey=xxx`） |
| **免費額度** | 每月 1,000 次 API 呼叫 |

#### 21b. Tavily MCP 提供 5 個工具

| 工具名稱 | 功能 | 必要參數 | 測試耗時 |
|----------|------|----------|----------|
| `tavily_search` | 即時網路搜尋 | `query` (string) | ~1 秒 |
| `tavily_extract` | 網頁內容擷取（Markdown） | `urls` (string[]) | ~0.3 秒 |
| `tavily_crawl` | 網站爬取 | `url` (string) | 未測 |
| `tavily_map` | 網站結構對映 | `url` (string) | 未測 |
| `tavily_research` | 綜合深度研究 | `input` (string) | 未測（預估 30-120s） |

注意：工具名稱使用**底線**（`tavily_search`），不是連字號。MyClaw 前綴機制 `mcp__tavily__tavily_search` 正常運作。

#### 21c. 實作方案

**Step 1：`config.ts` — 擴充 McpServerConfig**
```typescript
export interface McpServerConfig {
  name: string;
  transport:
    | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
    | { type: 'sse'; url: string; headers?: Record<string, string> }
    | { type: 'streamable-http'; url: string; headers?: Record<string, string> };  // 新增
}
```

**Step 2：`mcp-client.ts` — 新增 StreamableHTTPClientTransport**
```typescript
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// connectServer() 新增分支：
} else if (config.transport.type === 'streamable-http') {
  transport = new StreamableHTTPClientTransport(new URL(config.transport.url));
}
```

**Step 3：環境變數配置**
```env
MCP_SERVERS='[{"name":"tavily","transport":{"type":"streamable-http","url":"https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-dev-xxx"}}]'
```

**Step 4：技能建立**
建立使用 Tavily 的技能，`api_config.mcp_servers: ["tavily"]` 即可。

#### 21d. 注意事項

- `tavily_extract` 結果可能很長（7000+ 字元），現有 3000 字元截斷機制會生效，未來可考慮調整
- `tavily_research` 可能耗時 30-120 秒，建議搭配 Telegram `editMessage` UX 模式
- API Key 內嵌於 URL，不會存入 DB，透過 `MCP_SERVERS` 環境變數管理
- Streamable HTTP 支援 session（`Mcp-Session-Id`），SDK 自動處理
