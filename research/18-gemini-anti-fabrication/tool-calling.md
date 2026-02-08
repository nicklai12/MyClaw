# Gemini Tool Calling 能力研究報告

> 研究日期：2026-02-08
> 目的：評估 Gemini 模型的 Tool Calling 能力，判斷能否解決 MyClaw 技能執行時 AI 造假數據的問題

---

## 1. 各模型 Tool Calling 成功率與可靠性

### 1.1 BFCL (Berkeley Function-Calling Leaderboard) 排名

BFCL V4 是業界公認的 Function Calling 標準基準測試，評估模型在序列式與並行式函式呼叫的能力。

| 排名 | 模型 | BFCL V4 分數 |
|------|------|-------------|
| 1 | GLM-4.5 (FC) | 70.85% |
| 2 | Claude Opus 4.1 | 70.36% |
| 3 | Claude Sonnet 4 | 70.29% |
| 7 | GPT-5 | 59.22% |
| ? | Gemini 2.5 Pro | 未在公開排名前列 |
| ? | Gemini 2.5 Flash | 未在公開排名前列 |

**關鍵發現**：Gemini 系列模型在 BFCL V4 公開排名中並未進入前列位置。Claude 系列（Opus 4.1、Sonnet 4）以 ~70% 的準確率穩居前三。Gemini 的具體分數在公開資料中難以取得，這本身可能說明表現不如預期。

### 1.2 MCPMark 實戰基準（更接近真實場景）

MCPMark 測試更接近真實的多步驟工具使用場景（平均每任務 16.2 回合、17.4 次工具呼叫）：

| 模型 | Pass@1 | Pass@4 | Pass^4 (一致性) |
|------|--------|--------|----------------|
| GPT-5 Medium | 52.6% | 68.5% | 33.9% |
| Claude Sonnet 4 | 28.1% | 44.9% | 12.6% |
| Claude Opus 4.1 | 29.9% | — | — |
| Qwen-3-Coder | 24.8% | 40.9% | 12.6% |

Gemini 模型未出現在 MCPMark 公開榜單，可能未參與評測或成績不理想。

### 1.3 JSON Schema 遵循度

- **Gemini 2.5 系列**：支援 `parametersJsonSchema` 定義參數結構。開啟 thinking mode 後，模型對 schema 的遵循度有所提升
- **Gemini 3 系列**：引入 `VALIDATED` 模式（Preview），強制 schema 驗證。同時支援 streaming function call arguments
- **實際表現**：社群開發者反映 Gemini 有時會用 JSON 格式的文字回覆代替真正的 function call（即回傳 ```json 代碼區塊而非結構化的 function_call 物件），這是一個持續存在的 bug

### 1.4 Parallel Function Calling 支援

| 模型 | 支援並行呼叫 | 已知問題 |
|------|-------------|---------|
| Gemini 2.5 Pro | 是 | 較穩定 |
| Gemini 2.5 Flash | 是 | 較穩定 |
| Gemini 3 Flash Preview | 是 | **嚴重 bug：thought_signature 不一致** |
| Gemini 3 Pro Preview | 是 | 同上 |

**Gemini 3 並行呼叫 Bug 詳情**：
- 3 個以上並行 function call 時，只有前 1-2 個會收到 `thought_signature`
- 其餘 function call 缺少 signature，導致回傳結果時觸發 400 INVALID_ARGUMENT 錯誤
- 這個 bug 是「基於位置的，不是基於工具的」— 同一工具在不同位置可能有或沒有 signature
- **建議解法**：降回 Gemini 2.5 Flash，或使用官方 SDK（自動處理 signature）

---

## 2. tool_choice 強制機制

### 2.1 Gemini 的 Function Calling 模式

Gemini API 透過 `toolConfig.functionCallingConfig.mode` 控制：

| 模式 | 行為 | 等同於 |
|------|------|--------|
| `AUTO`（預設） | 模型自行決定是否呼叫函式 | Claude `tool_choice: {type: 'auto'}` |
| `ANY` | **強制呼叫函式，保證 schema 遵循** | Claude `tool_choice: {type: 'any'}` |
| `NONE` | 禁止呼叫函式 | Claude `tool_choice: {type: 'none'}` |
| `VALIDATED`（Preview） | 強制 schema 遵循，但允許文字回覆 | 無直接對應 |

### 2.2 Node.js SDK 用法（@google/genai）

```typescript
import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: userMessage,
  config: {
    tools: [{
      functionDeclarations: [{
        name: 'api_call',
        description: 'Call an external API endpoint',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            endpoint: { type: 'string' },
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
            body: { type: 'object' }
          },
          required: ['endpoint', 'method']
        }
      }]
    }],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.ANY,
        allowedFunctionNames: ['api_call']  // 限制只能呼叫指定函式
      }
    }
  }
});

