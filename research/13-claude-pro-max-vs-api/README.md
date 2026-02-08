# 研究報告：Claude Pro/Max Plan 能否取代 Claude API？

**研究日期：** 2026 年 2 月 8 日
**研究代理人：** Agent B
**研究問題：** 用戶可以接入 Claude Pro/Max Plan 來使用 MyClaw，而不透過 Claude API 方式嗎？

---

## 結論摘要

**不行。Claude Pro/Max 訂閱方案與 Claude API 是完全獨立的產品線，無法讓第三方應用程式（如 LINE bot）透過訂閱方案呼叫 Claude。Anthropic 在 2026 年 1 月更進一步加強技術限制，封鎖所有第三方工具透過訂閱方案存取 Claude 的行為，並明確寫入使用條款中。MyClaw 的後端必須使用 Claude API（按 token 計費）或其他 LLM API。**

---

## 詳細分析

### 1. Claude Pro/Max Plan 的本質

Claude Pro 和 Max 是**消費者訂閱方案**，專為個人透過官方介面使用 Claude 而設計：

| 方案 | 月費 | 提供什麼 |
|------|------|----------|
| **Free** | $0 | claude.ai 網頁、手機 app，使用 Sonnet 4.5 和 Haiku 4.5，有嚴格用量限制 |
| **Pro** | $20/月 | 更高用量限制、優先存取、Claude Code CLI、Extended Thinking、Remote MCP、Research 工具、Google Workspace 整合 |
| **Max 5x** | $100/月 | Pro 的 5 倍用量（約 225+ 訊息/5小時）、Opus 4.6 存取、Agent Teams（研究預覽）、Cowork |
| **Max 20x** | $200/月 | Pro 的 20 倍用量、最高優先級 |

**關鍵認知：** 這些方案提供的是 claude.ai 網頁介面、Claude Desktop 應用程式、Claude Mobile 應用程式、以及 Claude Code CLI 的使用權。**不包含任何 API 存取權限或 API credits。**

> 來源：[Claude Help Center - Why separate payment for API?](https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console)

### 2. API 存取權限：完全獨立的系統

Anthropic 官方明確表示：

> "Claude paid plans give subscribers access to Claude on the web, desktop, and mobile, and offer enhanced features like more usage and priority access during high-traffic periods."
>
> "The Claude Console is our developer platform providing API keys and access to Claude models for building applications and integrations."
>
> "A paid Claude subscription enhances your chat experience but **doesn't include access to the Claude API or Console**."

API 的定價是完全獨立的按量計費系統：

| 模型 | 輸入 (per 1M tokens) | 輸出 (per 1M tokens) |
|------|----------------------|----------------------|
| Claude Opus 4.6 | $5.00 | $25.00 |
| Claude Sonnet 4.5 | $3.00 | $15.00 |
| Claude Haiku 4.5 | $0.80 | $4.00 |

即使用戶同時擁有 Max 訂閱和 API 帳戶，兩者的費用也是分別計算、互不影響。

> 來源：[Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)

### 3. 技術限制：第三方應用程式無法使用訂閱方案

#### 3.1 訂閱方案不提供 API Key

Pro/Max 方案透過 OAuth 認證讓用戶登入 claude.ai 和 Claude Code。這個認證機制**不產生可用於第三方應用程式的 API Key**。MyClaw 作為 LINE bot 後端，需要一個 `ANTHROPIC_API_KEY` 來呼叫 `api.anthropic.com`，而這個 key 只能從 Claude Console（開發者平台）取得，與訂閱方案無關。

#### 3.2 Anthropic 在 2026 年 1 月的技術封鎖

2026 年 1 月 9 日，Anthropic 實施了重大的技術封鎖措施：

- **封鎖第三方 harnesses**：一些第三方工具（如 OpenCode、Cursor 等）之前透過模擬 Claude Code CLI 的身份（spoofing headers），利用用戶的 Pro/Max 訂閱 OAuth token 來存取 Claude 模型。Anthropic 部署了伺服器端檢查機制，阻止這種行為。
- **技術成員確認**：Anthropic 的 Thariq Shihipar 確認公司已「加強對 Claude Code harness 偽裝的防護措施」。
- **影響範圍**：所有試圖透過非官方方式使用訂閱方案的第三方工具均被阻斷。

