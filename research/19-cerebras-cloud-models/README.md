# Cerebras Cloud 免費模型研究報告

> 調查日期：2026-02-12
> 目的：評估 Cerebras Cloud 作為 MyClaw 第三個免費 LLM 提供者的可行性

---

## 1. 平台概覽

Cerebras Cloud 是由 Cerebras Systems 提供的 AI 推論平台，使用其自研的 Wafer-Scale Engine (WSE) 晶片，主打**極速推論**（宣稱比 GPU 快 20 倍）。API 端點為 `https://api.cerebras.ai/v1`，**與 OpenAI API 格式大致相容**。

### 免費方案 (Free Tier)

- 無需等候名單，註冊即可使用
- **所有模型皆可使用**（包括 Preview 模型）
- 每日上限：**1,000,000 tokens/day**
- 社群支援（Discord）

---

## 2. 可用模型列表

### 正式模型 (Production)

| 模型 | Model ID | 參數量 | 速度 (tok/s) | 上下文長度 | 狀態 |
|------|----------|--------|-------------|-----------|------|
| Llama 3.1 8B | `llama3.1-8b` | 8B | ~2,200 | 8K (free) | 可用 |
| Llama 3.3 70B | `llama-3.3-70b` | 70B | ~2,100 | 8K (free) | **2026/02/16 停用** |
| OpenAI GPT OSS | `gpt-oss-120b` | 120B (MoE) | ~3,000 | 131K | 可用 |
| Qwen 3 32B | `qwen-3-32b` | 32B | ~2,600 | 8K (free) | **2026/02/16 停用** |

### 預覽模型 (Preview)

| 模型 | Model ID | 參數量 | 速度 (tok/s) | 上下文長度 | 狀態 |
|------|----------|--------|-------------|-----------|------|
| Qwen 3 235B Instruct | `qwen-3-235b-a22b-instruct-2507` | 235B (22B active, MoE) | ~1,400 | 64K (free) / 131K (paid) | 可用 |
| Z.ai GLM 4.7 | `zai-glm-4.7` | 358B (32B active, MoE) | ~1,000 | 200K (原生) | 可用 |

### 停用提醒

`qwen-3-32b` 和 `llama-3.3-70b` 將於 **2026/02/16 停用**（距今 4 天），不建議依賴這兩個模型。

---

## 3. 重點模型分析

### 3.1 zai-glm-4.7（最強推薦）

**規格：**
- 358B 參數 (MoE, 32B activated)
- 200K 上下文窗口
- MIT 授權開源
- 2025/12/22 發布

**Benchmark 表現：**

| Benchmark | GLM-4.7 | Claude Sonnet 4.5 | 說明 |
|-----------|---------|-------------------|------|
| SWE-bench | 73.8% | ~72% | 軟體工程任務 |
| tau2-Bench | 87.4% | lower | 複雜多步工具使用 |
| LiveCodeBench-v6 | 84.9% | lower | 即時程式碼生成 |
| AIME 2025 | 95.7% | - | 數學推理 |
| GPQA-Diamond | 85.7% | - | 科學問答 |
| MMLU | 90.1% | - | 綜合知識 |
| tau2-Bench Telecom | 96% | - | 工具使用可靠性 |

**Tool Calling 特點：**
- 支援 `tools=[...]` 標準 OpenAI 格式
- 支援 `strict: true` 受限解碼（保證輸出符合 schema）
- 支援平行工具呼叫 (parallel tool calls)
- GLM 系列在 BFCL (Berkeley Function Calling Leaderboard) 排名 #1

**免費方案限制：**
- RPM: **10**（遠低於其他模型的 30）
- RPH: 100
- RPD: 100
- TPM: 與其他模型相同

> 注意：GLM-4.7 的免費方案 RPD 僅 100 次，遠低於其他模型的 14,400 次，不適合高頻使用。

### 3.2 qwen-3-235b-a22b-instruct-2507

**規格：**
- 235B 參數 (MoE, 22B activated)
- 64K 上下文 (free) / 131K (paid)
- 多語言支援
- 2025/07 發布

