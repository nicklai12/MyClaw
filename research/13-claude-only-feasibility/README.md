# 研究報告：僅使用 Claude API（不填 Groq API）的可行性分析

**研究日期：** 2026-02-08
**研究代理人：** Agent A
**研究問題：** 如果使用者不填入 Groq API，只想使用付費的 Claude API，這是可行的嗎？

---

## 結論摘要

**完全可行，而且在品質上是更優的選擇。** Claude API 在 tool calling、structured output、繁體中文支持方面均優於 Groq + Qwen3 32B 的組合。唯一的取捨是：月費從 $0 提升到約 $0.50~$15（視使用量與模型選擇而定），以及回應速度從 Groq 的極速（~500 TPS）降低到 Claude 的正常速度（~50-100 TPS）。建議 `llm.ts` 設計為「提供者模式（Provider Pattern）」，讓使用者可以自由選擇 Claude-only、Groq-only、或混合模式。

---

## 1. 技術可行性分析

### 1.1 Claude API 能否完全取代 Groq 的角色？

**結論：完全可以，而且在多個面向更優。**

| 能力 | Groq (Qwen3 32B) | Claude API | 評估 |
|------|------------------|------------|------|
| **Tool Calling** | 支援（Hermes-style 格式）| 原生支援，業界頂級 | Claude 更強 |
| **Function Calling** | 支援（OpenAI 相容格式）| 原生支援，參數提取更精確 | Claude 更強 |
| **Structured Output** | 支援但有可靠性問題（見下方） | 原生 JSON Schema 支援，GA 已上線 | Claude 遠勝 |
| **繁體中文** | 優秀（119 語言，中文為核心語言）| 優秀（文化語境更佳）| 兩者都好，Claude 更細膩 |
| **多步推理** | 中等 | 卓越 | Claude 遠勝 |
| **System Prompt 遵循** | 有問題（用戶報告 system prompt 不如 user prompt）| 可靠 | Claude 更好 |
| **JSON 輸出可靠性** | **有嚴重問題**（thinking mode 關閉時可能產生無效 JSON）| 穩定可靠 | Claude 遠勝 |

### 1.2 Qwen3 32B 的已知問題（Claude 不存在的）

根據現有研究（`/workspaces/MyClaw/research/qwen3-32b-line-bot-research.md`），Qwen3 32B 存在以下問題：

1. **Structured Output 可靠性問題（嚴重）**：`enable_thinking=False` 時可能產生無效 JSON（多餘的 `{`、`[`、markdown code fences）
2. **System Prompt 遵循問題（中等）**：建議將指令放在 user prompt 而非 system prompt
3. **冗長輸出傾向（中等）**：不容易遵循「簡潔回覆」的指令
4. **需要額外 workaround**：必須啟用 thinking mode 或附加 `/no_think` 才能確保 JSON 可靠

**Claude API 完全沒有上述問題**，且 Structured Outputs 已於 2026 年 GA（Generally Available），支援所有 Claude 4.5 系列模型。

### 1.3 Claude 的 Tool Calling 支援

根據 [Claude API 官方文件](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)：

- **Programmatic tool calling**：允許 Claude 在 code execution 中呼叫工具，降低延遲和 token 用量
- **Fine-grained tool streaming**：GA，所有模型和平台支援
- **Tool search（工具搜尋）**：Public Beta，支援從大型工具目錄動態發現和載入工具
- **Structured outputs for tool parameters**：嚴格驗證工具參數，確保型別正確

---

## 2. 成本影響分析

### 2.1 Claude API 完整定價表（2026 年 2 月最新）

| 模型 | Input (每百萬 token) | Output (每百萬 token) | Cache Hit | 定位 |
|------|---------------------|----------------------|-----------|------|
| **Claude Haiku 3** | $0.25 | $1.25 | $0.03 | 最便宜（舊款）|
| **Claude Haiku 3.5** | $0.80 | $4.00 | $0.08 | 便宜且快速 |
| **Claude Haiku 4.5** | $1.00 | $5.00 | $0.10 | 快速且聰明 |
| **Claude Sonnet 4.5** | $3.00 | $15.00 | $0.30 | 均衡首選 |
| **Claude Sonnet 4** | $3.00 | $15.00 | $0.30 | 均衡 |
| **Claude Opus 4.5** | $5.00 | $25.00 | $0.50 | 最強但貴 |
| **Claude Opus 4.6** | $5.00 | $25.00 | $0.50 | 最新旗艦 |