> 來源：[VentureBeat - Anthropic cracks down on unauthorized Claude usage](https://venturebeat.com/technology/anthropic-cracks-down-on-unauthorized-claude-usage-by-third-party-harnesses)
> 來源：[Agentic Coding Weekly - Claude Subscriptions No Longer Work with Third-Party Coding Agents](https://www.agenticcodingweekly.com/p/acw-8-claude-subscriptions-no-longer-work-with-third-party-coding-agents)

#### 3.3 為什麼 Anthropic 要封鎖？

1. **商業原因**：訂閱方案是為人類互動使用定價的。$200/月的 Max 方案如果透過 API 使用，相同的 token 消耗量可能要 $1,000-$3,650+。自動化代理會消耗遠超人類使用者的 token 量。
2. **技術原因**：Claude Code 會發送遙測數據（telemetry），幫助 Anthropic 除錯和提供支援。第三方 harnesses 不發送這些數據，導致 Anthropic 無法排查問題。
3. **安全原因**：某些第三方工具移除了速率限制，啟用了通宵自動運行的 loop，這不是訂閱方案設計的使用方式。

### 4. 官方政策：明確禁止

Anthropic 的消費者使用條款（2026 年 1 月更新）明確包含以下條款：

> "Except when you are accessing our Services via an Anthropic API Key or where we otherwise explicitly permit it, **to access the Services through automated or non-human means, whether through a bot, script, or otherwise**."

這意味著：
- 透過 API Key 存取 = **允許**（但需付 API 費用）
- 透過訂閱方案自動化存取（如讓 LINE bot 呼叫 Claude）= **違反使用條款**
- 違反者可能被停權或封號

> 來源：[Anthropic - Updates to Consumer Terms](https://www.anthropic.com/news/updates-to-our-consumer-terms)

### 5. MCP 和 Claude Desktop 的可能性

這是最常被詢問的「迂迴方案」，但結論是**不可行作為 LINE bot 後端**。

#### 5.1 MCP 的運作方式

MCP（Model Context Protocol）允許 Claude 連接外部工具和數據源：
- **Pro/Max/Team/Enterprise** 用戶可以在設定中添加 Custom Connectors（Remote MCP Server）
- Claude 可以透過 MCP 呼叫外部工具（讀取數據、執行操作等）

#### 5.2 LINE Bot MCP Server 確實存在

LINE 官方有一個 [line-bot-mcp-server](https://github.com/line/line-bot-mcp-server) 專案，提供 11 個工具讓 Claude 與 LINE Messaging API 互動（推送訊息、廣播、管理 Rich Menu 等）。

#### 5.3 為什麼 MCP 無法替代 MyClaw 後端

| 面向 | MCP 方式 | MyClaw 需求 |
|------|----------|-------------|
| **訊息方向** | Claude 主動呼叫工具（outbound only） | 需要接收 LINE 用戶訊息（inbound webhook） |
| **觸發方式** | 用戶在 claude.ai 中手動操作 | LINE 用戶發訊息自動觸發 |
| **多用戶** | 僅限 Claude 帳戶擁有者 | 需要服務多個 LINE 用戶 |
| **自動化** | 不支援自動回應 LINE 訊息 | 必須自動化回應 |
| **24/7 服務** | 需要人在 claude.ai 前面 | 需要伺服器常駐運行 |

**結論：** MCP 讓 Claude 可以「發送」LINE 訊息，但無法讓 Claude 「接收並自動回應」LINE 訊息。MyClaw 需要的是一個常駐伺服器監聽 LINE webhook、處理訊息、呼叫 LLM、再回傳結果 -- 這正是 API 的使用場景。

### 6. Claude Max 的最新功能（2026 年 2 月）

#### 6.1 Opus 4.6 及 $50 免費 credits 促銷

2026 年 2 月 5 日，Anthropic 發布了 Claude Opus 4.6，並提供 Pro/Max 用戶 **$50 免費 usage credits** 的促銷活動：
- 期限：2026 年 2 月 16 日前啟用「Extra usage」
- 適用範圍：Claude、Claude Code、Cowork
- 有效期：發放後 60 天
- **注意**：這是一次性促銷，不是持續福利

> 來源：[XDA - Claude users can now claim $50 in free credits to try Opus 4.6](https://www.xda-developers.com/psa-claude-users-can-claim-50-in-free-credits-to-try-opus-46/)

#### 6.2 Max 方案不包含 API Credits

即使是最貴的 $200/月 Max 方案，也**完全不包含**任何 API credits 或 token allowance。API 是獨立的預付費系統。

---

## 替代方案建議

既然 Pro/Max 訂閱無法用於 MyClaw，以下是降低成本的實際方案：

### 方案 A：維持現有混合架構（推薦）

```
Groq API (Qwen3 32B, 免費) → 處理 80% 日常對話
Claude API (Haiku 4.5)      → 處理 20% 複雜任務
預估月費：$0~3
```

**重點優化：** 使用 Claude Haiku 4.5（$0.80/$4.00 per 1M tokens）而非 Sonnet 或 Opus，大幅降低 fallback 成本。

### 方案 B：純 Groq 免費方案

```
Groq API (Qwen3 32B, 免費) → 處理 100% 對話
月費：$0
風險：極複雜任務品質可能下降
```

### 方案 C：利用 API 新用戶免費 Credits

- Anthropic API 新用戶可能獲得初始免費 credits
- 可以用於開發和測試階段
- 不是長期方案

### 方案 D：利用 Opus 4.6 促銷 Credits（限時）

- Pro/Max 用戶目前可領取 $50 免費 credits
- 但這些 credits 是用於 claude.ai 和 Claude Code，**不是 API credits**
- 對 MyClaw 後端無幫助

### 方案 E：考慮其他免費/低成本 LLM API

| 服務 | 模型 | 免費額度 | 適用性 |
|------|------|----------|--------|
| Groq | Qwen3 32B | 持續免費 | 主力 |
| Google AI Studio | Gemini 2.5 Flash | 免費 tier | 備用 |
| Mistral | Mistral Large | 有限免費 | 備用 |

---

## 用戶溝通建議

當用戶詢問「我已經有 Claude Pro/Max，能不能直接用？」時，建議這樣回應：

### 簡短版

> Claude Pro/Max 訂閱和 Claude API 是 Anthropic 的兩個完全獨立的產品。訂閱方案讓您在 claude.ai 網頁和手機 app 上使用 Claude，而 MyClaw 作為第三方應用程式，需要透過 Claude API 來呼叫 AI 模型，兩者的費用無法互通。但好消息是，MyClaw 主要使用免費的 Groq API，只有少數複雜任務才會用到 Claude API，預估月費只需 $0~3 美元。

### 詳細版

> **Q：我已經訂閱 Claude Pro/Max 了，為什麼不能直接用？**
>
> A：這是一個非常好的問題，很多人都有同樣的疑惑。Anthropic 把 Claude 分成兩個獨立的產品：
>
> 1. **Claude 訂閱方案**（Pro $20/月、Max $100-200/月）：讓您個人在 claude.ai 網站、手機 app、和 Claude Code 上使用 Claude。
> 2. **Claude API**（按用量計費）：讓開發者在自己的應用程式中呼叫 Claude 模型。
>
> MyClaw 是一個在 LINE 上運行的第三方應用程式，需要透過 API 來與 Claude 溝通。就像 Netflix 訂閱不能讓您在 YouTube 上看 Netflix 內容一樣，Claude 訂閱也不能讓第三方 app 使用 Claude。
>
> **但您不需要擔心成本**：MyClaw 的設計已經把成本降到最低。日常對話使用完全免費的 Groq API（Qwen3 32B 模型，中文能力優秀），只有特別複雜的任務才會使用 Claude API 作為備用。大多數用戶的 Claude API 月費會在 $0~3 美元之間。

### 重要提醒

不建議向用戶宣傳或暗示任何「繞過」訂閱限制的方法，因為：
1. 這違反 Anthropic 的使用條款
2. Anthropic 已經實施技術封鎖
3. 用戶帳戶可能被停權
4. 這不是可靠的長期解決方案

---

## 技術架構影響

本研究結果確認了 MyClaw 現有的架構設計是正確的：

```
LINE 用戶訊息
    ↓
MyClaw 後端（Node.js + Express）
    ↓
┌─────────────────────────────┐
│  LLM 路由邏輯                │
│  ├── 日常對話 → Groq API     │  ← 免費
│  │              (Qwen3 32B)  │
│  └── 複雜任務 → Claude API   │  ← 按量計費（$0~3/月）
│                 (Haiku 4.5)  │
└─────────────────────────────┘
    ↓
LINE Reply/Push Message
```

**不需要改動任何架構**。用戶的 Claude Pro/Max 訂閱與 MyClaw 的運作完全無關。

---

## 參考資料

1. [Claude Help Center - Why separate payment for API?](https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console)
2. [Claude Help Center - Using Claude Code with Pro/Max](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)
3. [Claude Pricing Page](https://claude.com/pricing)
4. [Claude API Pricing Documentation](https://platform.claude.com/docs/en/about-claude/pricing)
5. [VentureBeat - Anthropic cracks down on unauthorized Claude usage](https://venturebeat.com/technology/anthropic-cracks-down-on-unauthorized-claude-usage-by-third-party-harnesses)
6. [Agentic Coding Weekly - Claude Subscriptions No Longer Work with Third-Party Coding Agents](https://www.agenticcodingweekly.com/p/acw-8-claude-subscriptions-no-longer-work-with-third-party-coding-agents)
7. [Anthropic - Updates to Consumer Terms](https://www.anthropic.com/news/updates-to-our-consumer-terms)
8. [Claude Help Center - Custom Connectors via Remote MCP](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)
9. [LINE Bot MCP Server (GitHub)](https://github.com/line/line-bot-mcp-server)
10. [XDA - Claude users can claim $50 credits for Opus 4.6](https://www.xda-developers.com/psa-claude-users-can-claim-50-in-free-credits-to-try-opus-46/)
11. [Claude AI Pricing 2026 Guide](https://www.glbgpt.com/hub/claude-ai-pricing-2026-the-ultimate-guide-to-plans-api-costs-and-limits/)
12. [ClaudeLog - Claude API vs Subscription](https://claudelog.com/faqs/what-is-the-difference-between-claude-api-and-subscription/)
13. [Anthropic Blocks Claude Code in Third-Party Tools](https://www.techbuddies.io/2026/01/12/anthropic-tightens-control-over-claude-code-access-disrupting-third-party-harnesses-and-rival-labs/)
14. [Dev Genius - You might be breaking Claude's ToS](https://blog.devgenius.io/you-might-be-breaking-claudes-tos-without-knowing-it-228fcecc168c)