**能力：**
- 推理能力可比 Claude 4 Sonnet、Gemini 2.5 Flash、DeepSeek R1
- 支援 thinking/non-thinking 模式切換
- 支援 Tool Calling（OpenAI 格式）

**免費方案限制：**
- RPM: 30
- RPH: 900
- RPD: 14,400
- TPD: 1,000,000

### 3.3 gpt-oss-120b

**規格：**
- 120B 參數 (MoE)
- 131K 上下文
- OpenAI 開源模型
- 原生支援 function calling、structured output、推理鏈

**能力：**
- 原生 agentic 功能：function calling、web browsing、code execution
- 支援可配置推理深度
- 速度最快：~3,000 tok/s

**免費方案限制：**
- RPM: 30
- RPD: 14,400
- TPD: 1,000,000

---

## 4. Tool Calling 能力評估

### 4.1 API 格式

Cerebras 使用 **OpenAI 相容格式**：

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.CEREBRAS_API_KEY,
  baseURL: 'https://api.cerebras.ai/v1'
});

const response = await client.chat.completions.create({
  model: 'zai-glm-4.7',
  messages: [...],
  tools: [{
    type: 'function',
    function: {
      name: 'api_call',
      description: '...',
      parameters: { ... },
      strict: true  // 保證參數符合 schema
    }
  }]
});
```

### 4.2 Strict Mode（受限解碼）

Cerebras 支援 `strict: true`，啟用後：
- 工具呼叫參數**保證**符合 JSON Schema
- 不會出現錯誤的參數型別
- 不會缺少必要參數
- 不會出現額外參數
- 不會產生格式錯誤的 JSON

**這對 MyClaw 的動態工具架構非常重要**——因為我們從 ApiConfig 動態建構工具定義，strict mode 可以確保 LLM 產出的參數完全正確。

### 4.3 支援特性

| 特性 | 支援 | 備註 |
|------|------|------|
| Tool Calling | Yes | OpenAI 格式 |
| Strict Mode | Yes | 受限解碼保證 schema 一致 |
| Parallel Tool Calls | Yes | 預設啟用 |
| Multi-turn Tool Use | Yes | 跨回合維持上下文 |
| Streaming + Tool Calling | 部分 | 推理模型不支援 streaming + tool calling |

### 4.4 Tool Calling 可靠性估計

| 模型 | 估計可靠性 | 依據 |
|------|-----------|------|
| zai-glm-4.7 | **~96-98%** | BFCL #1、tau2-Bench Telecom 96%、strict mode |
| qwen-3-235b | **~90-95%** | 與 Qwen3 32B on Groq 相當，但參數量更大 |
| gpt-oss-120b | **~93-97%** | 原生 function calling、OpenAI 自家模型 |
| Claude Sonnet 4.5 (對照) | ~99% | 業界頂級 |
| Groq Qwen3 32B (對照) | ~90-95% | 現有 MyClaw 免費方案 |

---

## 5. 防造假（Anti-Hallucination）可靠性

### 5.1 System Prompt 遵從度

**GLM-4.7：**
- 支援 interleaved thinking（推理交錯於每個動作之前）
- 支援 preserved thinking（推理上下文跨回合保留）
- 有助於模型在呼叫工具前先推理是否需要真實數據

**gpt-oss-120b：**
- system role 的影響力比 OpenAI 原版更強（Cerebras 文件明確指出）
- 支援 chain-of-thought，可設定推理深度

### 5.2 關鍵問題：免費方案 context 限制

免費方案的 context 限制對防造假有間接影響：
- **8K context**（Llama/Qwen 32B）：嚴重不足，無法裝入足夠的對話歷史和工具結果
- **64K context**（Qwen 235B）：足夠大多數場景
- **131K context**（gpt-oss-120b）：非常充裕
- **200K context**（GLM-4.7）：最佳，但 RPD 僅 100

### 5.3 防造假策略

在 MyClaw 中，防造假主要靠：
1. **Tool Calling 架構**：模型必須呼叫工具取得真實數據，而非自行編造
2. **Strict Mode**：確保工具參數正確，減少呼叫失敗
3. **System Prompt**：明確指示「沒有 API 數據時誠實回答」

GLM-4.7 和 gpt-oss-120b 的 strict mode + 強工具呼叫能力，可以有效減少造假。

---

## 6. 與 Groq / Claude 比較

### 6.1 綜合比較表

| 維度 | Cerebras (GLM-4.7) | Cerebras (Qwen 235B) | Cerebras (gpt-oss-120b) | Groq (Qwen3 32B) | Claude (Haiku 4.5) |
|------|--------------------|-----------------------|-------------------------|-------------------|---------------------|
| **費用** | 免費 | 免費 | 免費 | 免費 | ~$0.80/M input |
| **速度** | ~1,000 tok/s | ~1,400 tok/s | ~3,000 tok/s | ~800 tok/s | ~101 TPS |
| **Tool Calling** | 極佳 (BFCL #1) | 良好 | 極佳 (原生) | 良好 | 頂級 (~99%) |
| **Strict Mode** | Yes | Yes | Yes | No | N/A (原生可靠) |
| **上下文** | 200K (free?) | 64K (free) | 131K | 128K | 200K |
| **RPM** | 10 | 30 | 30 | 30 | 50 (Tier 1) |
| **RPD** | 100 | 14,400 | 14,400 | 14,400 | 無硬限制 |
| **TPD** | 1M | 1M | 1M | 無硬限制 | 按量計費 |
| **防造假** | 良好 | 良好 | 良好 | 普通 | 極佳 |
| **多語言** | 良好 | 極佳 | 良好 | 良好 | 極佳 |
| **API 格式** | OpenAI 相容 | OpenAI 相容 | OpenAI 相容 | OpenAI 相容 | Anthropic 原生 |
| **模型穩定性** | Preview | Preview | Production | Production | Production |

### 6.2 重點差異

**Cerebras 優勢：**
- 推論速度遠超 Groq 和 Claude
- GLM-4.7 工具呼叫能力頂級
- Strict mode 保證參數正確性
- gpt-oss-120b 的 131K context 在免費方案中非常慷慨
- OpenAI 格式相容，整合成本低（與 Groq 相同模式）

**Cerebras 劣勢：**
- GLM-4.7 免費方案 RPD 僅 100 次，嚴重不足
- 免費方案 TPD 上限 1M tokens，不如 Groq 的無硬限制
- 部分模型（Llama 3.3、Qwen 32B）即將停用
- Preview 模型（GLM-4.7、Qwen 235B）可能不穩定
- 不支援 streaming + tool calling（推理模型）

---

## 7. 整合建議

### 7.1 推薦整合嗎？

**推薦，但有條件。** Cerebras 值得作為 MyClaw 的第三個 LLM 提供者，但需要針對模型選擇做策略性安排。

### 7.2 推薦模型組合

**主力模型：`gpt-oss-120b`**
- 理由：Production 等級、131K context、最快速度 (3000 tok/s)、原生 tool calling、RPD 14,400 足夠日常使用
- 角色：替代 Groq Qwen3 32B 作為免費主力

**備用模型：`qwen-3-235b-a22b-instruct-2507`**
- 理由：更大模型、64K context (免費)、支援推理模式
- 角色：需要更強推理能力時使用

**高品質模型：`zai-glm-4.7`**（謹慎使用）
- 理由：工具呼叫最強、200K context
- 限制：RPD 僅 100，僅適用於關鍵任務
- 角色：類似 Claude Sonnet 的定位，低頻高品質

### 7.3 整合方式

由於 Cerebras API 與 OpenAI 格式相容，整合方式與現有 Groq 整合幾乎相同：

```typescript
// 在 llm.ts 中新增 Cerebras provider
const cerebrasClient = new OpenAI({
  apiKey: process.env.CEREBRAS_API_KEY,
  baseURL: 'https://api.cerebras.ai/v1'
});

