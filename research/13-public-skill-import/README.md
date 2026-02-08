# 接入公開 Skills 的可行性與實現方式 — 研究報告

> 研究員 C | 2026-02-08
> 問題：用戶能否接入目前網路上已公開的 skills，而不用再自行建立呢？如果可行的話，用戶是自行貼上 GitHub 上的 skill 網址給 AI，讓 AI 自己處理嗎？

---

## 結論摘要

**一句話回答三個子問題：**

1. **能否接入公開 skills？** — **可以，但需要轉換格式。** 目前 AI 領域已有大量公開 skill 生態系統（Anthropic Agent Skills 標準已有 5,700+ 社群 skills、OpenAI Codex Skills Catalog、200+ awesome-agent-skills），但這些 skill 格式（SKILL.md + YAML frontmatter）與 MyClaw 的 JSON prompt-based skill 格式不同，需要建立「格式轉換層」。

2. **用戶貼 GitHub URL 讓 AI 處理可行嗎？** — **可行，且是最佳 MVP 方案。** 用戶貼上 GitHub URL 後，AI 可以 fetch 該檔案內容、解析 SKILL.md 格式、自動轉換為 MyClaw JSON skill 並儲存。這不涉及執行任何外部程式碼，安全風險極低。

3. **最小可行方案是什麼？** — **「Prompt-only 匯入」模式：** 只匯入 skill 的名稱、描述、觸發條件和 prompt 指令，不匯入任何可執行程式碼。這是最安全的做法，且完全符合 MyClaw 現有的 JSON skill 架構。

---

## 一、現有公開 Skill 生態系統分析

### 1.1 主要 Skill 生態系統一覽

| 生態系統 | 規模 | 格式 | 開放程度 | 與 MyClaw 相容性 |
|----------|------|------|----------|-----------------|
| **Anthropic Agent Skills** | 5,700+ skills (ClawHub) | SKILL.md + YAML | 完全開放標準 | **高** — 可轉換 prompt |
| **OpenAI Codex Skills** | 數百個 | SKILL.md (相同格式) | 開源 GitHub | **高** — 格式相同 |
| **VoltAgent Awesome Skills** | 200+ 精選 | SKILL.md | 社群策展 | **高** |
| **Awesome Claude Skills** | 數百個 | SKILL.md | 社群策展 | **高** |
| **Coze Bot Store** | 60+ 官方插件 | 專有格式 + API | 平台封閉 | **低** — API 格式不同 |
| **ChatGPT GPTs Store** | 數萬個 | 專有格式 | 平台封閉 | **低** — 無法匯出 |
| **MCP Servers** | 1,200+ | MCP Protocol | 開放標準 | **中** — 需要橋接層 |

### 1.2 Anthropic Agent Skills — 最值得關注的生態系統