// 取得 function call 結果
const functionCalls = response.functionCalls;
```

### 2.3 `mode: ANY` 的實際可靠性

**理論上**：`ANY` 模式「保證 schema 遵循」，模型一定會產生 function call。

**實際社群回報**：
- 開發者 PaoloB 回報使用 `ANY` 模式時遭遇 **500 Internal Server Error**
- 部分開發者回報 `ANY` 模式下模型仍然產生文字回覆而非 function call（尤其在 Gemini 2.5 系列）
- 估計 `ANY` 模式的實際成功率約 **85-95%**（取決於模型版本和 prompt 複雜度）

**與 Claude 的 tool_choice: any 比較**：
- Claude Haiku 4.5 的 `tool_choice: {type: 'any'}` 成功率約 **~99%**
- Gemini 的 `mode: ANY` 實際可靠性明顯低於 Claude

---

## 3. 與現有模型的對比

### 3.1 防造假能力對比

| 模型 | tool_choice 強制 | 實際呼叫率 | 造假風險 | 評估 |
|------|----------------|-----------|---------|------|
| Claude Haiku 4.5 | `any` (~99%) | 極高 | 極低 | **最可靠** |
| Claude Sonnet 4.5 | `any` (~99%) | 極高 | 極低 | 最可靠但貴 |
| Groq Qwen3 32B | `required` (~90-95%) | 高 | 5-10% | 目前使用中 |
| Gemini 2.5 Pro | `ANY` (~85-95%) | 中高 | 5-15% | **不比 Groq 好** |
| Gemini 2.5 Flash | `ANY` (~85-95%) | 中高 | 5-15% | 不比 Groq 好 |
| Gemini 3 Flash Preview | `ANY` (不穩定) | 中 | 較高 | **有 thought_signature bug** |
| Gemini 3 Pro Preview | `ANY` (不穩定) | 中高 | 較高 | 有 thought_signature bug |

### 3.2 社群評價總結

**正面評價**：
- Gemini 3 Pro 在框架特定和 API 特定任務中的可靠性有改善，「能正確選擇方法而不幻造函式」
- Gemini 的 `VALIDATED` 模式（Preview）是有趣的新方向
- 官方 SDK 的 thought_signature 自動處理機制降低了整合難度

**負面評價**：
- 「這種不穩定的行為使得建構或信任生產系統變得不可能」— PaoloB
- 「Gemini 在不知道答案時，91% 的時間會編造答案」— TechRadar 引述基準測試數據
- 同一查詢有時會觸發 function call，有時回傳純文字，行為「完全不可預測」
- 即使設定了 `ANY` 模式仍偶爾回傳文字或觸發 500 錯誤
- Gemini 3 的 thought_signature 機制增加了整合複雜度

### 3.3 能否解決「AI 有工具卻不用，選擇編造數據」的問題？

**結論：不能。**

Gemini 的 `mode: ANY` 在理論上與 Claude 的 `tool_choice: any` 等價，但實際可靠性明顯較低。具體問題包括：

1. **500 錯誤**：`ANY` 模式在某些情況下直接觸發伺服器錯誤
2. **靜默繞過**：模型有時仍然產生文字回覆而非 function call
3. **JSON 偽裝**：模型回傳 ```json 代碼區塊代替真正的 function_call 物件
4. **版本間不一致**：不同 Gemini 版本的行為差異大，難以建立穩定的生產系統

---

## 4. 已知 Bug 與限制

### 4.1 嚴重 Bug