// 使用方式與 Groq 完全相同
const response = await cerebrasClient.chat.completions.create({
  model: 'gpt-oss-120b',  // or 'zai-glm-4.7', 'qwen-3-235b-a22b-instruct-2507'
  messages: [...],
  tools: [...],
  tool_choice: 'auto'
});
```

### 7.4 環境變數設計

```env
CEREBRAS_API_KEY=           # Cerebras API key — 填此 key 即啟用 Cerebras 模式
CEREBRAS_MODEL=gpt-oss-120b # 預設模型
```

### 7.5 Provider 偵測邏輯更新

```
啟動時檢查環境變數：
├── 只有 ANTHROPIC_API_KEY          → claude-only 模式
├── 只有 GROQ_API_KEY               → groq-only 模式
├── 只有 CEREBRAS_API_KEY           → cerebras-only 模式
├── GROQ + CEREBRAS                 → 免費混合模式
├── ANTHROPIC + GROQ/CEREBRAS       → 付費+免費混合模式
├── 三者皆有                         → 完整混合模式
└── 都沒有                           → 啟動失敗
```

---

## 8. 風險與注意事項

| 風險 | 影響 | 緩解方案 |
|------|------|---------|
| GLM-4.7 RPD 100 太低 | 每天最多 100 次對話 | 僅用於複雜任務，日常用 gpt-oss-120b |
| Preview 模型不穩定 | API 可能隨時變更 | 做好 fallback 機制 |
| TPD 1M 上限 | 大量使用時耗盡 | 搭配 Groq 使用，輪替策略 |
| 免費 context 限制 | 部分模型僅 8K | 選用 gpt-oss-120b (131K) 或 Qwen 235B (64K) |
| 即將停用的模型 | Qwen 32B、Llama 3.3 即將下線 | 不依賴這些模型 |
| Streaming + Tool Calling | 推理模型不支援 | 非推理模型 (gpt-oss-120b) 支援 |

---

## 9. 結論

### Cerebras Cloud 值得整合進 MyClaw

1. **成本**：完全免費，1M tokens/day 足夠個人使用
2. **速度**：gpt-oss-120b 達 3,000 tok/s，是所有免費方案中最快的
3. **Tool Calling**：支援 OpenAI 格式 + strict mode，可靠性高
4. **整合成本**：與 Groq 使用相同的 OpenAI SDK 模式，改 baseURL 即可
5. **模型品質**：gpt-oss-120b 和 GLM-4.7 都是 frontier 等級模型

### 最佳整合策略

```
MyClaw LLM 提供者架構（三層）：