Anthropic 在 2025 年 12 月 18 日將 Agent Skills 發布為開放標準，規格和 SDK 公開在 [agentskills.io](https://agentskills.io)。

**關鍵特點：**
- 已被 Microsoft、OpenAI、Cursor、GitHub、VS Code 等主要平台採用
- Skills 是純文字指令（SKILL.md），**不是可執行程式碼**
- 社群註冊表 ClawHub 已有 5,705 個社群 skills
- 格式簡單：YAML frontmatter（名稱 + 描述）+ Markdown 指令

**SKILL.md 標準格式範例：**
```yaml
---
name: daily-weather-report
description: >
  Fetches daily weather information and provides a concise report.
  Use when the user asks about weather or for daily briefings.
license: MIT
metadata:
  author: community
  version: "1.0"
---

# Daily Weather Report

## Instructions
1. Query the weather API for the user's configured city
2. Summarize temperature, precipitation chance, and UV index
3. Provide clothing/umbrella recommendation

## Output Format
- Keep it under 100 words
- Use friendly, conversational tone
- Include emoji for weather conditions
```

### 1.3 OpenAI Codex Skills Catalog

OpenAI 也建立了 skills 目錄（[github.com/openai/skills](https://github.com/openai/skills)），採用與 Anthropic 相同的 SKILL.md 格式。

**重要功能：skill-installer**
- 支援從 GitHub URL 直接安裝 skill
- 命令：`scripts/install-skill-from-github.py --url https://github.com/<owner>/<repo>/tree/<ref>/<path>`
- 自動解析 URL 中的 owner、repo、branch、path
- 支援 public 和 private repos

### 1.4 社群策展清單（Awesome Lists）

| 專案 | Stars | 內容 |
|------|-------|------|
| [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | 活躍 | 200+ 精選 skills，含 Anthropic、Google、Vercel 官方 skills |
| [awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) | 活躍 | Claude Code 專用 skills |
| [antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills) | 活躍 | 700+ battle-tested skills |
| [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) | 活躍 | 1,200+ MCP servers |

### 1.5 LINE Bot 專屬的公開 Skills

**現況：幾乎不存在。** GitHub 上的 LINE bot 專案多為整體框架/模板（如 [linebot-template-openai](https://github.com/kkdai/linebot-template-openai)），而非可獨立安裝的 skill 模組。

**但這不是問題。** MyClaw 的 skill 本質是「一段 prompt + 觸發條件」，與平台無關。一個「每日天氣摘要」skill 在 LINE、Telegram、Slack 上的 prompt 內容完全一樣，差別只在輸出格式。因此，**任何 AI assistant skill 都可以被 MyClaw 使用**，不限於 LINE 專屬。

---

## 二、GitHub URL 匯入機制的可行性

### 2.1 技術實現流程

```
用戶在 LINE 中傳送：
「安裝這個技能 https://github.com/anthropics/skills/tree/main/skills/code-review」

        ↓

AI 識別為 skill 安裝請求
        ↓

┌─────────────────────────────────────────────────────┐
│ Step 1: 解析 GitHub URL                              │
│   → owner: anthropics                                │
│   → repo: skills                                     │
│   → path: skills/code-review                         │
│   → 目標檔案: skills/code-review/SKILL.md            │
├─────────────────────────────────────────────────────┤
│ Step 2: Fetch SKILL.md 內容                          │
│   → GET https://raw.githubusercontent.com/           │
│     anthropics/skills/main/skills/code-review/       │
│     SKILL.md                                         │
├─────────────────────────────────────────────────────┤
│ Step 3: 解析 YAML frontmatter + Markdown body        │
│   → name: "code-review"                             │
│   → description: "Review code for bugs..."          │
│   → instructions: (Markdown body)                    │
├─────────────────────────────────────────────────────┤
│ Step 4: AI 轉換為 MyClaw JSON 格式                   │
│   → 判斷觸發類型（keyword/pattern/manual）           │
│   → 提取核心 prompt                                  │
│   → 生成 MyClaw skill JSON                          │
├─────────────────────────────────────────────────────┤
│ Step 5: 預覽並確認                                   │
│   → 向用戶展示轉換結果                               │
│   → 用戶確認後儲存                                   │
├─────────────────────────────────────────────────────┤
│ Step 6: 儲存到 users/{userId}/skills/                │
│   → 寫入 JSON 檔案                                  │
│   → 啟用 skill                                      │
└─────────────────────────────────────────────────────┘

        ↓

AI 回覆：「技能已安裝 ✅
  名稱：Code Review
  觸發：當你說「幫我 review」時啟動
  你可以隨時說「我的技能」來管理」
```

### 2.2 技術實現程式碼概念

```javascript
// skill-importer.js — 概念性實現

async function importSkillFromGitHub(userId, githubUrl) {
  // Step 1: 解析 GitHub URL
  const { owner, repo, branch, path } = parseGitHubUrl(githubUrl);

  // Step 2: Fetch SKILL.md 內容（使用 raw.githubusercontent.com）
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}/SKILL.md`;
  const response = await fetch(rawUrl);

  if (!response.ok) {
    return { error: '無法讀取該 skill，請確認 URL 正確且為公開倉庫' };
  }

  const skillMd = await response.text();

  // Step 3: 解析 YAML frontmatter
  const { frontmatter, body } = parseSkillMd(skillMd);

  // Step 4: 使用 AI 轉換為 MyClaw 格式
  const myClawSkill = await convertToMyClawFormat(frontmatter, body, userId);

  // Step 5: 儲存
  await saveSkill(userId, myClawSkill);

  return myClawSkill;
}

function parseGitHubUrl(url) {
  // 支援多種 GitHub URL 格式
  // https://github.com/owner/repo/tree/branch/path
  // https://github.com/owner/repo/blob/branch/path/SKILL.md
  const match = url.match(
    /github\.com\/([^/]+)\/([^/]+)\/(?:tree|blob)\/([^/]+)\/(.+)/
  );
  if (!match) throw new Error('Invalid GitHub URL');
  return { owner: match[1], repo: match[2], branch: match[3], path: match[4] };
}

function parseSkillMd(content) {
  // 解析 YAML frontmatter (--- ... ---)
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) throw new Error('Invalid SKILL.md format');

  const frontmatter = yaml.parse(fmMatch[1]);
  const body = fmMatch[2].trim();

  return { frontmatter, body };
}

async function convertToMyClawFormat(frontmatter, body, userId) {
  // 使用 AI 來智能判斷最佳觸發方式和 prompt 整理
  const conversionPrompt = `
    將以下 Agent Skill 轉換為 MyClaw LINE 助理技能格式。

    原始 Skill 資訊：
    名稱：${frontmatter.name}
    描述：${frontmatter.description}
    指令內容：${body}

    請生成 JSON 格式：
    {
      "name": "中文名稱",
      "trigger": { "type": "keyword|pattern|manual|always", "value": "觸發值" },
      "prompt": "整理後的中文指令",
      "enabled": true,
      "source": { "type": "github", "url": "原始URL", "version": "..." }
    }

    規則：
    1. name 翻譯為繁體中文
    2. 根據 skill 描述智能判斷最佳觸發方式
    3. prompt 保留完整指令，但適配為 LINE 對話情境
    4. 不要包含任何可執行程式碼
  `;

  const result = await callLLM(conversionPrompt);
  return JSON.parse(result);
}
```

### 2.3 安全風險分析

| 風險類別 | 嚴重程度 | MyClaw 影響 | 緩解措施 |
|----------|----------|-------------|----------|
| **任意程式碼執行** | 🔴 高 | **不適用** — MyClaw skills 是純 prompt，不執行程式碼 | 架構天然安全 |
| **Prompt 注入攻擊** | 🟡 中 | 惡意 skill 可能包含覆蓋系統指令的 prompt | 過濾 + 隔離（見下方） |
| **敏感資料洩漏** | 🟡 中 | 惡意 prompt 可能試圖讀取其他用戶的記憶 | 用戶隔離 + prompt 審查 |
| **API Key 曝露** | 🟢 低 | MyClaw 不在 skill 中儲存 API key | 不適用 |
| **過度資源消耗** | 🟢 低 | 惡意 skill 可能產生大量 API 呼叫 | 速率限制 |

**關鍵安全優勢：MyClaw 的 skill 是「prompt-only」設計。**

這與 OpenClaw/ClawHub 的情況有根本性不同。Snyk 在 2026 年 2 月的研究發現 ClawHub 上 7.1% 的 skills 包含認證資訊洩漏，76 個 skills 含有惡意 payload（竊取認證、安裝後門、資料外洩）。但這些攻擊都利用了**可執行腳本**（shell scripts、Python scripts）。

MyClaw 的 skill **僅由 JSON + prompt 組成**，不包含任何可執行程式碼，因此：
- 無法執行系統命令
- 無法存取檔案系統（超出 memory.md）
- 無法發起網路請求（除非 AI 有 tool calling 權限且被明確授權）

### 2.4 針對 Prompt 注入的防護措施

```javascript
// skill 匯入時的安全檢查
function validateImportedSkill(skill) {
  const dangerousPatterns = [
    /ignore.*previous.*instructions/i,
    /forget.*system.*prompt/i,
    /你是一個.*不再是/i,
    /disregard.*above/i,
    /new instructions/i,
    /override.*system/i,
    /read.*other.*user/i,
    /access.*all.*memory/i,
    /send.*to.*external/i,
    /execute.*command/i,
    /eval\s*\(/i,
    /require\s*\(/i,
  ];

  const warnings = [];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(skill.prompt)) {
      warnings.push(`偵測到可疑指令模式: ${pattern.source}`);
    }
  }

  // 限制 prompt 長度
  if (skill.prompt.length > 5000) {
    warnings.push('Prompt 超過 5000 字元限制');
  }

  return {
    safe: warnings.length === 0,
    warnings
  };
}
```

---

## 三、Skill Marketplace 設計方案比較

### 方案 A：社群 GitHub Repo（Curated List）

```
myclaw-community/awesome-skills/
├── README.md              # 技能目錄索引
├── daily-weather/
│   └── skill.json         # MyClaw 原生格式
├── smart-summary/
│   └── skill.json
├── expense-tracker/
│   └── skill.json
└── translation-helper/
    └── skill.json
```

| 面向 | 評估 |
|------|------|
| 開發成本 | ⭐ 極低 — 只需要一個 GitHub repo |
| 安全性 | ⭐⭐⭐ 高 — PR review 把關 |
| 用戶體驗 | ⭐⭐ 中 — 用戶需要自己找 URL |
| 擴展性 | ⭐⭐ 中 — 依賴維護者審核 |
| MVP 適合度 | ⭐⭐⭐ **最適合 MVP** |

### 方案 B：內建 Skill 商店（JSON 目錄）

```javascript
// 在 MyClaw 服務中內建一個 skill 目錄
const SKILL_CATALOG_URL =
  'https://raw.githubusercontent.com/myclaw/skill-catalog/main/catalog.json';

// catalog.json
{
  "version": "1.0",
  "skills": [
    {
      "id": "daily-weather",
      "name": "每日天氣報告",
      "description": "每天早上推送天氣資訊",
      "category": "生活",
      "popularity": 156,
      "url": "https://github.com/myclaw/skill-catalog/tree/main/skills/daily-weather"
    },
    // ...
  ]
}

// 用戶在 LINE 中：
// 用戶：「瀏覽技能商店」
// AI：「以下是熱門技能：
//   1. 🌤️ 每日天氣報告 (156 人使用)
//   2. 📝 智慧摘要 (134 人使用)
//   3. 💰 記帳助手 (98 人使用)
//   輸入數字安裝，或說「更多」查看全部」
```

| 面向 | 評估 |
|------|------|
| 開發成本 | ⭐⭐ 中 — 需要目錄 JSON + 瀏覽 UI |
| 安全性 | ⭐⭐⭐ 高 — 官方審核的 skills |
| 用戶體驗 | ⭐⭐⭐ **最佳** — LINE 內瀏覽安裝 |
| 擴展性 | ⭐⭐ 中 — 需要維護目錄 |
| MVP 適合度 | ⭐⭐ 中 — 需要多一些開發 |

### 方案 C：用戶分享 URL 機制

```
用戶 A 建立 skill → 分享為 URL → 用戶 B 在 LINE 中貼上 URL → AI 自動安裝

技術流程：
1. 用戶 A：「分享我的『記帳助手』技能」
2. AI 生成 JSON + base64 encoded URL 或 GitHub Gist
3. 用戶 A 把連結傳給朋友
4. 用戶 B 在 LINE 中貼上連結
5. AI 自動解析並安裝
```

| 面向 | 評估 |
|------|------|
| 開發成本 | ⭐ 低 — Gist API 或 base64 encoding |
| 安全性 | ⭐ 低 — 任何人都能分享任何 prompt |
| 用戶體驗 | ⭐⭐ 中 — 需要分享連結的管道 |
| 擴展性 | ⭐⭐⭐ 高 — 去中心化、自然成長 |
| MVP 適合度 | ⭐⭐ 中 |

### 推薦策略：分階段實施

```
MVP（第一版）: 方案 A + C 的混合
  → 建立 GitHub awesome-skills repo（10+ 預設 skills）
  → 支援用戶貼 GitHub URL 匯入
  → 支援用戶間 URL 分享

V2（第二版）: 加入方案 B
  → 在 LINE 中內建 skill 目錄瀏覽
  → 加入熱門排行、分類篩選
  → Flex Message 展示 skill 卡片

V3（第三版）: 整合外部生態
  → 支援直接匯入 Anthropic Agent Skills 格式
  → MCP server 橋接（進階用戶）
  → 社群評分和評論
```

---

## 四、MCP (Model Context Protocol) 整合可能性

### 4.1 MCP 現況

MCP 是 Anthropic 開發的開放協議，現已捐贈給 Linux Foundation，被 OpenAI、Google、Microsoft 等公司採用。目前有 1,200+ 個公開 MCP servers。

**MCP 架構：**
```
MCP Host (AI 應用) ─── MCP Client ─── MCP Server (提供工具)
     ↑                                      ↑
  MyClaw                          例如：天氣 API、資料庫、
  LINE Bot                        Google Calendar 等
```

### 4.2 MCP 與 MyClaw Skill 系統的差異

| 比較面向 | MyClaw Skill | MCP Server |
|----------|-------------|------------|
| 本質 | Prompt 指令 + 觸發條件 | 工具提供者（API 端點） |
| 執行方式 | AI 讀取 prompt 後回應 | AI 呼叫工具執行動作 |
| 部署要求 | 無（純 JSON） | 需要執行 server 程式 |
| 安全性 | 高（無程式碼執行） | 中（需要信任 server） |
| 適用場景 | 對話模式、提醒、格式化 | 資料查詢、外部操作 |
| 用戶門檻 | 零門檻 | 需要技術知識部署 |

### 4.3 整合可能性

**短期（MVP）：不建議整合 MCP。**

原因：
1. MCP server 需要持續執行的 process，增加部署複雜度
2. 用戶需要技術知識來設定 MCP server
3. MyClaw 目標用戶是「非技術使用者」，MCP 不符合定位
4. 增加的基礎設施成本（記憶體、CPU）與免費方案衝突

**中長期（V3+）：可選擇性整合。**

```
方案 A（輕量橋接）：
  - 官方預設幾個常用 MCP servers
  - 例如：天氣 MCP、Google Calendar MCP
  - 用戶無感知，AI 背後自動呼叫
  - MyClaw 作為 MCP Host

方案 B（進階用戶模式）：
  - 開放進階用戶自行設定 MCP server
  - 在 LINE 中輸入 MCP server 配置
  - 類似 Claude Desktop 的 JSON 配置方式
```

### 4.4 更實際的替代方案：Tool Calling

MyClaw 已經規劃使用 Qwen3 32B 的 Tool Calling 功能。與其整合 MCP，不如：

```javascript
// MyClaw 內建 tools（不需要 MCP）
const BUILT_IN_TOOLS = {
  web_search: async (query) => { /* 搜尋 */ },
  memory_read: async (userId, section) => { /* 讀記憶 */ },
  memory_write: async (userId, section, content) => { /* 寫記憶 */ },
  get_weather: async (city) => { /* 天氣 API */ },
  get_time: async (timezone) => { /* 時間 */ },
};

// Skill 可以宣告需要哪些 tools
{
  "name": "每日天氣報告",
  "tools": ["get_weather", "memory_read"],
  "prompt": "使用 get_weather 查詢用戶的城市天氣..."
}
```

這比 MCP 簡單得多，且對非技術用戶更友善。

---

## 五、具體實現建議

### 5.1 推薦的 Skill 匯入流程

```
┌──────────────────────────────────────────────────────────────┐
│                    Skill 匯入完整流程                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  入口 1: 用戶貼 GitHub URL                                   │
│  「安裝 https://github.com/.../skills/weather-report」       │
│           ↓                                                  │
│  AI 偵測到 URL + 安裝意圖                                    │
│           ↓                                                  │
│  Fetch SKILL.md 或 skill.json                                │
│           ↓                                                  │
│  ┌────────────────────┐                                      │
│  │ 解析 + 安全檢查     │                                      │
│  │ • 格式驗證          │                                      │
│  │ • Prompt 注入掃描   │                                      │
│  │ • 長度限制          │                                      │
│  └────────┬───────────┘                                      │
│           ↓                                                  │
│  AI 轉換為 MyClaw JSON 格式                                  │
│           ↓                                                  │
│  ┌────────────────────┐                                      │
│  │ 用戶預覽確認        │                                      │
│  │ 「即將安裝：        │                                      │
│  │  名稱：每日天氣報告  │                                      │
│  │  觸發：每天 08:00   │                                      │
│  │  功能：查詢天氣...  │                                      │
│  │  [確認安裝] [取消]」│                                      │
│  └────────┬───────────┘                                      │
│           ↓                                                  │
│  儲存 skill.json                                             │
│           ↓                                                  │
│  「技能已安裝 ✅」                                            │
│                                                              │
│                                                              │
│  入口 2: 瀏覽技能目錄                                        │
│  「瀏覽技能商店」                                             │
│           ↓                                                  │
│  Fetch catalog.json from GitHub                              │
│           ↓                                                  │
│  展示 Flex Message 技能卡片                                  │
│           ↓                                                  │
│  用戶選擇 → 同上安裝流程                                    │
│                                                              │
│                                                              │
│  入口 3: 朋友分享                                            │
│  朋友傳來：「myclaw://skill/abc123」                         │
│           ↓                                                  │
│  解碼 skill 內容                                             │
│           ↓                                                  │
│  安全檢查 → 預覽確認 → 安裝                                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 JSON Schema 設計

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "MyClaw Skill",
  "type": "object",
  "required": ["id", "name", "trigger", "prompt"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^[a-z0-9-]+$",
      "description": "技能唯一識別碼"
    },
    "name": {
      "type": "string",
      "maxLength": 50,
      "description": "技能名稱（繁體中文）"
    },
    "description": {
      "type": "string",
      "maxLength": 200,
      "description": "技能簡述"
    },
    "trigger": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": {
          "type": "string",
          "enum": ["cron", "keyword", "pattern", "always", "manual"]
        },
        "value": {
          "type": "string",
          "description": "觸發值（cron 表達式、關鍵字、正則等）"
        }
      }
    },
    "prompt": {
      "type": "string",
      "maxLength": 5000,
      "description": "AI 執行指令"
    },
    "tools": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["web_search", "memory_read", "memory_write", "get_weather", "get_time"]
      },
      "description": "技能可使用的工具"
    },
    "output_format": {
      "type": "string",
      "enum": ["text", "flex_message"],
      "default": "text"
    },
    "enabled": {
      "type": "boolean",
      "default": true
    },
    "source": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": ["user_created", "github_import", "catalog", "shared"]
        },
        "url": {
          "type": "string",
          "format": "uri"
        },
        "imported_at": {
          "type": "string",
          "format": "date-time"
        },
        "original_format": {
          "type": "string",
          "enum": ["myclaw_json", "agent_skill_md", "custom"]
        }
      },
      "description": "技能來源資訊（追溯用）"
    },
    "created_at": {
      "type": "string",
      "format": "date-time"
    },
    "updated_at": {
      "type": "string",
      "format": "date-time"
    }
  }
}
```

**轉換後的 skill 範例：**

```json
{
  "id": "daily-weather",
  "name": "每日天氣報告",
  "description": "每天早上推送今天的天氣資訊和穿衣建議",
  "trigger": {
    "type": "cron",
    "value": "0 7 * * *"
  },
  "prompt": "查詢用戶所在城市今天的天氣狀況。包含溫度、降雨機率、紫外線指數。用友善的語氣提供穿衣和帶傘建議。回覆控制在 100 字以內。",
  "tools": ["get_weather", "memory_read"],
  "output_format": "text",
  "enabled": true,
  "source": {
    "type": "github_import",
    "url": "https://github.com/myclaw/skill-catalog/tree/main/skills/daily-weather",
    "imported_at": "2026-02-08T10:00:00Z",
    "original_format": "agent_skill_md"
  },
  "created_at": "2026-02-08T10:00:00Z"
}
```

### 5.3 安全措施總覽

```
┌─────────────────────────────────────────────────────────┐
│                    安全防護層級                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Layer 1: 架構層面（天然安全）                            │
│  ├── Skills 是純 prompt/JSON，不執行程式碼               │
│  ├── 用戶記憶完全隔離（不同 userId 目錄）                │
│  └── AI 工具權限受限（白名單制）                         │
│                                                         │
│  Layer 2: 匯入時檢查                                    │
│  ├── YAML/JSON 格式驗證                                 │
│  ├── Prompt 注入模式掃描（危險關鍵字偵測）               │
│  ├── 長度限制（prompt ≤ 5000 字元）                     │
│  ├── 工具權限限制（只允許白名單工具）                    │
│  └── 來源記錄（保留 GitHub URL 供追溯）                  │
│                                                         │
│  Layer 3: 執行時防護                                    │
│  ├── System Prompt 優先權保護                            │
│  │   （系統指令 > 技能 prompt > 用戶輸入）               │
│  ├── API 速率限制（每用戶每小時 N 次）                   │
│  ├── 回應長度限制（防止 token 濫用）                     │
│  └── 異常偵測（突然的行為變化警告）                      │
│                                                         │
│  Layer 4: 用戶控制                                      │
│  ├── 安裝前預覽（用戶必須確認）                          │
│  ├── 隨時停用/刪除技能                                  │
│  └── 「檢舉」機制（社群回報惡意 skill）                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 5.4 MVP 階段最小實現建議