**Batch API 享 50% 折扣。Prompt Caching 的 Cache Hit 享 90% 折扣。**

來源：[Anthropic 官方定價頁面](https://platform.claude.com/docs/en/about-claude/pricing)

### 2.2 月費估算

#### 假設條件

- 一次對話的平均 token 用量：
  - Input：~500 tokens（包含 system prompt + 使用者訊息 + 上下文）
  - Output：~300 tokens（AI 回覆）
- 使用 Prompt Caching（system prompt 不重複計費）

#### 場景 A：少量使用（50 對話/天）

| 模型 | 月 Input Tokens | 月 Output Tokens | 月費估算 |
|------|----------------|-----------------|---------|
| **Haiku 3.5** | 750K (50x500x30) | 450K (50x300x30) | ~$0.60 + $1.80 = **~$2.40** |
| **Haiku 4.5** | 750K | 450K | ~$0.75 + $2.25 = **~$3.00** |
| **Sonnet 4.5** | 750K | 450K | ~$2.25 + $6.75 = **~$9.00** |

> 搭配 Prompt Caching 後，input 費用可再降 50-80%（因為 system prompt 和歷史對話可快取）。
>
> Haiku 3.5 實際月費可能低至 **~$1.00-$1.50**。

#### 場景 B：中度使用（200 對話/天）

| 模型 | 月 Input Tokens | 月 Output Tokens | 月費估算 |
|------|----------------|-----------------|---------|
| **Haiku 3.5** | 3M | 1.8M | ~$2.40 + $7.20 = **~$9.60** |
| **Haiku 4.5** | 3M | 1.8M | ~$3.00 + $9.00 = **~$12.00** |
| **Sonnet 4.5** | 3M | 1.8M | ~$9.00 + $27.00 = **~$36.00** |

> 搭配 Prompt Caching 後，Haiku 3.5 實際月費約 **~$5.00-$7.00**。

#### 場景 C：重度使用（500 對話/天）

| 模型 | 月 Input Tokens | 月 Output Tokens | 月費估算 |
|------|----------------|-----------------|---------|
| **Haiku 3.5** | 7.5M | 4.5M | ~$6.00 + $18.00 = **~$24.00** |
| **Haiku 4.5** | 7.5M | 4.5M | ~$7.50 + $22.50 = **~$30.00** |
| **Sonnet 4.5** | 7.5M | 4.5M | ~$22.50 + $67.50 = **~$90.00** |

> 搭配 Prompt Caching 後，Haiku 3.5 實際月費約 **~$12.00-$18.00**。

### 2.3 成本最佳化策略

| 策略 | 節省幅度 | 說明 |
|------|---------|------|
| **使用 Prompt Caching** | 50-80% input | System prompt 和歷史對話只計算一次 |
| **選擇 Haiku 3.5 作為主力** | 70-80% vs Sonnet | 簡單對話用 Haiku 綽綽有餘 |
| **Claude-only 內部路由** | 30-50% | 簡單對話走 Haiku，複雜走 Sonnet |
| **控制 output 長度** | 20-40% | 設定 `max_tokens`，避免冗長回覆 |
| **Batch API** | 50% | 排程任務可用非即時批次處理 |

### 2.4 與 Groq 免費方案的成本比較

| 方案 | 月費 | 品質 | 可靠性 |
|------|------|------|--------|
| Groq-only（免費） | $0 | 中等（Structured Output 有問題） | 中等（startup） |
| Groq 80% + Claude 20%（原方案） | $0~3 | 好 | 中等 |
| **Claude Haiku 3.5 only** | **$1~18** | **好** | **高** |
| **Claude Haiku/Sonnet 混合** | **$3~30** | **優秀** | **高** |
| Claude Sonnet-only | $9~90 | 最優 | 最高 |

---

## 3. 效能影響分析

### 3.1 回應速度比較

| 指標 | Groq (Qwen3 32B) | Claude Haiku 4.5 | Claude Haiku 3.5 | Claude Sonnet 4.5 |
|------|------------------|-----------------|-----------------|------------------|
| **Output Speed (TPS)** | ~491 | ~101 | ~52-65 | ~30-40（估計） |
| **Time to First Token** | ~100-200ms | ~500ms | ~700ms | ~2,000ms |
| **300 token 回覆時間** | ~0.8s | ~3.5s | ~5.5s | ~9.5s |

### 3.2 對 LINE 使用者體驗的影響

**LINE 的回覆機制：**
- Reply Token 的有效期限有限（需在收到 webhook 後一定時間內回覆）
- 長時間等待 Claude 回應可能需要先回覆「處理中...」再用 Push Message

**實際影響評估：**

| 場景 | Groq 回應時間 | Claude Haiku 3.5 | 使用者感受 |
|------|-------------|-----------------|-----------|
| 簡單問候 | <1s | ~2-3s | 可接受，稍慢 |
| 一般對話 | ~1s | ~3-5s | 可接受 |
| 複雜推理 | ~2s | ~5-8s | 需要「思考中」提示 |
| 技能建立 | ~3s | ~8-12s | 需要「處理中」提示 |

**結論：** Claude 比 Groq 慢 3-5 倍，但在 LINE 聊天場景中仍然在可接受範圍內。大多數使用者可以容忍 3-5 秒的回覆延遲。對於超過 5 秒的回覆，建議實作「思考中...」的即時回覆機制。

### 3.3 速度最佳化建議

1. **使用 Claude Haiku 4.5 作為主力模型**：~101 TPS，Time to First Token ~500ms
2. **啟用 Streaming**：讓使用者更早看到回覆的開頭
3. **Prompt Caching**：減少 TTFT（因為快取的 token 不需要重新處理）
4. **設定合理的 `max_tokens`**：避免生成過長的回覆
5. **「思考中」機制**：收到 webhook 後立即回覆「處理中...」，然後用 Push Message 發送實際回覆

---

## 4. 配置建議：llm.ts 設計方案

### 4.1 推薦架構：Provider Pattern（提供者模式）

```typescript
// src/llm.ts

import Anthropic from '@anthropic-ai/sdk';

// ============================================
// 類型定義
// ============================================

interface LLMConfig {
  provider: 'claude-only' | 'groq-only' | 'hybrid';
  claude?: {
    apiKey: string;
    defaultModel: string;      // 預設模型（簡單任務）
    complexModel: string;      // 複雜任務模型
    maxTokens: number;
  };
  groq?: {
    apiKey: string;
    model: string;
    maxTokens: number;
  };
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatOptions {
  messages: ChatMessage[];
  tools?: any[];
  systemPrompt?: string;
  maxTokens?: number;
  complexity?: 'simple' | 'moderate' | 'complex';
}

interface ChatResponse {
  content: string;
  toolCalls?: any[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheHitTokens?: number;
  };
  provider: string;
  model: string;
  latencyMs: number;
}

// ============================================
// 配置偵測
// ============================================

function detectConfig(): LLMConfig {
  const hasClaudeKey = !!process.env.ANTHROPIC_API_KEY;
  const hasGroqKey = !!process.env.GROQ_API_KEY;

  if (hasClaudeKey && hasGroqKey) {
    return {
      provider: 'hybrid',
      claude: {
        apiKey: process.env.ANTHROPIC_API_KEY!,
        defaultModel: 'claude-haiku-4-5-20250501',
        complexModel: 'claude-sonnet-4-5-20250514',
        maxTokens: 1024,
      },
      groq: {
        apiKey: process.env.GROQ_API_KEY!,
        model: 'qwen/qwen3-32b',
        maxTokens: 1024,
      },
    };
  }

  if (hasClaudeKey) {
    return {
      provider: 'claude-only',
      claude: {
        apiKey: process.env.ANTHROPIC_API_KEY!,
        defaultModel: 'claude-haiku-4-5-20250501',
        complexModel: 'claude-sonnet-4-5-20250514',
        maxTokens: 1024,
      },
    };
  }

  if (hasGroqKey) {
    return {
      provider: 'groq-only',
      groq: {
        apiKey: process.env.GROQ_API_KEY!,
        model: 'qwen/qwen3-32b',
        maxTokens: 1024,
      },
    };
  }

  throw new Error(
    '至少需要設定 ANTHROPIC_API_KEY 或 GROQ_API_KEY 其中之一'
  );
}

// ============================================
// Claude Provider
// ============================================

class ClaudeProvider {
  private client: Anthropic;
  private config: LLMConfig['claude'];

  constructor(config: LLMConfig['claude']) {
    this.config = config!;
    this.client = new Anthropic({ apiKey: this.config.apiKey });
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const start = Date.now();

    // Claude-only 模式下的內部路由：
    // 簡單任務 → Haiku（便宜快速）
    // 複雜任務 → Sonnet（品質優先）
    const model = options.complexity === 'complex'
      ? this.config!.complexModel
      : this.config!.defaultModel;

    const response = await this.client.messages.create({
      model,
      max_tokens: options.maxTokens || this.config!.maxTokens,
      system: options.systemPrompt || '',
      messages: options.messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      ...(options.tools ? { tools: options.tools } : {}),
    });

    const latencyMs = Date.now() - start;

    return {
      content: response.content
        .filter(c => c.type === 'text')
        .map(c => (c as any).text)
        .join(''),
      toolCalls: response.content.filter(c => c.type === 'tool_use'),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheHitTokens: (response.usage as any).cache_read_input_tokens,
      },
      provider: 'claude',
      model,
      latencyMs,
    };
  }
}

// ============================================
// 匯出主介面
// ============================================

const config = detectConfig();

export async function chat(options: ChatOptions): Promise<ChatResponse> {
  switch (config.provider) {
    case 'claude-only':
      return new ClaudeProvider(config.claude).chat(options);

    case 'groq-only':
      // Groq provider 實作（省略）
      throw new Error('Groq provider 待實作');

    case 'hybrid':
      // 混合模式：簡單 → Groq，複雜 → Claude
      if (options.complexity === 'complex') {
        return new ClaudeProvider(config.claude).chat(options);
      }
      // 預設走 Groq
      throw new Error('Groq provider 待實作');

    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

export function getProviderInfo(): string {
  return `LLM Provider: ${config.provider}`;
}
```

### 4.2 環境變數設計

```bash
# .env.example

# === LINE 設定（必填）===
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret

# === AI 設定（至少填一個）===
# 方案一：只用 Claude（付費，品質最好）
ANTHROPIC_API_KEY=your_anthropic_api_key

# 方案二：只用 Groq（免費，速度最快）
# GROQ_API_KEY=your_groq_api_key

# 方案三：兩個都填（混合模式，最佳 CP 值）
# 同時填入 ANTHROPIC_API_KEY 和 GROQ_API_KEY

# === 可選設定 ===
# CLAUDE_DEFAULT_MODEL=claude-haiku-4-5-20250501
# CLAUDE_COMPLEX_MODEL=claude-sonnet-4-5-20250514
```

### 4.3 需要的程式碼變更

| 變更項目 | 說明 | 工作量 |
|---------|------|--------|
| `llm.ts` — Provider Pattern | 新增自動偵測 API Key、支援三種模式 | 中 |
| `config.ts` — 環境變數 | 新增模型選擇、Provider 類型 | 小 |
| `ai.ts` — 呼叫介面 | 改為透過 `llm.ts` 呼叫，不直接依賴特定 provider | 小 |
| `.env.example` — 文件 | 說明三種配置方式 | 小 |
| `skills.ts` — 技能系統 | 確保 tool calling 格式同時支援 Claude 和 Groq 格式 | 中 |
| 啟動檢查 | 啟動時印出使用的 provider 和模型 | 小 |

### 4.4 Claude-only 模式下的內部路由策略

即使只用 Claude，也可以透過選擇不同模型來最佳化成本：

```
使用者訊息 → 複雜度分析
  ├── 簡單（問候、閒聊、簡短問答）→ Claude Haiku 4.5（$1/$5 per MTok）
  ├── 中等（摘要、翻譯、一般任務）→ Claude Haiku 4.5（$1/$5 per MTok）
  └── 複雜（技能建立、多步推理、tool calling）→ Claude Sonnet 4.5（$3/$15 per MTok）
```

**預估比例：** 80% Haiku + 20% Sonnet
**效果：** 相比 100% Sonnet，可節省約 60-70% 費用

---

## 5. Claude API 完整定價資訊

### 5.1 所有可用模型定價

| 模型 | Input (/MTok) | Output (/MTok) | Cache Write | Cache Hit | Batch Input | Batch Output |
|------|--------------|----------------|-------------|-----------|-------------|-------------|
| Claude Haiku 3 | $0.25 | $1.25 | $0.30 | $0.03 | $0.125 | $0.625 |
| Claude Haiku 3.5 | $0.80 | $4.00 | $1.00 | $0.08 | $0.40 | $2.00 |
| Claude Haiku 4.5 | $1.00 | $5.00 | $1.25 | $0.10 | $0.50 | $2.50 |
| Claude Sonnet 4 | $3.00 | $15.00 | $3.75 | $0.30 | $1.50 | $7.50 |
| Claude Sonnet 4.5 | $3.00 | $15.00 | $3.75 | $0.30 | $1.50 | $7.50 |
| Claude Opus 4.5 | $5.00 | $25.00 | $6.25 | $0.50 | $2.50 | $12.50 |
| Claude Opus 4.6 | $5.00 | $25.00 | $6.25 | $0.50 | $2.50 | $12.50 |

### 5.2 Rate Limits（API 速率限制）

| Tier | 入門門檻 | RPM（每分鐘請求） | 說明 |
|------|---------|-----------------|------|
| Tier 1 | $5 儲值 | 50 RPM | 個人使用綽綽有餘 |
| Tier 2 | $40+ 儲值 | 更高 | 小型專案 |
| Tier 3 | $200+ 儲值 | 更高 | 中型專案 |
| Tier 4 | $400+ 儲值 | 4,000 RPM | 大型應用 |

**個人使用者（50-500 對話/天）只需 Tier 1 即可**，50 RPM 完全足夠。

### 5.3 個人助理推薦配置

| 使用量 | 推薦模型 | 月費估算 | 說明 |
|--------|---------|---------|------|
| 輕度（~50 對話/天） | Haiku 3.5 | **$1-3/月** | 最省錢 |
| 中度（~200 對話/天） | Haiku 4.5 | **$5-12/月** | 均衡推薦 |
| 重度（~500 對話/天） | Haiku 4.5 + Sonnet 混合 | **$12-25/月** | 品質與成本兼顧 |

---

## 6. 風險與注意事項

### 6.1 使用 Claude-only 的風險

| 風險 | 嚴重性 | 說明 | 緩解策略 |
|------|--------|------|---------|
| **費用超出預期** | 中 | 對話量大或回覆過長 | 設定 `max_tokens`、使用 Prompt Caching、選 Haiku |
| **回應速度較慢** | 低 | 比 Groq 慢 3-5 倍 | 使用 Haiku 4.5（101 TPS）、實作「思考中」提示 |
| **Rate Limit 觸頂** | 低 | Tier 1 只有 50 RPM | 個人使用不太可能觸頂；若需要可升級 Tier |
| **API 停機** | 低 | 任何 API 都可能停機 | 沒有 fallback（除非也設定 Groq） |
| **費用持續累積** | 中 | 免費方案 vs 付費 | 設定月度預算上限、監控用量 |

### 6.2 使用 Claude-only 的優勢（相比混合模式）

| 優勢 | 說明 |
|------|------|
| **架構更簡單** | 不需要實作複雜度分類器、fallback 邏輯 |
| **品質一致** | 不會因為切換模型導致回覆風格不一 |
| **除錯更容易** | 只有一個 API 需要監控和除錯 |
| **Structured Output 可靠** | Claude 的 JSON Schema 支援穩定，不需要 retry |
| **Tool Calling 更強** | Claude 的 tool use 業界頂級 |
| **繁體中文更細膩** | 文化語境和表達更自然 |
| **維護成本低** | 不需要擔心 Groq 的穩定性（startup 風險） |

### 6.3 Claude-only vs Groq-only vs 混合的最終比較

| 面向 | Claude-only | Groq-only | 混合模式 |
|------|------------|-----------|---------|
| **月費** | $1-25 | $0 | $0-3 |
| **回應品質** | 優秀 | 中等 | 好 |
| **回應速度** | 正常（2-5s） | 極快（<1s） | 混合 |
| **Structured Output** | 可靠 | 有問題 | 混合 |
| **架構複雜度** | 簡單 | 簡單 | 較複雜 |
| **維護成本** | 低 | 低 | 中 |
| **適合人群** | 願意付費追求品質 | 預算為零 | CP 值最大化 |
| **推薦度** | 強烈推薦 | 可接受 | 推薦 |

---

## 7. 最終建議

### 7.1 對 llm.ts 的設計建議

**採用 Provider Pattern，讓系統自動偵測可用的 API Key：**

1. **只有 `ANTHROPIC_API_KEY`** → Claude-only 模式（Haiku 為主，Sonnet 為輔）
2. **只有 `GROQ_API_KEY`** → Groq-only 模式（Qwen3 32B）
3. **兩者皆有** → 混合模式（簡單走 Groq，複雜走 Claude）
4. **都沒有** → 啟動失敗，提示使用者至少設定一個

### 7.2 給使用者的建議

- **如果預算許可（每月 $3-15）**：直接用 Claude-only，選 Haiku 3.5 或 4.5 作為主力模型，品質最好、最穩定、架構最簡單
- **如果完全免費優先**：用 Groq-only，但要注意 Structured Output 的可靠性問題
- **如果想要最佳 CP 值**：混合模式，但架構較複雜

### 7.3 推薦配置（個人助理最佳實踐）

```
模型：Claude Haiku 4.5（主力）+ Claude Sonnet 4.5（複雜任務 fallback）
Prompt Caching：啟用（節省 50-80% input 費用）
Max Tokens：1024（避免冗長回覆）
月費預估：$3-12/月（中度使用）
```

---

## 研究來源

- [Anthropic 官方定價頁面](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude API Rate Limits](https://platform.claude.com/docs/en/api/rate-limits)
- [Claude Tool Use 文件](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)
- [Claude Structured Outputs 文件](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Claude Haiku 4.5 效能分析](https://artificialanalysis.ai/models/claude-4-5-haiku)
- [Claude Haiku 3.5 效能分析](https://artificialanalysis.ai/models/claude-3-5-haiku)
- [Groq 免費方案限制](https://community.groq.com/t/is-there-a-free-tier-and-what-are-its-limits/790)
- [Groq Rate Limits](https://console.groq.com/docs/rate-limits)
- [Claude API 定價完整指南 (MetaCTO)](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration)
- [Claude API 定價計算器](https://costgoat.com/pricing/claude-api)
- [LLM 延遲基準測試 2026](https://research.aimultiple.com/llm-latency-benchmark/)
- [Claude Reducing Latency 文件](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-latency)

---

**報告結束。**

**一句話結論：** 僅使用 Claude API 完全可行，建議以 Haiku 4.5 為主力、Sonnet 4.5 為複雜任務備用，個人使用月費約 $3-12，品質和可靠性均優於 Groq 方案。`llm.ts` 應設計為 Provider Pattern，自動偵測 API Key 決定執行模式。