Layer 1: 免費快速（日常對話）
  → Groq Qwen3 32B 或 Cerebras gpt-oss-120b（輪替/擇一）

Layer 2: 免費智能（需要推理）
  → Cerebras Qwen3 235B 或 GLM-4.7（限量使用）

Layer 3: 付費頂級（關鍵任務）
  → Claude Haiku 4.5 / Sonnet 4.5
```

### 優先順序建議

1. 先整合 `gpt-oss-120b` 作為 Cerebras 預設模型（最穩定、最快）
2. 可選加入 `qwen-3-235b-a22b-instruct-2507` 作為智能模型
3. `zai-glm-4.7` 因 RPD 限制，僅作為特殊用途

---

## 參考來源

- [Cerebras Pricing](https://www.cerebras.ai/pricing)
- [Cerebras Cloud](https://cloud.cerebras.ai)
- [Cerebras Inference Docs](https://inference-docs.cerebras.ai/introduction)
- [Supported Models](https://inference-docs.cerebras.ai/models/overview)
- [Tool Calling Documentation](https://inference-docs.cerebras.ai/capabilities/tool-use)
- [Rate Limits](https://inference-docs.cerebras.ai/support/rate-limits)
- [OpenAI Compatibility](https://inference-docs.cerebras.ai/resources/openai)
- [GLM-4.7 Announcement](https://www.cerebras.ai/blog/glm-4-7)
- [Cerebras Node.js SDK](https://github.com/Cerebras/cerebras-cloud-sdk-node)
- [Qwen3-235B on Cerebras](https://www.cerebras.ai/press-release/cerebras-launches-qwen3-235b-world-s-fastest-frontier-ai-model-with-full-131k-context-support)
- [OpenAI GPT OSS on Cerebras](https://www.cerebras.ai/blog/openai-gpt-oss-120b-runs-fastest-on-cerebras)
- [GLM-4.7 Benchmarks](https://llm-stats.com/models/glm-4.7)
- [BFCL Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html)