**最小可行的 Skill 匯入功能，只需要新增以下功能：**

```
MVP Skill Import 清單：
━━━━━━━━━━━━━━━━━━━

✅ 必須做（Day 1-2 可完成）：
  1. GitHub URL 解析器（parseGitHubUrl 函數，約 20 行）
  2. SKILL.md fetcher（fetch raw content，約 15 行）
  3. YAML frontmatter 解析（使用 gray-matter 套件，約 10 行）
  4. AI 格式轉換（讓 AI 生成 MyClaw JSON，現有 AI 能力即可）
  5. 安全性基本檢查（危險關鍵字掃描，約 30 行）
  6. 預覽確認訊息（Flex Message，約 20 行）

📁 預設技能庫（Day 0，一次性準備）：
  7. 建立 GitHub repo：myclaw/skill-catalog
  8. 放入 10 個預設 skills（天氣、摘要、翻譯、記帳等）
  9. catalog.json 目錄索引

⏸️ 延後做（V2）：
  - LINE 內瀏覽 skill 商店 UI
  - 用戶間分享機制
  - 熱門排行
  - 評分/評論
  - MCP 整合

預估新增程式碼量：約 100-150 行
依賴套件：gray-matter（YAML 解析）、node-fetch
```

### 5.5 用戶操作流程示意

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
場景 1：用戶從 GitHub 安裝技能
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

