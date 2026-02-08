# Gemini API 整合可行性研究

> 研究日期：2026-02-08
> 研究範圍：Gemini 2.5 Pro / Gemini 3 Flash Preview / Gemini 3 Pro Preview 整合至 MyClaw

---

## 1. API 定價

### 1.1 各模型價格一覽（per 1M tokens）

| 模型 | Input (<=200K) | Input (>200K) | Output (<=200K) | Output (>200K) | Free Tier |
|------|---------------|---------------|-----------------|-----------------|-----------|
| **Gemini 3 Pro Preview** | $2.00 | $4.00 | $12.00 | $18.00 | 無（Preview 期間部分免費） |
| **Gemini 3 Flash Preview** | $0.50 | N/A | $3.00 | N/A | 有 |
| **Gemini 2.5 Pro** | $1.25 | $2.50 | $10.00 | $15.00 | 有（5 RPM / 100 RPD） |
| **Gemini 2.5 Flash** | $0.30 | N/A | $2.50 | N/A | 有（10 RPM / 250 RPD） |

### 1.2 Free Tier 額度

| 模型 | RPM | RPD | TPM |
|------|-----|-----|-----|
| Gemini 2.5 Pro | 5 | 100 | 250,000 |
| Gemini 2.5 Flash | 10 | 250 | 250,000 |
| Gemini 3 Pro Preview | 10 | 100 | 250,000 |
| Gemini 3 Flash Preview | ~10 | ~250 | 250,000 |

> 注意：Gemini 3 Flash Preview 的 Free Tier 限制官方未明確列出完整數字，上述為社群回報的近似值。

### 1.3 Paid Tier 額度（Tier 1）

| 模型 | RPM | RPD | TPM |
|------|-----|-----|-----|
| Gemini 2.5 Pro | 150 | 1,000 | 1,000,000 |
| Gemini 2.5 Flash | 300 | 1,500 | 2,000,000 |

### 1.4 與現有 Provider 對比

| Provider | 模型 | Input / MTok | Output / MTok | Free Tier | 適用場景 |
|----------|------|-------------|--------------|-----------|---------|
| **Groq** | Qwen3 32B | $0 | $0 | 30 RPM / 14,400 RPD | 免費主力 |
| **Claude** | Haiku 4.5 | $0.80 | $4.00 | 無 | 品質優先 |
| **Claude** | Sonnet 4.5 | $3.00 | $15.00 | 無 | 複雜任務 |
| **Gemini** | 3 Flash Preview | $0.50 | $3.00 | 有（~10 RPM / ~250 RPD） | 高性價比 |
| **Gemini** | 2.5 Pro | $1.25 | $10.00 | 有（5 RPM / 100 RPD） | 推理任務 |
| **Gemini** | 2.5 Flash | $0.30 | $2.50 | 有（10 RPM / 250 RPD） | 最便宜付費 |

### 1.5 月費估算（50-200 對話/天）

假設每次對話平均 1,500 input tokens + 500 output tokens：

| 模型 | 100 對話/天 | 200 對話/天 |
|------|-----------|-----------|
| Groq Qwen3 32B | **$0** | **$0** |
| Claude Haiku 4.5 | ~$4.80 | ~$9.60 |
| Gemini 2.5 Flash | ~$1.70 | ~$3.40 |
| Gemini 3 Flash Preview | ~$4.00 | ~$8.00 |
| Gemini 2.5 Pro | ~$20.95 | ~$41.90 |
| Claude Sonnet 4.5 | ~$36.00 | ~$72.00 |

**結論**：Gemini 2.5 Flash 在付費模型中性價比最高（$1.70/月 @ 100對話/天），且有 Free Tier。Gemini 3 Flash Preview 價格介於 Claude Haiku 和 Groq 之間，但有 Free Tier 優勢。

---

## 2. SDK 與整合方式

### 2.1 兩種整合路徑

#### 路徑 A：OpenAI 相容模式（推薦用於 MyClaw）

Gemini API 提供 OpenAI 相容端點，可直接使用 MyClaw 已有的 OpenAI SDK：

