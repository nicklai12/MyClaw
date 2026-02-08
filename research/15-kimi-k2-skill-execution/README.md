# Kimi K2 技能執行能力研究

## 問題描述

MyClaw 目前使用 `moonshotai/kimi-k2-instruct-0905` 作為 Groq 免費模型。使用者反映：

- **能正確回答「有什麼 skills」** — 技能列表功能正常
- **無法正確操作/執行 skill** — 技能建立或執行失敗

這表示系統的「查詢類」功能正常，但「AI 驅動類」功能有問題。

---

## 現有架構分析

### 訊息路由流程

`handleTextMessage()` 的處理順序（`src/index.ts:88-208`）：

```
使用者訊息 → 技能匯入判斷 → 技能管理判斷 → 技能匹配+執行 → 一般對話
```

1. **技能匯入** (`isSkillImportIntent`) — 檢查是否為 GitHub URL
2. **技能管理** (`isSkillManagementIntent`) — 關鍵字匹配（純字串比對，不需 LLM）
3. **技能匹配+執行** (`findMatchingSkill` + `executeSkill`) — 觸發匹配 + LLM 執行
4. **一般對話** (`chat`) — LLM 自由對話

**關鍵發現**：「列出技能」走的是步驟 2，只做關鍵字匹配（`src/skill-manager.ts:87-100`），完全不需要 LLM。這就是為什麼它永遠正常運作。

### 技能建立流程（Tool Calling）

`parseSkillFromText()` (`src/skill-manager.ts:110-163`)：

```
使用者描述 → chat() + tools=[create_skill] → LLM Tool Calling → 解析 toolCalls → 驗證必要欄位 → SkillCreateRequest
```

- 依賴 LLM 的 **Tool Calling** 能力來結構化輸出
- 如果 Tool Calling 失敗 → `toolCalls` 為空或格式錯誤 → 回傳 `null` → 技能無法建立

### 技能執行流程

`executeSkill()` (`src/skill-executor.ts:80-111`)：

```
觸發匹配成功 → 載入使用者記憶 → 組合 system prompt（技能指令+記憶）→ chat() → 回傳 AI 回應
```

- 依賴 LLM 的 **system prompt 遵循能力** 來正確執行技能指令
- 執行時 `complexity: 'simple'`，不使用 Tool Calling

---

## 問題根因分析

### 根因 1：Kimi K2 的 Tool Calling 在 Groq 上不穩定（影響技能建立）

這是**最可能的主因**。根據 Groq Community 多篇報告：

**錯誤類型 A — Tool Call 格式錯誤：**
模型產生重複的 section markers 和錯誤的函式命名：
```
<|tool_calls_section_begin|><|tool_calls_section_begin|> funcion check_check_availability:0
```

**錯誤類型 B — Tool Call 驗證失敗：**
```
tool call validation failed: attempted to call tool 'write' which was not in request.tools
```

**錯誤類型 C — 通用失敗：**
```
Failed to call a function. Please adjust your prompt. See 'failed_generation' for more details.
```

**失敗率統計：**
- Groq Community 報告：~5-10% 的 Tool Call 會失敗
- vLLM 初始測試：1200+ 個潛在 tool calls 中僅 218 個成功（<20% 成功率）
- vLLM 修復後：4000 個請求中 3997 個成功（99.925%）— 但這是在修復了 3 個關鍵 bug 之後
- Groq 截至 2025 年 10 月仍在改善中，承諾實作 constrained decoding

**對 MyClaw 的影響：**
- `parseSkillFromText()` 依賴 Tool Calling 來建立技能
- 如果 Tool Calling 失敗，`response.toolCalls` 為空陣列
- 函式回傳 `null`，技能無法建立
- 使用者描述了想要的功能，但系統無法正確解析為結構化的技能配置

### 根因 2：Tool Call ID 格式不兼容

Kimi K2 期望 Tool Call ID 遵循特殊格式：
```
functions.{func_name}:{idx}
```

例如：`functions.create_skill:0`

但 Groq 的 OpenAI 兼容 API 可能不會產生這個格式的 ID。當 ID 格式不匹配時：
- 模型可能在 multi-turn 對話中崩潰
- 會出現 special tokens 洩漏到 content 欄位中

MyClaw 目前是**單次 Tool Calling**（不做 multi-turn tool loop），所以這個問題影響較小，但仍可能導致偶發性失敗。

### 根因 3：Structured Output / JSON Schema 支援不完整