用戶：安裝這個技能
      https://github.com/myclaw/skill-catalog/tree/main/skills/smart-summary

AI：  我幫你看了一下這個技能的內容 📋

      技能名稱：智慧摘要
      功能：自動將你傳送的網址或長文摘要成 3-5 個重點
      觸發方式：當你傳送 URL 時自動啟動

      要安裝嗎？
      [確認安裝] [取消]

用戶：確認安裝

AI：  技能已安裝 ✅

      「智慧摘要」已啟動！
      從現在起，你只要傳送任何網址，
      我就會自動幫你摘要重點。

      試試看吧！傳一個連結給我 🔗

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
場景 2：用戶瀏覽技能目錄
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

用戶：有什麼技能可以安裝？

AI：  以下是熱門技能推薦：

      🌤️ 每日天氣報告 — 每天早上推送天氣和穿衣建議
      📝 智慧摘要 — 傳連結自動摘要重點
      🌐 翻譯助手 — 說「翻譯」即時翻譯
      💰 記帳助手 — 說「花了 XX 元」自動記帳
      ⏰ 提醒事項 — 說「提醒我」設定提醒
      📰 新聞摘要 — 每天早上推送新聞重點

      輸入數字安裝，或說「更多」查看全部。
      你也可以直接貼 GitHub 連結安裝其他技能。

