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

## 下一步

準備好開始實作時，可以說「開始寫代碼」，我會：
1. 建立新專案目錄 + devcontainer.json
2. 初始化 package.json + Dockerfile
3. 按照 MVP 計畫逐步實現
4. 設定 Railway 一鍵部署按鈕
5. 建立 `npx create-line-assistant` 腳手架工具