```typescript
import OpenAI from 'openai';

const geminiClient = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

const response = await geminiClient.chat.completions.create({
  model: 'gemini-3-flash-preview',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
  ],
  tools: [...],           // OpenAI 格式 tools
  tool_choice: 'auto',   // 支援 auto/required/none
  stream: true,          // 支援 streaming
});
```

**baseURL**: `https://generativelanguage.googleapis.com/v1beta/openai/`

**支援的 OpenAI 相容功能**：
- Chat Completions (messages, system/user/assistant/tool roles)
- Tool Calling / Function Calling（OpenAI 格式）
- Streaming（`stream: true`）
- Structured Output（JSON schema via response_format）
- Embeddings
- Image understanding（multimodal）
- `tool_choice`：auto / required / none

**限制**：
- 仍在 Beta 階段，部分進階參數可能不支援
- Tool calling + Streaming 組合有已知穩定性問題
- 無法使用 Gemini 原生特有功能（如 Thinking Config 的精細控制）

#### 路徑 B：@google/genai 原生 SDK

```typescript
import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: 'gemini-3-flash-preview',
  contents: 'Hello!',
  config: {
    systemInstruction: 'You are a helpful assistant.',
    tools: [{
      functionDeclarations: [{
        name: 'get_weather',
        description: 'Get weather for a location',
        parameters: {
          type: Type.OBJECT,
          properties: {
            location: { type: Type.STRING, description: 'City name' },
          },
          required: ['location'],
        },
      }],
    }],
    toolConfig: {
      functionCallingConfig: { mode: 'ANY' },  // AUTO / ANY / NONE / VALIDATED
    },
  },
});
```

**SDK 資訊**：
- 套件名：`@google/genai`（v1.40.0，2026-02-06 發布）
- Node.js 需求：20+（與 MyClaw 相容）
- 支援 CommonJS 和 ESM
- 完整 TypeScript 類型定義

**Function Calling Modes（等同 tool_choice）**：
| Gemini Mode | OpenAI 等價 | 行為 |
|------------|-----------|------|
| AUTO | auto | 模型自行決定 |
| ANY | required | 強制使用工具 |
| NONE | none | 禁止使用工具 |
| VALIDATED | N/A | 強制使用 + Schema 驗證 |

### 2.2 與 MyClaw ChatMessage 格式轉換

#### OpenAI 相容模式（路徑 A）— 零轉換成本

MyClaw 的 `chatWithGroq()` 已完整實作 OpenAI 格式轉換，包含：
- `ChatMessage` → `OpenAI.ChatCompletionMessageParam`
- `ToolDefinition` → `OpenAI.ChatCompletionTool`
- `toolChoice: 'any'` → `'required'`
- Tool result 的 `role: 'tool'` 格式

Gemini OpenAI 相容模式完全使用相同格式，**可直接複用 Groq provider 的轉換邏輯**。

#### 原生 SDK（路徑 B）— 需新增轉換函式

需要新增：
- `ChatMessage` → Gemini `Content[]` 格式（role: 'user' / 'model'）
- `ToolDefinition` → Gemini `FunctionDeclaration` 格式
- `FunctionCall` → `ToolCall` 格式
- Tool result → `FunctionResponse` 格式

轉換難度：**中等**（約 80-100 行新代碼）

### 2.3 推薦整合路徑

**推薦路徑 A（OpenAI 相容模式）**：

理由：
1. **改動最小** — 複用已有的 Groq/OpenAI 格式轉換（`convertToolToOpenAI`、OpenAI message 格式等）
2. **無新依賴** — 直接用已安裝的 `openai` SDK
3. **格式統一** — Groq 和 Gemini 共用相同的 message/tool 格式
4. **快速上線** — 預計 1-2 小時即可完成

風險：
- OpenAI 相容模式仍在 Beta，可能有未覆蓋的邊緣案例
- Tool calling + streaming 的穩定性需要測試
- 若未來需要 Gemini 獨有功能（Thinking Config、VALIDATED mode），需回退到原生 SDK

---

## 3. 效能

### 3.1 回應速度對比