用戶：1

AI：  正在安裝「每日天氣報告」...

      需要一些設定：你在哪個城市？

用戶：台北

AI：  技能已安裝 ✅

      「每日天氣報告」已啟動！
      每天早上 7:00 會推送台北的天氣給你。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
場景 3：用戶分享技能給朋友
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

用戶：分享我的「記帳助手」技能

AI：  已生成分享連結 🔗

      你的朋友只要在他的 MyClaw 中傳送這段連結，
      就能安裝你的「記帳助手」技能：

      https://github.com/gist/abc123

      或者直接把以下訊息轉傳給朋友：

      「嘿！試試這個記帳技能，超方便的：
       安裝技能 https://github.com/gist/abc123」
```

---

## 六、與業界標準的關係圖

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Agent 標準生態系 (2026)                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Agent Skills  │    │   MCP        │    │    A2A       │  │
│  │ (Anthropic)   │    │ (Anthropic→  │    │  (Google)    │  │
│  │              │    │  Linux Found) │    │              │  │
│  │ 技能格式標準  │    │ 工具連接協議  │    │ Agent 間通訊 │  │
│  │ SKILL.md     │    │ Tool/Resource │    │ 任務協作     │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │          │
│         │   MyClaw 可整合的層級                    │          │
│         │                   │                   │          │
│    ┌────▼────┐         ┌────▼────┐         ┌────▼────┐    │
│    │ ✅ MVP  │         │ ⏸️ V3+  │         │ ❌ 不需要│    │
│    │ 格式轉換 │         │ 選擇性   │         │ 超出範圍 │    │
│    │ 即可使用 │         │ 橋接     │         │         │    │
│    └─────────┘         └─────────┘         └─────────┘    │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐                      │
│  │ AGENTS.md    │    │ Open Agent   │                      │
│  │ (OpenAI)     │    │ Spec (Oracle)│                      │
│  │ 專案級指令   │    │ Agent 定義   │                      │
│  └──────────────┘    └──────────────┘                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 七、風險與注意事項

| 風險 | 嚴重程度 | 緩解策略 |
|------|----------|----------|
| 匯入的 skill prompt 包含注入攻擊 | 中 | 關鍵字掃描 + 預覽確認 + System Prompt 優先權 |
| GitHub API rate limit（60 次/小時無認證） | 低 | 快取 + 只在安裝時 fetch |
| 外部 skill 的中文品質不佳 | 中 | AI 轉換時自動翻譯和調整 |
| skill 格式未來標準變更 | 低 | 抽象轉換層，只需更新解析器 |
| 用戶安裝過多 skills 導致衝突 | 中 | 限制最大 skill 數量（例如 20 個）+ 衝突偵測 |
| ClawHub 等平台的惡意 skills | 高 | 建議只從官方 catalog 安裝；外部來源顯示警告 |

---

## 八、最終建議

### MVP 階段行動清單

```
優先級 1（必做，開發量約 1 天）：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ 建立 myclaw/skill-catalog GitHub repo
  └── 放入 10 個預設 skill JSON 檔案
  └── 建立 catalog.json 索引