Groq Community 報告 Kimi K2-0905 的 `json_schema` response format 一度完全不支援。雖然後來修復，但：
- `parseSkillFromText()` 的 `create_skill` 工具定義了一個複雜的嵌套 JSON Schema（包含 `trigger` 子物件）
- Kimi K2 在解析複雜嵌套結構時可能產生不完整或畸形的 JSON
- `safeJsonParse()` (`src/llm.ts:420-427`) 會 fallback 到空物件 `{}`
- 空物件導致驗證失敗（缺少 `name`、`trigger`、`prompt`），函式回傳 `null`

### 根因 4：技能觸發條件建立不正確（間接問題）

即使 Tool Calling 偶爾成功，如果產生的 `trigger_value` 不正確：
- `keyword` 觸發：關鍵字與使用者實際說的話不匹配 → `findMatchingSkill()` 找不到匹配
- `pattern` 觸發：正則表達式不正確 → 匹配失敗
- `always` 觸發：這個最可靠，因為不需要匹配

例如：使用者說「當我說翻譯時幫我翻譯」，但 AI 設定 `trigger_value: "翻譯英文"` 而非 `"翻譯"` → 使用者說「翻譯」時無法觸發。

### 根因 5：executeSkill 的 System Prompt 遵循能力

即使技能成功建立且觸發成功，`executeSkill()` 仍需 LLM 正確遵循 system prompt 中的技能指令。

根據研究，Kimi K2 的 system prompt 遵循能力**整體良好**（中英雙語優秀），但在 Groq 推理下可能因為：
- 較短的輸出（Groq 限制 1300-1500 tokens）
- 推理速度優先導致的品質下降

這個根因的影響**相對較小**，因為一般的技能 prompt 不會特別複雜。

---

## Kimi K2 模型特性與限制

### 優勢
- 中英雙語能力優秀
- 整體推理能力強（MoE 架構，1T 參數，32B 活躍參數）
- 官方 API 上 Tool Calling 可靠性極高
- 免費使用（Groq 提供）

### 在 Groq 上的已知限制

| 問題 | 嚴重程度 | 狀態 |
|------|----------|------|
| Tool Calling 偶發失敗（~5-10%） | **高** | Groq 持續修復中 |
| Tool Call ID 格式不兼容 | 中 | 需要框架層面修復 |
| JSON Schema response format 不穩定 | 中 | 已修復但仍需觀察 |
| 輸出較短（~1300-1500 tokens） | 低 | Groq 推理限制 |
| 速度波動（170-230 TPS） | 低 | 正常範圍 |

### Provider 間的品質差異

根據 16x.engineer 的評估，不同 Provider 上 Kimi K2 的表現差異顯著：
- **Moonshot AI（官方）**：Tool Calling 100% 可靠，但速度最慢（~10 TPS）
- **Groq**：速度最快（170-230 TPS），但 Tool Calling 和結構化輸出有問題
- **DeepInfra**：品質最高（fp4 量化反而表現更好），速度中等

---

## 解決方案建議

### 方案 A：增加 Tool Calling 重試與 Fallback（短期，推薦）

在 `parseSkillFromText()` 中增加重試邏輯：

```typescript
// 重試最多 2 次
for (let attempt = 0; attempt < 3; attempt++) {
  const response = await chat({ ... tools: [CREATE_SKILL_TOOL] ... });
  if (response.toolCalls?.length > 0) {
    // 成功
    break;
  }
  // 失敗，重試
}

// 如果 3 次都失敗，改用 JSON 模式 fallback
const response = await chat({
  messages: [{ role: 'user', content: `${userText}\n\n請以 JSON 格式回傳技能配置...` }],
  jsonMode: true,
});
```

**優點**：不需換模型，利用重試提高成功率
**缺點**：增加延遲，消耗更多 API 配額

### 方案 B：技能建立改用 Prompt-based JSON 而非 Tool Calling（中期，推薦）

完全繞過 Tool Calling，改用 prompt 指令讓 AI 直接輸出 JSON：

```typescript
const systemPrompt = `...請用以下 JSON 格式回傳技能配置：
{
  "name": "...",
  "description": "...",
  "trigger": { "type": "keyword|pattern|cron|manual|always", "value": "..." },
  "prompt": "..."
}
只回傳 JSON，不要其他文字。`;
```

然後用 `JSON.parse()` 解析回應。