| 模型 | Output TPS | TTFT (典型) | 備註 |
|------|-----------|------------|------|
| **Groq Qwen3 32B** | ~600 | <0.5s | 極快（專用硬體推理） |
| **Gemini 3 Flash Preview** | ~218 | ~1-2s | 速度優秀，比 2.5 Pro 快 3x |
| **Gemini 2.5 Pro** | ~156 | ~2-4s | 推理型，思考時 TTFT 較長 |
| **Gemini 2.5 Flash** | ~180 | ~1-2s | 均衡 |
| **Claude Haiku 4.5** | ~101 | ~1-2s | 中等 |
| **Claude Sonnet 4.5** | ~60 | ~2-5s | 品質最高但最慢 |
| **Gemini 3 Pro Preview** | ~128 | ~3-31s | 思考模式下 TTFT 極長 |

### 3.2 LINE 聊天場景評估

LINE 使用者預期回應時間：1-5 秒

| 模型 | 預估端到端延遲 | 可接受度 |
|------|---------------|---------|
| Groq Qwen3 32B | 0.5-1.5s | 極佳 |
| Gemini 3 Flash Preview | 1.5-3s | 佳 |
| Gemini 2.5 Flash | 1.5-3s | 佳 |
| Claude Haiku 4.5 | 2-4s | 可接受 |
| Gemini 2.5 Pro | 3-8s | 需「處理中...」提示 |
| Claude Sonnet 4.5 | 3-8s | 需「處理中...」提示 |
| Gemini 3 Pro Preview | 5-35s | 需「處理中...」提示（思考模式延遲大） |

**結論**：Gemini 3 Flash Preview 和 Gemini 2.5 Flash 的速度對 LINE 場景非常合適，媲美 Claude Haiku。Gemini 2.5 Pro 和 3 Pro Preview 由於思考模式導致 TTFT 較長，建議與 Claude Sonnet 一樣搭配「處理中...」即時回覆。

### 3.3 Rate Limits 對比

個人使用（50-200 對話/天）所需：~0.07-0.14 RPM，~50-200 RPD

| Provider | Free Tier RPM | Free Tier RPD | 夠用？ |
|----------|-------------|-------------|--------|
| Groq | 30 | 14,400 | 綽綽有餘 |
| Gemini 2.5 Flash（Free） | 10 | 250 | 夠用 |
| Gemini 3 Flash Preview（Free） | ~10 | ~250 | 夠用 |
| Gemini 2.5 Pro（Free） | 5 | 100 | 勉強（200 對話/天不夠） |
| Claude | 無 Free Tier | N/A | 需付費 |

---

## 4. 功能支援

### 4.1 功能矩陣

| 功能 | Claude | Groq (Qwen3) | Gemini (OpenAI 相容) | Gemini (原生 SDK) |
|------|--------|-------------|-------------------|-----------------|
| **System Prompt** | system blocks | system role | system role | systemInstruction |
| **Tool Calling** | 原生 tool_use | OpenAI 格式 | OpenAI 格式 | functionDeclarations |
| **tool_choice** | auto/any/none | auto/required/none | auto/required/none | AUTO/ANY/NONE/VALIDATED |
| **Structured Output** | JSON Schema | 不穩定 | JSON Schema | response_schema |
| **Streaming** | 支援 | 支援 | 支援（Beta） | 支援 |
| **Prompt Caching** | 支援（cache_control） | 不支援 | 不支援（OpenAI 模式） | 支援（cachedContent） |
| **Multimodal** | 圖片/PDF | 無 | 圖片/音訊/影片 | 圖片/音訊/影片 |
| **Context Window** | 200K | 130K | 1M | 1M |

### 4.2 Structured Output

Gemini 支援完整的 JSON Schema 結構化輸出：
- `response_mime_type: 'application/json'`
- `response_schema`: 完整 JSON Schema 定義
- 支援 `anyOf`、`$ref`、約束驗證（2025 年 11 月更新）
- 可靠性：優於 Groq/Qwen，與 Claude 相當

### 4.3 System Instructions

