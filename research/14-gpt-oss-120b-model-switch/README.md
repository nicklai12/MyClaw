# GPT-OSS-120B 模型替換研究：能否取代 Qwen3 32B？

## 結論摘要

**不建議將主力模型從 Qwen3 32B 切換到 openai/gpt-oss-120b。** 儘管 GPT-OSS-120B 在 Tool Calling（TauBench）和推理能力上顯著優於 Qwen3 32B，但它有三個致命缺陷：(1) 繁體中文能力極差（C-Eval 僅 20%，遠低於 Qwen3 的優秀表現）；(2) Groq 社群回報 Tool Calling 可靠性問題（模型會忽略 tool 定義）；(3) Structured Outputs 與 Tool Use 不能同時使用。**最佳替代方案是 Kimi K2-0905**（繁中能力佳、Tool Calling ~95% 成功率、支援 Parallel Tool Calling），或保留 Qwen3 32B 但加強 prompt 工程和 JSON 驗證邏輯。

---

## 1. openai/gpt-oss-120b 模型資訊

### 1.1 模型身份

| 項目 | 說明 |
|------|------|
| **全名** | OpenAI GPT-OSS 120B |
| **開發者** | OpenAI |
| **性質** | OpenAI 首款開放權重（open-weight）模型，非開源（權重開放但訓練程式碼未公開） |
| **與 GPT-4 關係** | 非 GPT-4 系列。是獨立開發的 MoE 架構模型，性能接近 o4-mini |
| **發布時間** | 2025 年 8 月 |
| **授權** | OpenAI 開放權重授權（非 Apache 2.0） |
| **Hugging Face** | [openai/gpt-oss-120b](https://huggingface.co/openai/gpt-oss-120b) |
| **GitHub** | [openai/gpt-oss](https://github.com/openai/gpt-oss) |

### 1.2 架構與參數

| 規格 | 數值 |
|------|------|
| **總參數量** | 120B（117B） |
| **活躍參數量** | 5.1B（每次前向傳播） |
| **架構** | Mixture-of-Experts (MoE) |
| **層數** | 36 |
| **MoE 專家數** | 128 個專家，Top-4 路由 |
| **注意力機制** | Grouped Query Attention + Rotary Embeddings |
| **正規化** | RMSNorm pre-layer normalization |
| **殘差寬度** | 2880 |
| **Context Window** | 131,072 tokens (128K) |
| **最大輸出** | 65,536 tokens |

### 1.3 能力支援

| 能力 | 支援情況 | 備註 |
|------|---------|------|
| **Tool Calling / Function Calling** | ✅ 支援 | 但不支援 Parallel Tool Calling |
| **Structured Output (Strict Mode)** | ✅ 支援 | Groq 上 GPT-OSS 是唯二支援 strict mode 的模型 |
| **JSON Object Mode** | ✅ 支援 | |
| **JSON Schema Mode** | ✅ 支援 | |
| **思考模式 (Reasoning)** | ✅ 支援 | 支援 low/medium/high 三級 |
| **繁體中文** | ❌ 極差 | C-Eval 僅 20%，嚴重不適合中文場景 |
| **Prompt Caching** | ✅ 支援 | 50% input cost 折扣 |
| **Built-in Tools** | ✅ 支援 | Browser Search, Code Execution |

### 1.4 思考模式（Reasoning Mode）運作方式

GPT-OSS-120B 支援 Groq 的 reasoning 機制，透過以下參數控制：

**`reasoning_effort` 參數**（僅 GPT-OSS 支援）：
- `low`：少量推理 token
- `medium`：中等推理 token
- `high`：大量推理 token

**`reasoning_format` 參數**（控制推理輸出方式）：
| 格式 | 行為 |
|------|------|
| `parsed` | 推理過程放在 `message.reasoning` 欄位，回應保持簡潔 |
| `raw` | 推理過程包含在 `<think>` 標籤中 |
| `hidden` | 只回傳最終答案 |

**`include_reasoning` 參數**（GPT-OSS 專用，布林值）：
- `true`（預設）：在 `message.reasoning` 欄位包含推理
- `false`：排除推理

**重要限制**：當啟用 JSON mode 或 Tool Use 時，`reasoning_format` 預設為 `raw` 或 `parsed`。設定 `raw` 搭配這些功能會回傳 400 錯誤。

### 1.5 繁體中文能力（關鍵問題）

根據 [學術評估論文](https://arxiv.org/html/2508.12461v1) 和 [Hugging Face 社群討論](https://huggingface.co/openai/gpt-oss-120b/discussions/19)：

| 模型 | C-Eval（中文理解） | MMMLU（多語言） |
|------|-------------------|----------------|
| **GPT-OSS-120B** | **20%** | 81.3% |
| **GPT-OSS-20B** | 28% | — |
| **Qwen3 32B** | **優秀**（中文核心語言） | — |

> "Both GPT-OSS models achieving below 45% accuracy on Chinese-language tasks."
> "The models were trained on a mostly English, text-only dataset."

**結論：GPT-OSS-120B 的中文能力完全不適合 MyClaw 這類以繁體中文為主的應用。**

### 1.6 Benchmark 表現

| Benchmark | GPT-OSS-120B | Qwen3 32B | 說明 |
|-----------|-------------|-----------|------|
| MMLU（通用推理） | 90.0% | 84.4% (MMLU-Pro) | GPT-OSS 領先 |
| TauBench（Tool Calling） | ~68% | — | GPT-OSS 超越 o4-mini |
| SWE-Bench（程式碼） | 62.4% | — | 強 |
| C-Eval（中文） | **20%** | **優秀** | Qwen3 大幅領先 |
| Codeforces（競程） | 接近 o4-mini | — | 強 |

---

## 2. Groq 上的可用性

### 2.1 模型狀態

| 項目 | GPT-OSS-120B | Qwen3 32B |
|------|-------------|-----------|
| **Groq 模型 ID** | `openai/gpt-oss-120b` | `qwen/qwen3-32b` |
| **狀態** | Production | Preview |
| **免費方案** | ✅ 可用 | ✅ 可用 |
| **Context Window** | 131,072 | 131,072 |
| **最大輸出** | 65,536 | — |

### 2.2 免費方案 Rate Limits 比較

| 限制項目 | GPT-OSS-120B | Qwen3 32B | 差異 |
|---------|-------------|-----------|------|
| **RPM**（每分鐘請求） | 30 | 60 | Qwen3 多一倍 |
| **RPD**（每日請求） | 1,000 | 1,000 | 相同 |
| **TPM**（每分鐘 tokens） | 8,000 | 6,000 | GPT-OSS 多 33% |
| **TPD**（每日 tokens） | 200,000 | 500,000 | Qwen3 多 2.5 倍 |

**分析**：
- GPT-OSS-120B 的 **每日 token 總量只有 200K**，比 Qwen3 的 500K 少很多
- RPM 只有 30（Qwen3 有 60），對即時對話應用不利
- TPD 200K 限制意味著每天約 130-400 次對話（每次 ~500-1500 tokens），對個人助理偏緊

### 2.3 速度比較

| 模型 | Groq 上的 TPS（tokens/second） |
|------|-------------------------------|
| **GPT-OSS-120B** | ~500 TPS |
| **GPT-OSS-20B** | ~1,000 TPS |
| **Qwen3 32B** | ~662 TPS |
| **Llama 4 Scout** | ~594 TPS |
| **Llama 3.1 8B** | ~840 TPS |
| **Kimi K2-0905** | ~200 TPS |

GPT-OSS-120B 在 Groq 上的速度約為 Qwen3 的 75%，但仍然非常快。

### 2.4 付費價格比較

| 模型 | Input (/M tokens) | Output (/M tokens) |
|------|-------------------|-------------------|
| GPT-OSS-120B | $0.15 | $0.60 |
| GPT-OSS-20B | $0.075 | $0.30 |
| Qwen3 32B | $0.29 | $0.59 |
| Llama 4 Scout | $0.11 | $0.34 |
| Llama 4 Maverick | $0.20 | $0.60 |
| Kimi K2-0905 | $1.00 | $3.00 |
| Llama 3.3 70B | $0.59 | $0.79 |

---

## 3. Groq 上 GPT-OSS-120B 的已知問題

### 3.1 Tool Calling 可靠性問題

根據 [Groq 社群論壇](https://community.groq.com/t/gpt-oss-120b-ignoring-tools/385)，使用者回報多項 Tool Calling 問題：

1. **Tool 定義被完全忽略**：模型無視 tool 定義，不做任何 function call
2. **`tool_choice` 參數失效**：即使設定 `tool_choice: "required"`，模型仍不呼叫 tool
3. **Structured Outputs 回退**（2025/8/22 事件）：使用 JSON schema 回應時報錯 400：`"Tool choice is none, but model called a tool"`

**Groq 官方回應**：
> "On Groq's side, we aren't able to force a model to call a tool/function, even when you set tool_choice=required."

### 3.2 Structured Outputs 限制

根據 [Groq Structured Outputs 文件](https://console.groq.com/docs/structured-outputs)：

> **"Streaming and tool use are not currently supported with Structured Outputs."**

這意味著：
- ❌ 不能同時使用 Tool Calling + Structured Outputs
- ❌ 不能用 `response_format: { type: "json_schema" }` 搭配 `tools` 參數
- 這對 MyClaw 的 skill-manager.ts 是致命問題，因為它依賴 Tool Calling 來解析技能配置

### 3.3 系統 Prompt 敏感性

根據 [IBM 的指導文件](https://www.ibm.com/docs/en/watsonx/watson-orchestrate/base?topic=models-gpt-oss-model-behavior-instruction-guidelines) 和 [Groq 文件](https://console.groq.com/docs/reasoning)：

- GPT-OSS-120B 對模糊或矛盾的指令非常敏感
- Groq 推理模式文件建議：**"Avoid system prompts — include all instructions in the user message!"**
- 這與 MyClaw 大量依賴 system prompt 的架構衝突

---

## 4. Groq 免費方案所有可用模型完整比較

### 4.1 所有模型一覽

| 模型 | 模型 ID | Context | Tool Calling | Parallel TC | JSON Mode | Structured Output (Strict) | 繁中能力 | TPS | 免費 RPD | 免費 TPD |
|------|---------|---------|-------------|------------|-----------|--------------------------|---------|-----|---------|---------|
| **GPT-OSS-120B** | `openai/gpt-oss-120b` | 128K | ✅ | ❌ | ✅ | ✅ | ❌ 極差 | 500 | 1K | 200K |
| **GPT-OSS-20B** | `openai/gpt-oss-20b` | 128K | ✅ | ❌ | ✅ | ✅ | ❌ 差 | 1000 | 1K | 200K |
| **Kimi K2-0905** | `moonshotai/kimi-k2-instruct-0905` | 256K | ✅ | ✅ | ✅ | ✅ (best-effort) | ✅ 優秀 | 200 | 1K | 300K |
| **Qwen3 32B** | `qwen/qwen3-32b` | 131K | ✅ | ✅ | ✅ | ❌ | ✅ 優秀 | 662 | 1K | 500K |
| **Llama 4 Scout** | `meta-llama/llama-4-scout-17b-16e-instruct` | 128K | ✅ | ✅ | ✅ | ✅ (best-effort) | ⚠️ 未特別支援 | 594 | 1K | 500K |
| **Llama 4 Maverick** | `meta-llama/llama-4-maverick-17b-128e-instruct` | 128K | ✅ | ✅ | ✅ | ✅ (best-effort) | ⚠️ 未特別支援 | 562 | 1K | 500K |
| **Llama 3.3 70B** | `llama-3.3-70b-versatile` | 128K | ✅ | ✅ | ✅ | ❌ | ⚠️ 一般 | 394 | 1K | 100K |
| **Llama 3.1 8B** | `llama-3.1-8b-instant` | 128K | ✅ | ✅ | ✅ | ❌ | ⚠️ 弱 | 840 | 14.4K | 500K |

### 4.2 Tool Calling 能力排名（適合 MyClaw 技能系統）

| 排名 | 模型 | Tool Calling 可靠性 | JSON 輸出可靠性 | 繁中能力 | 綜合評分 |
|------|------|-------------------|---------------|---------|---------|
| 1 | **Kimi K2-0905** | ~95% 首次成功率 | 優秀 | ✅ 雙語原生 | ★★★★★ |
| 2 | **Qwen3 32B** | 良好（BFCL 頂級） | 中等（有已知問題） | ✅ 中文核心 | ★★★★ |
| 3 | **Llama 4 Scout** | 良好 | 良好 (best-effort) | ⚠️ 一般 | ★★★ |
| 4 | **Llama 4 Maverick** | 良好 | 良好 (best-effort) | ⚠️ 一般 | ★★★ |
| 5 | **GPT-OSS-120B** | 不穩定（社群回報問題） | 理論支援 strict | ❌ 極差 | ★★ |
| 6 | **Llama 3.3 70B** | 良好 | 中等 | ⚠️ 一般 | ★★ |

---

## 5. 與 Qwen3 32B 的詳細比較

### 5.1 Tool Calling 能力比較

| 面向 | GPT-OSS-120B | Qwen3 32B |
|------|-------------|-----------|
| **Benchmark（TauBench）** | ~68%，超越 o4-mini | BFCL 頂級 |
| **Parallel Tool Calling** | ❌ 不支援 | ✅ 支援 |
| **Groq 上實際可靠性** | ⚠️ 有社群回報忽略 tool 的問題 | ⚠️ JSON 輸出有時不可靠 |
| **`tool_choice` 控制** | ⚠️ `required` 不保證生效 | ✅ 正常運作 |
| **Structured Output + Tool Use** | ❌ 不能同時使用 | N/A（不支援 strict mode） |

### 5.2 JSON 輸出可靠性比較

| 面向 | GPT-OSS-120B | Qwen3 32B |
|------|-------------|-----------|
| **Strict Mode** | ✅ 支援（但不能搭配 Tool Use） | ❌ 不支援 |
| **JSON Object Mode** | ✅ 支援 | ✅ 支援 |
| **Tool Call Arguments 格式** | 理論可靠，但有實際回報問題 | 有時產生無效 JSON |
| **Thinking Tags 干擾** | 有回報 reasoning tokens 洩漏 | `<think>` 標籤有時出現 |

### 5.3 繁體中文能力比較

| 面向 | GPT-OSS-120B | Qwen3 32B |
|------|-------------|-----------|
| **C-Eval（中文理解）** | **20%** | **優秀** |
| **訓練資料語言** | 以英文為主 | 119 語言，中文為核心 |
| **繁簡區分** | ❌ 極差 | ✅ 良好 |
| **台灣用語** | ❌ 幾乎不支援 | ⚠️ 中等偏好 |
| **適合中文 LINE Bot** | ❌ 完全不適合 | ✅ 適合 |

### 5.4 成本比較

| 面向 | GPT-OSS-120B | Qwen3 32B |
|------|-------------|-----------|
| **免費方案** | ✅ 可用 | ✅ 可用 |
| **每日 token 上限** | 200K（偏少） | 500K（充裕） |
| **每分鐘請求** | 30 RPM | 60 RPM |
| **付費 Input** | $0.15/M | $0.29/M |
| **付費 Output** | $0.60/M | $0.59/M |

---

## 6. 對 MyClaw 程式碼的影響分析

### 6.1 如果切換到 GPT-OSS-120B

#### `config.ts` 修改
```typescript
// 變更 Groq model ID
groq: {
  apiKey: groqKey,
  model: 'openai/gpt-oss-120b',  // 從 'qwen/qwen3-32b' 改
},
```

#### `llm.ts` 需要的修改

1. **移除 `/no_think` 邏輯**：GPT-OSS 不使用 Qwen 的 `/no_think` 機制
2. **新增 `reasoning_effort` 參數**：控制推理深度
3. **新增 `include_reasoning` 參數**：控制是否包含推理過程
4. **修改 `cleanGroqContent()`**：GPT-OSS 的推理格式不同於 Qwen
5. **處理 Structured Outputs 與 Tool Use 互斥**：這是最大的工程挑戰

```typescript
// GPT-OSS 的 Groq API 呼叫需要調整
const response = await groqClient.chat.completions.create({
  model,
  max_completion_tokens: maxTokens,  // 注意：GPT-OSS 用 max_completion_tokens
  messages,
  reasoning_effort: 'low',           // 新增：控制推理深度
  include_reasoning: false,          // 新增：不包含推理過程
  ...(tools && tools.length > 0 ? { tools } : {}),
  // 注意：不能同時設定 response_format 和 tools
});
```

#### `skill-manager.ts` 的影響

**核心問題**：`parseSkillFromText()` 依賴 Tool Calling 來結構化輸出技能配置。

- GPT-OSS 的 Tool Calling 在 Groq 上有已知的可靠性問題
- `tool_choice: "required"` 不保證生效
- 需要額外的 fallback 邏輯

#### `skill-executor.ts` 的影響

- System prompt 遵循性需要重新驗證
- GPT-OSS 建議將指令放在 user message 而非 system prompt
- 可能需要重構 `buildSkillSystemPrompt()` 函式

### 6.2 如果切換到 Kimi K2-0905（推薦替代方案）

#### `config.ts` 修改
```typescript
groq: {
  apiKey: groqKey,
  model: 'moonshotai/kimi-k2-instruct-0905',
},
```

#### `llm.ts` 修改

1. **移除 `/no_think` 邏輯**：Kimi K2 不需要
2. **保留 `cleanGroqContent()`**：可能需要調整以清理 Kimi K2 的輸出
3. **其他 OpenAI 相容格式不需修改**：Kimi K2 完全相容

```typescript
// Kimi K2 的呼叫方式基本不變，移除 /no_think 即可
const response = await groqClient.chat.completions.create({
  model,
  max_tokens: maxTokens,
  messages,  // 不需要附加 /no_think
  ...(tools && tools.length > 0 ? { tools } : {}),
});
```

#### `skill-manager.ts` 的影響
- ✅ Tool Calling schema 不需調整（相容 OpenAI 格式）
- ✅ Parallel Tool Calling 支援
- ✅ ~95% 首次成功率，比 Qwen3 更可靠

### 6.3 如果保留 Qwen3 32B（加強穩定性方案）

#### `llm.ts` 加強 JSON 驗證

```typescript
// 加強 tool call arguments 的驗證和修復
function safeJsonParse(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    // 嘗試修復常見的 JSON 問題
    let cleaned = str;
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?```\s*$/i, '');
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, '');
    cleaned = cleaned.trim();
    try {
      return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      console.error(`[LLM] 無法解析 tool call arguments: ${str}`);
      return {};
    }
  }
}
```

#### `skill-manager.ts` 加強 fallback

```typescript
// 如果 Tool Calling 失敗，改用 JSON mode 直接解析
if (!response.toolCalls || response.toolCalls.length === 0) {
  // Fallback: 嘗試從 content 中解析 JSON
  if (response.content) {
    try {
      const parsed = extractJsonFromContent(response.content);
      if (parsed && parsed.name && parsed.trigger) {
        return parsed as SkillCreateRequest;
      }
    } catch {
      // JSON 解析失敗，確認不是技能建立意圖
    }
  }
  return null;
}
```

---

## 7. 建議方案

### 方案 A：切換到 Kimi K2-0905（推薦）

| 優點 | 缺點 |
|------|------|
| Tool Calling ~95% 首次成功率 | 速度較慢（200 TPS vs Qwen3 的 662 TPS） |
| 繁體中文原生雙語支援 | 付費價格較貴（$1.00/M input） |
| Parallel Tool Calling 支援 | 免費 TPD 只有 300K（vs Qwen3 的 500K） |
| 256K context window | 仍為 Preview 狀態 |
| Best-effort Structured Outputs | 社群也有少數 tool call 問題回報 |
| 程式碼改動最小 | |

**修改量估計**：約 30 行程式碼修改（主要是移除 `/no_think` 邏輯和更新 model ID）。

### 方案 B：保留 Qwen3 32B + 加強穩定性（次推薦）

| 優點 | 缺點 |
|------|------|
| 零風險，不需切換模型 | 不解決 JSON 輸出根本問題 |
| 最大免費額度（500K TPD） | System Prompt 遵循性仍不佳 |
| 速度最快（662 TPS） | Structured Output 不支援 strict |
| 中文能力優秀 | 需要投入時間加強 prompt 工程 |
| 已有運行經驗 | |

**修改量估計**：約 50-80 行程式碼修改（加強 JSON 驗證、fallback 邏輯、prompt 工程）。

### 方案 C：切換到 GPT-OSS-120B（不推薦）

| 優點 | 缺點 |
|------|------|
| TauBench 頂級 Tool Calling | ❌ 繁中能力極差（C-Eval 20%） |
| Strict Mode Structured Output | ❌ Structured Outputs 與 Tool Use 互斥 |
| 推理能力強（reasoning mode） | ❌ 社群回報 tool 被忽略的問題 |
| Production 狀態 | ❌ 免費 TPD 只有 200K |
| | ❌ System Prompt 需要重構 |
| | ❌ 程式碼改動量大 |

**修改量估計**：約 150-200 行程式碼修改（重構 prompt 架構、處理推理輸出、新增大量 fallback 邏輯）。

### 方案 D：混合使用多模型（進階方案）

```typescript
// 概念：根據任務類型選擇最適合的模型
function selectModel(task: 'skill_parse' | 'skill_execute' | 'chat'): string {
  switch (task) {
    case 'skill_parse':
      return 'moonshotai/kimi-k2-instruct-0905';  // Tool Calling 最可靠
    case 'skill_execute':
      return 'qwen/qwen3-32b';                     // 中文最好，速度最快
    case 'chat':
      return 'qwen/qwen3-32b';                     // 通用對話
  }
}
```

---

## 8. 最終建議

### 短期（立即可做）
1. **保留 Qwen3 32B** 作為主力模型
2. 加強 `llm.ts` 的 JSON 驗證和修復邏輯
3. 在 `skill-manager.ts` 增加 Tool Calling 失敗時的 fallback 解析

### 中期（下一版本）
1. **新增 Kimi K2-0905 作為 skill parsing 專用模型**
2. 在 `config.ts` 新增 `skillModel` 欄位，支援為技能解析指定不同模型
3. 通用對話仍使用 Qwen3 32B（速度快、免費額度充裕）

### 不建議
- ❌ 將主力模型切換到 GPT-OSS-120B（中文能力是致命缺陷）
- ❌ 完全依賴單一模型的 Structured Output（所有模型都有不同程度的可靠性問題）

---

## 9. 參考來源

### OpenAI GPT-OSS
- [OpenAI - Introducing gpt-oss](https://openai.com/index/introducing-gpt-oss/)
- [openai/gpt-oss-120b - Hugging Face](https://huggingface.co/openai/gpt-oss-120b)
- [GitHub - openai/gpt-oss](https://github.com/openai/gpt-oss)
- [GPT-OSS-120B 多語言支援問題討論](https://huggingface.co/openai/gpt-oss-120b/discussions/19)
- [Is GPT-OSS Good? 學術評估論文](https://arxiv.org/html/2508.12461v1)
- [GPT-OSS Benchmark 分析](https://www.cognativ.com/blogs/post/gpt-oss-120b-benchmark-key-insights-and-best-practices/331)

### Groq 平台
- [Groq Supported Models](https://console.groq.com/docs/models)
- [Groq Rate Limits](https://console.groq.com/docs/rate-limits)
- [Groq Tool Use 文件](https://console.groq.com/docs/tool-use)
- [Groq Structured Outputs 文件](https://console.groq.com/docs/structured-outputs)
- [Groq Reasoning 文件](https://console.groq.com/docs/reasoning)
- [Groq GPT-OSS-120B 模型頁面](https://console.groq.com/docs/model/openai/gpt-oss-120b)
- [Groq Kimi K2-0905 模型頁面](https://console.groq.com/docs/model/moonshotai/kimi-k2-instruct-0905)
- [Groq 定價](https://groq.com/pricing)
- [Groq 免費方案 FAQ](https://community.groq.com/t/is-there-a-free-tier-and-what-are-its-limits/790)
- [Groq GPT-OSS 改進公告](https://groq.com/blog/gpt-oss-improvements-prompt-caching-and-lower-pricing)

### 社群問題回報
- [GPT-OSS-120B 忽略 Tools 問題](https://community.groq.com/t/gpt-oss-120b-ignoring-tools/385)
- [GPT-OSS Tool Calling 錯誤](https://community.groq.com/t/tool-calling-errors-on-both-gpt-oss-models/406)
- [GPT-OSS 推理 Token 洩漏問題](https://community.groq.com/t/bug-gpt-oss-120b-reasoning-tokens-and-gibberish-output-appearing-in-responses-despite-configuration-to-hide-reasoning/670)
- [Kimi K2 Tool Call 問題](https://community.groq.com/t/kimi-k2-currently-failing-many-tool-calls/549)

### 模型比較
- [GPT-OSS vs Qwen3 比較](https://artificialanalysis.ai/models/comparisons/gpt-oss-120b-vs-qwen3-32b-instruct-reasoning)
- [OpenAI GPT-OSS Benchmarks 比較](https://www.clarifai.com/blog/openai-gpt-oss-benchmarks-how-it-compares-to-glm-4.5-qwen3-deepseek-and-kimi-k2)
- [Slator - GPT-OSS 語言產業分析](https://slator.com/why-openais-open-weight-gpt-oss-is-getting-the-language-industrys-attention/)