□ 實現 GitHub URL 匯入功能
  └── URL 解析 → fetch → 轉換 → 儲存
  └── 約 100 行程式碼

□ 實現「瀏覽技能」指令
  └── 讀取 catalog.json → 列表展示
  └── 約 50 行程式碼

優先級 2（建議做，開發量約 0.5 天）：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ Prompt 安全檢查
  └── 危險關鍵字掃描
  └── 約 30 行程式碼

□ 安裝預覽確認 UI
  └── Flex Message 卡片
  └── 約 20 行程式碼

優先級 3（可延後到 V2）：
━━━━━━━━━━━━━━━━━━━━━━━
□ 用戶間分享機制（Gist 或 base64 URL）
□ 技能商店 Flex Message UI
□ 熱門排行和分類
□ 評分/評論系統
□ MCP server 橋接
```

### 一句話總結

> **MyClaw 的 prompt-only skill 架構是一個巨大的安全優勢。** 只要建立一個簡單的「GitHub URL → fetch SKILL.md → AI 轉換為 JSON → 儲存」流程（約 100 行程式碼），用戶就能接入數千個公開的 Agent Skills，而完全不需要擔心程式碼執行的安全風險。MVP 階段建議先建立官方 skill catalog repo + URL 匯入功能，這是投入產出比最高的方案。

---

## 參考來源

- [Anthropic Agent Skills 開放標準](https://venturebeat.com/technology/anthropic-launches-enterprise-agent-skills-and-opens-the-standard) — VentureBeat
- [Agent Skills 官方規格](https://agentskills.io/home) — agentskills.io
- [Agent Skills GitHub 倉庫](https://github.com/anthropics/skills) — Anthropic
- [SKILL.md 格式規格](https://deepwiki.com/anthropics/skills/2.2-skill.md-format-specification) — DeepWiki
- [OpenAI Skills Catalog](https://github.com/openai/skills) — OpenAI
- [OpenAI Skill Installer](https://github.com/openai/skills/blob/main/skills/.system/skill-installer/SKILL.md) — OpenAI
- [VoltAgent Awesome Agent Skills](https://github.com/VoltAgent/awesome-agent-skills) — VoltAgent
- [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers) — 社群
- [MCP Servers 官方倉庫](https://github.com/modelcontextprotocol/servers) — Model Context Protocol
- [MCP 規格 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25) — modelcontextprotocol.io
- [Awesome MCP Directory (1200+)](https://mcp-awesome.com/) — mcp-awesome.com
- [Coze Bot Store](https://www.coze.com/docs/guides/store_bot?_lang=en) — Coze
- [Coze Plugin Store](https://www.coze.com/docs/guides/store_plugin?_lang=en) — Coze
- [OpenSkills — 通用 Skills 載入器](https://github.com/numman-ali/openskills) — npm
- [Skillshare — AI CLI Skills 同步工具](https://github.com/runkids/skillshare) — runkids
- [ClawHub 公開 Skill 註冊表](https://clawhub.ai/) — OpenClaw
- [ToxicSkills — ClawHub 安全漏洞研究](https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/) — Snyk
- [OpenClaw 安全風險報告](https://www.theregister.com/2026/02/05/openclaw_skills_marketplace_leaky_security) — The Register
- [Google A2A 協議](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/) — Google
- [Open Agent Specification](https://arxiv.org/abs/2510.04173v3) — Oracle/arXiv
- [Agent Sandbox Skill](https://github.com/disler/agent-sandbox-skill) — GitHub
- [Awesome Claude Skills](https://github.com/travisvn/awesome-claude-skills) — 社群
- [Claude Agent Skills 深度分析](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/) — Lee Han Chung
- [LangChain — Using Skills with Deep Agents](https://blog.langchain.com/using-skills-with-deep-agents/) — LangChain
- [OWASP LLM Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) — OWASP
- [MCP for Chat-Bots](https://medium.com/@tauqeer_ahmad/mcp-for-chat-bots-ce1aa3620e2f) — Medium
- [Awesome GPT Store](https://github.com/Anil-matcha/Awesome-GPT-Store) — GitHub