Gemini 完整支援 System Instructions：
- OpenAI 模式：`{ role: 'system', content: '...' }`
- 原生 SDK：`config.systemInstruction`
- 效果：相當於 Claude 的 system prompt

### 4.4 Gemini 獨有優勢

- **1M Context Window**：比 Claude（200K）和 Groq（130K）大 5-8 倍
- **VALIDATED 模式**：強制工具呼叫 + Schema 驗證（原生 SDK 才有）
- **Thinking Config**：可控制推理深度（thinking_budget token 數）
- **Multimodal**：支援音訊/影片輸入（Claude 僅支援圖片/PDF）

---

## 5. 整合工作量估算

### 5.1 推薦方案：OpenAI 相容模式

#### 需修改的檔案

| 檔案 | 改動 | 預估行數 |
|------|------|---------|
| `config.ts` | 新增 `gemini` 到 AppConfig.llm、GEMINI_MODEL_REGISTRY、validateGeminiModel()、環境變數 | ~60 行 |
| `llm.ts` | 新增 `geminiClient`、`initGemini()`、`chatWithGemini()`（複用 Groq 的 OpenAI 格式）、路由邏輯 | ~100 行 |
| `.env` | 新增 `GEMINI_API_KEY`、`GEMINI_MODEL` | 2 行 |

#### 新增檔案

無需新增檔案。

#### 總工作量

| 項目 | 工時 |
|------|------|
| config.ts 改動 | 30 分鐘 |
| llm.ts 改動 | 1 小時 |
| 測試與除錯 | 1 小時 |
| **總計** | **2-3 小時** |

### 5.2 詳細改動說明

#### config.ts 改動

```typescript
// 1. AppConfig 新增 gemini
export interface AppConfig {
  llm: {
    provider: 'claude-only' | 'groq-only' | 'gemini-only' | 'hybrid';
    // ... 現有的 claude?, groq?
    gemini?: {
      apiKey: string;
      model: string;
    };
  };
}

// 2. 新增 GEMINI_MODEL_REGISTRY
export const GEMINI_MODEL_REGISTRY: Record<string, ModelInfo> = {
  'gemini-3-flash-preview': {
    id: 'gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    provider: 'gemini',
    toolCalling: true,
    needsNoThink: false,
    needsThinkCleanup: false,
    note: '高性價比，218 TPS，Free Tier 可用',
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'gemini',
    toolCalling: true,
    needsNoThink: false,
    needsThinkCleanup: false,
    note: '最便宜付費 $0.30/MTok，Free Tier 可用',
  },
  'gemini-2.5-pro': {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'gemini',
    toolCalling: true,
    needsNoThink: false,
    needsThinkCleanup: false,
    note: '推理型，156 TPS，1M context',
  },
  'gemini-3-pro-preview': {
    id: 'gemini-3-pro-preview',
    name: 'Gemini 3 Pro Preview',
    provider: 'gemini',
    toolCalling: true,
    needsNoThink: false,
    needsThinkCleanup: false,
    note: '最強推理，TTFT 可能很長',
  },
};

// 3. 環境變數
// GEMINI_API_KEY=          # Google AI Studio API Key
// GEMINI_MODEL=gemini-3-flash-preview  # 預設模型

// 4. ModelInfo.provider 擴充
export interface ModelInfo {
  provider: 'groq' | 'claude' | 'gemini';  // 新增 'gemini'
  // ...
}
```

#### llm.ts 改動

```typescript
// 1. 新增 Gemini client（用 OpenAI SDK）
let geminiClient: OpenAI | null = null;

// 2. initLLM() 中初始化
if (gemini) {
  geminiClient = new OpenAI({
    apiKey: gemini.apiKey,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  });
}

// 3. chatWithGemini() — 幾乎等同 chatWithGroq()
// 差異僅在：
//   - 不需要 /no_think（Gemini 沒有 thinking tags 問題）
//   - 不需要 cleanThinkingTags()
//   - tool_choice 支援 'auto' / 'required' / 'none'
//   - JSON 輸出更可靠，不需要 validateJsonOutput()

// 4. chat() 路由新增 'gemini-only' 分支
```