**優點**：完全避開 Tool Calling 問題，Kimi K2 的文字生成能力穩定
**缺點**：JSON 輸出仍可能有格式問題（但比 Tool Calling 可靠）；需要實作 JSON 清理邏輯

### 方案 C：關鍵操作切換到其他模型（中期）

在 `config.ts` 的模型註冊表中，為 Tool Calling 密集的操作指定不同模型：

- **技能建立**（需要 Tool Calling）→ `meta-llama/llama-3.3-70b-versatile`（Tool Calling 穩定）或 Claude Haiku
- **技能執行**（只需文字生成）→ Kimi K2（中文能力優秀）
- **一般對話** → Kimi K2

**優點**：針對性解決問題
**缺點**：增加架構複雜度；如果用 Claude 則增加成本

### 方案 D：回退到 Qwen3-32B（保守方案）

將 `GROQ_MODEL` 改回 `qwen/qwen3-32b`。Qwen3 的 Tool Calling 在 Groq 上相對穩定。

**優點**：最簡單的修復
**缺點**：失去 Kimi K2 的中文能力優勢；Qwen3 有自己的問題（`/no_think` 和 `<think>` tag 清理）

### 方案 E：混合策略（長期最佳）

結合方案 B 和 C：

1. 技能建立：使用 Prompt-based JSON（不依賴 Tool Calling）
2. 技能執行：使用 Kimi K2（純文字生成，中文優秀）
3. 記憶更新：使用 Kimi K2（純文字生成）
4. 一般對話：使用 Kimi K2

只有技能建立需要結構化輸出，其他都是純文字生成，Kimi K2 完全能勝任。

---

## 結論

### 問題根因排序

1. **Kimi K2 在 Groq 上的 Tool Calling 不穩定**（~5-10% 失敗率）— 這是最主要的原因
2. **Tool Call 格式問題**（ID 格式、嵌套 JSON Schema 解析）— 次要原因
3. **觸發條件建立不精確** — 間接影響
4. **System Prompt 遵循能力** — 影響最小

### 為什麼「列出技能」正常但「操作技能」失敗

| 功能 | 依賴 | 是否需要 LLM | 為什麼正常/失敗 |
|------|------|-------------|----------------|
| 列出技能 | 關鍵字匹配 + DB 查詢 | 否 | 純字串比對，100% 可靠 |
| 建立技能 | LLM Tool Calling | 是（Tool Calling） | Kimi K2 Tool Calling ~90-95% 成功率 |
| 執行技能 | 觸發匹配 + LLM 文字生成 | 是（文字生成） | 觸發條件可能建立不正確 |
| 匯入技能 | URL 解析 + LLM 轉換 | 是（文字生成） | 較少依賴 Tool Calling |

### 建議優先級

1. **立即**：在 `parseSkillFromText()` 增加重試邏輯（方案 A）
2. **短期**：改用 Prompt-based JSON 取代 Tool Calling（方案 B）
3. **中期**：實作混合策略，針對不同操作使用最適合的模型/方法（方案 E）

---

## 參考資料

- [Groq Community: Kimi K2 Tool Call Issues](https://community.groq.com/t/groq-kimi-k2-tool-call-issues/430)
- [Groq Community: Kimi K2 Currently Failing Many Tool Calls](https://community.groq.com/t/kimi-k2-currently-failing-many-tool-calls/549)
- [Groq Community: Kimi K2-0905 Errors with Tool Calls](https://community.groq.com/t/moonshotai-kimi-k2-instruct-0905-errors-with-tool-calls/599)
- [Groq Community: Structured Outputs Not Working with Kimi K2-0905](https://community.groq.com/t/structured-outputs-not-working-with-the-moonshotai-kimi-k2-instruct-0905/536)
- [vLLM Blog: Chasing 100% Accuracy with Kimi K2 Tool-Calling](https://blog.vllm.ai/2025/10/28/Kimi-K2-Accuracy.html)
- [Kimi K2 Provider Evaluation: Performance Differences Across Platforms](https://eval.16x.engineer/blog/kimi-k2-provider-evaluation-results)
- [HuggingFace: Kimi K2-0905 Tool Call Guidance](https://huggingface.co/moonshotai/Kimi-K2-Instruct-0905/blob/main/docs/tool_call_guidance.md)
- [Groq Community: Kimi K2 0905 Errors with JSON Schema](https://community.groq.com/t/moonshotai-kimi-k2-instruct-0905-errors-with-json-schema/679)