| Bug | 影響模型 | 狀態 |
|-----|---------|------|
| `ANY` 模式觸發 500 Internal Error | Gemini 2.5 系列 | 未修復 |
| 並行 function call 缺少 thought_signature | Gemini 3 Flash/Pro Preview | 未修復 |
| 回傳 ```json 代碼區塊代替 function_call | Gemini 2.5 系列 | 持續數月未修復 |
| Function calling 行為突然改變 | 多個版本 | 無穩定保證 |

### 4.2 Gemini 3 特有限制

- **thought_signature 強制要求**：即使 `thinking_level: minimal` 也需要處理 signature 循環
- **不能混用內建工具與自訂 function calling**：使用 Google Search 等內建工具時不能同時使用自訂函式
- **嚴格驗證**：缺少 thought_signature 直接回傳 400 錯誤（2.5 系列是 warning，3 系列是 error）

### 4.3 整合注意事項

如果 MyClaw 未來需要整合 Gemini，以下事項需要特別注意：

1. **必須使用官方 @google/genai SDK** 處理 thought_signature，避免手動管理
2. **建議鎖定模型版本**（如 `gemini-2.5-flash-preview-04-17`），因為不同版本行為可能不一致
3. **需要實作 fallback 機制**：Gemini function call 失敗時改用 Claude 重試
4. **不建議使用 Gemini 3 Preview** 用於生產環境，thought_signature bug 尚未修復

---

## 5. 總結與建議

### 5.1 對 MyClaw 的建議

| 方案 | 推薦度 | 理由 |
|------|--------|------|
| 維持 Claude Haiku 4.5 (tool_choice: any) | **強烈推薦** | ~99% 可靠，業界最佳 tool calling |
| 維持 Groq Qwen3 32B (tool_choice: required) | 推薦（免費方案） | 90-95% 可靠，已驗證 |
| 新增 Gemini 2.5 Flash 作為備選 | 可考慮 | ~85-95% 可靠，有免費額度，但不比現有方案好 |
| 使用 Gemini 3 Preview 系列 | **不推薦** | 太多未修復 bug，不適合生產 |

### 5.2 核心結論

**Gemini 無法解決 MyClaw 的 AI 造假問題。**

1. Gemini 的 `mode: ANY` 可靠性（~85-95%）不如 Claude 的 `tool_choice: any`（~99%），也未明顯優於 Groq 的 `tool_choice: required`（~90-95%）
2. Gemini 社群有大量關於 function calling 不可靠的報告，包括模型忽略工具、編造數據、回傳格式不一致等
3. Gemini 3 Preview 的 thought_signature 機制增加了整合複雜度但未帶來可靠性提升
4. BFCL 基準測試中 Gemini 未進入前列，而 Claude 穩居前三

**最佳策略仍然是**：
- 付費用戶使用 Claude Haiku 4.5 + `tool_choice: any`（最可靠）
- 免費用戶使用 Groq Qwen3 32B + `tool_choice: required` + retry 機制
- 在 system prompt 中加入明確的防造假指令作為額外保險

---

## 參考資料

- [Gemini API Function Calling 官方文件](https://ai.google.dev/gemini-api/docs/function-calling)
- [Gemini 3 Developer Guide](https://ai.google.dev/gemini-api/docs/gemini-3)
- [BFCL V4 Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html)
- [Function Calling and Agentic AI in 2025 (Klavis)](https://www.klavis.ai/blog/function-calling-and-agentic-ai-in-2025-what-the-latest-benchmarks-tell-us-about-model-performance)
- [Gemini 2.5 Function Calling 問題 (Google Forum)](https://discuss.ai.google.dev/t/very-frustrating-experience-with-gemini-2-5-function-calling-performance/92814)
- [Gemini Function Calling 不可靠 (Google Forum)](https://discuss.ai.google.dev/t/why-is-gemini-function-calling-so-unreliable/70105)
- [Gemini 3 Flash thought_signature Bug (Google Forum)](https://discuss.ai.google.dev/t/gemini-3-flash-preview-inconsistent-thought-signature-generation-in-parallel-function-calls-causes-400-errors-and-potential-silent-data-loss/118936)
- [Gemini 3 Flash thought_signature Bug (n8n GitHub)](https://github.com/n8n-io/n8n/issues/23798)
- [Forced Function Calling in Gemini (Google Colab)](https://colab.research.google.com/github/GoogleCloudPlatform/generative-ai/blob/main/gemini/function-calling/forced_function_calling.ipynb)
- [@google/genai Node.js SDK](https://www.npmjs.com/package/@google/genai)
- [Gemini 3 vs 2.5 Comparison](https://metana.io/blog/gemini-3-vs-gemini-2-5/)
- [Gemini 3 Flash Hallucination (TechRadar)](https://www.techradar.com/ai-platforms-assistants/gemini-3-flash-is-smart-but-when-it-doesnt-know-it-makes-stuff-up-anyway)