### 5.3 Provider 偵測邏輯更新

```
啟動時檢查環境變數：
├── ANTHROPIC_API_KEY only     → claude-only
├── GROQ_API_KEY only          → groq-only
├── GEMINI_API_KEY only        → gemini-only（新增）
├── 多個 key                    → hybrid（新增 Gemini 參與路由）
└── 都沒有                      → 啟動失敗
```

Hybrid 模式路由建議：
- simple → Groq（免費 + 最快）或 Gemini Flash（有 Free Tier）
- moderate → Gemini Flash 或 Claude Haiku
- complex → Claude Sonnet 或 Gemini Pro

---

## 6. 綜合建議

### 6.1 最佳整合策略

| 優先級 | 模型 | 角色 | 理由 |
|--------|------|------|------|
| 1 | Gemini 3 Flash Preview | 免費/便宜主力 | Free Tier + $0.50/MTok + 218 TPS |
| 2 | Gemini 2.5 Flash | 備選主力 | 最便宜 $0.30/MTok + Free Tier + 穩定（GA） |
| 3 | Gemini 2.5 Pro | 複雜任務備選 | Free Tier + 推理能力強 + 1M context |

### 6.2 建議的 Provider 優先級（Hybrid 模式）

有 Groq + Gemini + Claude 三個 key 時：

| 任務複雜度 | 首選 | 備選 | 理由 |
|-----------|------|------|------|
| simple | Groq Qwen3 | Gemini 3 Flash | Groq 完全免費 + 最快 |
| moderate | Gemini 3 Flash | Claude Haiku | 有 Free Tier + 品質好 |
| complex | Claude Sonnet | Gemini 2.5 Pro | Claude 品質最佳 |

### 6.3 風險評估

| 風險 | 嚴重度 | 緩解方式 |
|------|--------|---------|
| OpenAI 相容模式 Beta 不穩定 | 中 | 保留 fallback 到 Claude/Groq |
| Gemini 3 Preview 模型可能改名/下架 | 中 | 使用穩定版（2.5 Flash/Pro）作為後備 |
| Free Tier 額度進一步縮減 | 低 | Tier 1 付費門檻極低 |
| Tool calling + streaming 問題 | 中 | 先不啟用 streaming，用同步模式 |
| 中文能力未經驗證 | 中 | 需要實際測試中文 tool calling 和回覆品質 |

### 6.4 結論

**整合可行且值得執行**。

核心理由：
1. **成本優勢**：Gemini Free Tier 填補了 Claude（無免費）和 Groq（品質受限）之間的空白
2. **改動極小**：OpenAI 相容模式讓整合工作量僅 2-3 小時，無需新增依賴
3. **速度合適**：Gemini 3 Flash 的 218 TPS 對 LINE 場景綽綽有餘
4. **功能完整**：Tool Calling、System Prompt、Structured Output 全部支援
5. **架構一致**：與 Groq 共用 OpenAI SDK，不破壞現有 Provider Pattern

建議先整合 **Gemini 3 Flash Preview** 作為新的 `gemini-only` 模式驗證，確認穩定後再加入 Hybrid 路由。

---

## 參考來源

- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API OpenAI Compatibility](https://ai.google.dev/gemini-api/docs/openai)
- [Gemini Function Calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Gemini API Rate Limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini Structured Output](https://ai.google.dev/gemini-api/docs/structured-output)
- [@google/genai SDK](https://github.com/googleapis/js-genai)
- [Gemini 3 Flash vs 2.5 Pro Benchmarks](https://vertu.com/lifestyle/gemini-3-flash-vs-gemini-2-5-pro-the-flash-model-that-beats-googles-pro/)
- [Artificial Analysis - Gemini 2.5 Pro](https://artificialanalysis.ai/models/gemini-2-5-pro)
- [Gemini API Rate Limits Guide](https://www.aifreeapi.com/en/posts/gemini-api-rate-limits-per-tier)
- [Gemini 3 Pro Preview Pricing](https://apidog.com/blog/gemini-3-0-api-cost/)
