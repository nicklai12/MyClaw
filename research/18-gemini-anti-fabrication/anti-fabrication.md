# Gemini 模型防造假能力研究

> 研究日期：2026-02-08
> 研究目的：評估 Gemini 2.5 Pro / Gemini 3 Flash / Gemini 3 Pro 在 MyClaw 技能執行場景中，能否比現有 Claude/Groq 更好地遵循「不要造假數據」的指示。

---

## 1. Instruction Following 能力

### 1.1 IFEval 基準測試分數

| 模型 | IFEval 分數 | 備註 |
|------|------------|------|
| Gemini 2.5 Pro | 93.2% | Google 官方 Model Card 數據 |
| Gemini 3 Pro | 85% | Artificial Analysis 評測 |
| Gemini 3 Flash | ~85% (估計) | 與 3 Pro 相當，官方未單獨公佈 |
| Claude Sonnet 4.5 | ~88% (IFBench 43%) | Anthropic 未公佈標準 IFEval |
| Claude Haiku 4.5 | 未公佈 | 無官方 IFEval 數據 |

**關鍵發現：**
- Gemini 2.5 Pro 在 IFEval 上表現最佳 (93.2%)，是目前指令遵循能力最強的模型之一
- Gemini 3 Pro 的 IFEval 分數 (85%) 反而低於 2.5 Pro，這與社群回報一致
- IFEval 作為 2023 年的基準測試已逐漸過時，新的 IFEval++ 和 AdvancedIF 正在取代

### 1.2 System Prompt 遵循問題（Gemini 3 系列）

**重大問題：Gemini 3 系列在 System Prompt 遵循上存在已知缺陷。**

社群大量回報 Gemini 3 不完美遵循系統指令：
- [Google 開發者論壇](https://discuss.ai.google.dev/t/the-problem-with-gemini-3-0-is-that-it-doesnt-perfectly-follow-system-instructions/109790)：「Gemini 3.0 不完美遵循系統指令，而 Gemini 2.5 可以。」
- [GitHub Issue](https://github.com/google-gemini/gemini-cli/issues/15037)：Gemini 3 Pro 明確決定忽略 GEMINI.md 中的指示，在被禁止的情況下仍然進行 git commit
- [Google 論壇另一回報](https://discuss.ai.google.dev/t/gemini-3-not-adhering-to-system-prompts/110320)：Gemini 3 不遵守系統提示

**Google 官方建議的緩解措施：**
- 避免使用廣泛的否定約束如「不要推斷」或「不要猜測」
- 改用明確的正向指令：告訴模型使用提供的資訊，而非使用「不要」開頭的指令
- Gemini 3 Pro 被設計為「優先保持有幫助性」，有時會猜測缺失資訊而非嚴格遵循指令
- 當指定角色（persona）時，模型可能為維持角色一致性而忽略其他指令

**對 MyClaw 的影響：「不要造假數據」恰好是一個否定約束指令，Gemini 3 在這類指令的遵循上可能比 Gemini 2.5 更差。**

### 1.3 與 Claude 的對比

| 面向 | Claude Haiku/Sonnet 4.5 | Gemini 2.5 Pro | Gemini 3 Pro/Flash |
|------|------------------------|----------------|-------------------|
| System Prompt 遵循 | 優秀，穩定可靠 | 優秀 (93.2% IFEval) | 有已知問題，社群大量回報 |
| 否定約束遵循 | 良好 | 良好 | 差，傾向忽略「不要...」指令 |
| tool_choice 強制 | 可靠 (Claude ~99%) | 可靠 | 有回報的可靠性問題 |
| 「不知道」回應 | 中等，有時仍會編造 | 中等 | 差（見下方幻覺率分析） |

---

## 2. Hallucination Rate（幻覺率）

### 2.1 Vectara 幻覺排行榜（摘要任務）

[Vectara Hallucination Leaderboard](https://github.com/vectara/hallucination-leaderboard) 使用 HHEM-2.3 模型評估 LLM 在摘要任務中的幻覺率：

| 模型 | 幻覺率 | 排名 |
|------|--------|------|
| Gemini 2.0 Flash | 0.7% | 第 1 |
| Gemini 2.0 Pro | 0.8% | 第 2 |
| Gemini 2.5 Flash Lite | 3.3% | 前段 |
| Claude Sonnet (3.5/4) | 4.4% | 中段 |
| Claude Opus | 10.1% | 中後段 |
| Claude Sonnet 4.5 | >10% | 後段 |
| Claude Haiku 4.5 | 未列入 | — |

**注意：** Vectara 排行榜測量的是「摘要忠實度」（summarization faithfulness），即模型是否在摘要任務中添加原文沒有的資訊。這與 MyClaw 的場景（AI 是否編造 API 回傳數據）有本質區別。

### 2.2 AA-Omniscience 知識基準（知識問答任務）

[Artificial Analysis Omniscience Benchmark](https://artificialanalysis.ai/evaluations/omniscience) 測量 6,000 個跨 42 個主題的問答，使用「答錯扣分、不回答不扣分」的評分機制：

| 模型 | 準確率 | 幻覺率 | 綜合分數 |
|------|--------|--------|----------|
| Gemini 3 Pro | 53% | **88%** | 13 分（第 1） |
| GPT-5.1 (high) | 39% | 81% | 正分 |
| Grok 4 | 39% | 64% | 正分 |
| Claude 4.1 Opus | 36% | **最低** | 4.8 分 |

**關鍵發現：**
- Gemini 3 Pro 準確率最高 (53%)，但幻覺率也最高 (88%)
- 這意味著 Gemini 3 Pro **傾向自信地給出錯誤答案，而非承認不確定**
- Claude 4.1 Opus 幻覺率最低，表明 Claude 系列更傾向在不確定時拒絕回答
- **這對 MyClaw 場景極度不利：** 當 API 不可用時，Gemini 更可能編造看似合理的數據

### 2.3 社群實測

- [The Decoder](https://the-decoder.com/gemini-3-pro-tops-new-ai-reliability-benchmark-but-hallucination-rates-remain-high/) 報導：「儘管準確率領先，Gemini 3 Pro 的傾向是給出錯誤答案而非承認不確定，這一行為並未改變。」
- [Medium 91% 幻覺率報導](https://ai-engineering-trend.medium.com/91-hallucination-rate-gemini-3-flash-evaluation-results-are-in-e2ceee3e2f9f)：Gemini 3 Flash 在某些評測中幻覺率高達 91%
- [All About AI 2026 報告](https://www.allaboutai.com/resources/ai-statistics/ai-hallucinations/)：Claude 4.5 Haiku 報告最低幻覺率 (26%)，Claude 4.5 Sonnet 48%，GPT-5.1 51%

### 2.4 防造假場景綜合評估

| 指標 | Claude Haiku 4.5 | Gemini 2.5 Pro | Gemini 3 Pro | Gemini 3 Flash |
|------|-----------------|----------------|--------------|----------------|
| 承認不確定傾向 | **高** | 中 | **低** | **低** |
| 編造數據風險 | 中低 | 中 | **高** | **高** |
| System Prompt 防線可靠性 | **高** | 高 | 中低 | 中低 |
| tool_choice 強制可靠性 | **高** (~99%) | 高 | 有已知問題 | 有已知問題 |

---

## 3. Google Search Grounding（重點研究）

### 3.1 功能概述

Google Search Grounding 是 Gemini 獨有的功能，允許模型在回應前自動搜尋 Google，取得即時、可驗證的資訊。

**工作流程：**
1. 應用程式發送 prompt 到 Gemini API，啟用 `google_search` 工具
2. 模型分析 prompt，判斷是否需要 Google Search
3. 如需要，模型自動產生搜尋查詢並執行
4. 處理搜尋結果，合成資訊
5. 返回有引用來源的回應 + `groundingMetadata`

### 3.2 API 使用方式

**Node.js SDK (@google/genai)：**

```javascript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",  // 或 gemini-3-flash-preview
  contents: "台北今天天氣如何？",
  config: {
    tools: [{ googleSearch: {} }],
  },
});

console.log(response.text);
// groundingMetadata 包含搜尋查詢、來源、引用
console.log(response.candidates[0].groundingMetadata);
```

**回應 groundingMetadata 結構：**
```json
{
  "webSearchQueries": ["台北今天天氣"],
  "searchEntryPoint": { "renderedContent": "<HTML/CSS>" },
  "groundingChunks": [
    { "web": { "uri": "https://...", "title": "來源標題" } }
  ],
  "groundingSupports": [
    {
      "segment": { "startIndex": 0, "endIndex": 50, "text": "..." },
      "groundingChunkIndices": [0],
      "confidenceScores": [0.95]
    }
  ]
}
```

### 3.3 支援的模型

| 模型 | Google Search Grounding |
|------|------------------------|
| Gemini 2.5 Pro | 支援 |
| Gemini 2.5 Flash | 支援 |
| Gemini 2.5 Flash Lite | 支援 |
| Gemini 3 Pro Preview | 支援 |
| Gemini 3 Flash Preview | 支援 |
| Gemini 2.0 Flash | 支援 |

### 3.4 定價

| 模型系列 | 免費額度 | 超出費用 | 計費方式 |
|---------|---------|---------|---------|
| Gemini 3 系列 | 5,000 prompts/day (3 Pro) | $14/1,000 查詢 | 按搜尋查詢次數計費 |
| Gemini 2.5 系列 | 1,500 prompts/day | $35/1,000 prompts | 按 prompt 次數計費 |

**注意：** Gemini 3 按「搜尋查詢」計費，一個 prompt 可能產生多次搜尋查詢。

### 3.5 與其他工具的組合使用

**關鍵能力：Google Search Grounding 可與 Function Calling 在同一 API 請求中組合使用。**

```javascript
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "查詢我的 ERP 訂單狀態，並告訴我相關產品的市場價格",
  config: {
    tools: [
      { googleSearch: {} },                    // Google Search 工具
      { functionDeclarations: [erpToolDef] },   // 自定義 API 工具
    ],
  },
});
```

這意味著可以在同一請求中同時提供：
- 技能的 API 工具（從 api_config 動態建構）
- Google Search 作為 fallback 工具

### 3.6 MyClaw 防造假應用方案

**方案 A：Google Search 作為無 API 技能的 fallback**
```
場景：使用者安裝了一個「查股價」技能，但技能沒有 api_config
現況（Claude/Groq）：AI 編造股價數據
改進（Gemini + Grounding）：AI 自動使用 Google Search 查詢真實股價
```

**方案 B：API 失敗時的 fallback**
```
場景：技能的 API endpoint 回傳錯誤或超時
現況：AI 可能編造數據假裝 API 成功
改進：System Prompt 指示 AI 在 API 失敗時使用 Google Search 確認資訊
```

**方案 C：結合 tool_choice 與 Google Search**
```
技能有 api_config → 提供 API 工具 + Google Search 工具
技能無 api_config → 只提供 Google Search 工具
兩種情況都比「完全無工具」好得多
```

### 3.7 Google Search Grounding 的限制

1. **僅限 Gemini 模型** — Claude/Groq 無法使用此功能
2. **需要額外成本** — 超過免費額度後按查詢計費
3. **搜尋結果品質** — 依賴 Google Search 的結果品質，某些專業領域可能不足
4. **語言支援** — 官方稱「支援所有可用語言」，包括繁體中文
5. **不能取代 API 呼叫** — 對於需要認證存取的私有數據（如 ERP 系統），Google Search 無法取代真正的 API 呼叫
6. **延遲增加** — 搜尋會增加回應時間

---

## 4. 繁體中文場景表現

### 4.1 多語言基準測試

| 面向 | Gemini 2.5 Pro | Gemini 3 Pro/Flash | Claude Haiku/Sonnet 4.5 |
|------|----------------|-------------------|------------------------|
| 非英語語言支援 | 強，亞洲語言表現佳 | 強，繼承 2.5 的多語言能力 | 中上，繁中表現穩定 |
| 繁中翻譯品質 | 優秀（醫學/科學/工程） | 優秀 | 良好 |
| 繁中指令遵循 | 良好 | 有疑慮（系統指令遵循問題） | 良好 |
| Google Search 繁中 | 原生支援 | 原生支援 | 不適用 |

### 4.2 具體測試數據

- 在複雜醫學 MCQ 中，Gemini 2.0 Pro 中文準確率 71.5%，英文 74.6%，差距僅 3%
- Gemini 2.5 Pro 在英翻中任務中被評為「工程、醫學、科學的安全選擇」，術語精確、語氣正式
- 缺乏專門的繁體中文 vs 簡體中文對比基準測試數據

### 4.3 繁中防造假場景

Gemini 在繁中場景的防造假能力受兩個因素影響：
1. **正面：** Google Search Grounding 原生支援繁體中文搜尋，可取得台灣本地資訊
2. **負面：** Gemini 3 系列的系統指令遵循問題在非英語場景可能更嚴重（社群尚未有足夠的非英語回報）

---

## 5. 綜合評估與建議

### 5.1 模型比較摘要

| 評估維度 | Claude Haiku 4.5 | Gemini 2.5 Pro | Gemini 3 Flash | 權重 |
|---------|-----------------|----------------|----------------|------|
| 防造假指令遵循 | ★★★★☆ | ★★★★★ | ★★★☆☆ | 高 |
| 幻覺率 (低=好) | ★★★★☆ | ★★★★☆ | ★★☆☆☆ | 高 |
| 承認不確定能力 | ★★★★☆ | ★★★☆☆ | ★★☆☆☆ | 高 |
| Google Search Grounding | 不支援 | ★★★★★ | ★★★★★ | 中高 |
| tool_choice 強制 | ★★★★★ | ★★★★☆ | ★★★☆☆ | 高 |
| 繁中能力 | ★★★★☆ | ★★★★★ | ★★★★☆ | 中 |
| 成本效益 | ★★★★☆ | ★★★☆☆ | ★★★★☆ | 中 |

### 5.2 核心結論

#### Gemini 3 系列（Flash/Pro）的防造假能力不如 Claude

1. **幻覺率極高（88%）：** Gemini 3 Pro 在 Omniscience 基準中幻覺率 88%，遠高於 Claude
2. **傾向猜測而非拒絕：** Gemini 3 被設計為「優先保持有幫助性」，這直接對抗「不要造假」指令
3. **System Prompt 遵循有已知問題：** 大量社群回報 Gemini 3 忽略系統指令
4. **否定約束處理差：** Google 官方建議避免「不要...」格式的指令，但防造假本質上就是否定約束

#### Gemini 2.5 Pro 的防造假能力與 Claude 相當

1. **IFEval 93.2%：** 指令遵循能力業界頂級
2. **系統指令遵循穩定：** 社群回報 2.5 系列明顯優於 3 系列
3. **幻覺率中等：** Vectara 排行榜上 Gemini 2.5 系列表現良好

#### Google Search Grounding 是真正的差異化優勢

1. **唯一能真正減少造假的機制：** 其他模型只能靠指令約束，Gemini 可以用真實搜尋結果
2. **可與 Function Calling 組合：** 在同一請求中提供 API 工具 + Google Search
3. **原生繁中支援：** 可搜尋台灣本地資訊
4. **合理成本：** 免費額度足夠個人使用，超出後 $14/1,000 查詢

### 5.3 MyClaw 具體建議

#### 推薦策略：混合模式 + Grounding Fallback

```
技能執行決策樹：

1. 技能有 api_config？
   ├── 是 → 使用現有 Claude/Groq + tool_choice='required'（已驗證有效）
   └── 否 → 分支判斷：
       ├── 技能需要即時數據（天氣/股價/新聞等）？
       │   └── 使用 Gemini 2.5 Flash + Google Search Grounding
       └── 技能不需要即時數據（翻譯/摘要/分析等）？
           └── 使用現有 Claude/Groq + 防造假 System Prompt
```

#### 不建議將 Gemini 3 系列作為防造假主力

- 幻覺率太高，系統指令遵循不穩定
- 如要使用 Gemini，優先考慮 **Gemini 2.5 Pro 或 2.5 Flash**

#### Google Search Grounding 的最佳應用場景

1. **無 api_config 技能的 fallback：** 這是 MyClaw 造假問題的根因 A（致命），Grounding 可以部分解決
2. **API 錯誤後的 fallback：** 根因 E（低），Grounding 可以完全解決
3. **驗證型場景：** AI 呼叫 API 後，用 Google Search 交叉驗證結果

### 5.4 風險與注意事項

1. **新增 Provider 複雜度：** 引入 Gemini 意味著第三個 LLM Provider，增加維護成本
2. **Google Search 不能取代私有 API：** ERP、CRM 等內部系統的數據無法通過搜尋取得
3. **Gemini 3 系列仍在 Preview：** 指令遵循問題可能在正式版修復
4. **成本控制：** 需要監控 Grounding 查詢次數，避免意外高額帳單

---

## 參考來源

### 官方文件
- [Gemini 2.5 Pro Model Card](https://modelcards.withgoogle.com/assets/documents/gemini-2.5-pro.pdf)
- [Grounding with Google Search - Gemini API](https://ai.google.dev/gemini-api/docs/google-search)
- [Gemini 3 Flash 官方公告](https://blog.google/products-and-platforms/products/gemini/gemini-3-flash/)
- [Gemini Developer API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini 3 Prompting Guide](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/gemini-3-prompting-guide)

### 基準測試與排行榜
- [Vectara Hallucination Leaderboard](https://github.com/vectara/hallucination-leaderboard)
- [AA-Omniscience Benchmark](https://artificialanalysis.ai/evaluations/omniscience)
- [Scale AI Instruction Following Leaderboard](https://scale.com/leaderboard/instruction_following)
- [AI Hallucination Report 2026](https://www.allaboutai.com/resources/ai-statistics/ai-hallucinations/)

### 社群回報與分析
- [Gemini 3 System Instruction 問題 - Google Forum](https://discuss.ai.google.dev/t/the-problem-with-gemini-3-0-is-that-it-doesnt-perfectly-follow-system-instructions/109790)
- [Gemini 3 Pro 忽略 GEMINI.md 指令 - GitHub Issue](https://github.com/google-gemini/gemini-cli/issues/15037)
- [Gemini 3 Pro 幻覺率分析 - The Decoder](https://the-decoder.com/gemini-3-pro-tops-new-ai-reliability-benchmark-but-hallucination-rates-remain-high/)
- [Gemini 3 Flash 91% 幻覺率 - Medium](https://ai-engineering-trend.medium.com/91-hallucination-rate-gemini-3-flash-evaluation-results-are-in-e2ceee3e2f9f)
- [2025 LLM Review](https://atoms.dev/blog/2025-llm-review-gpt-5-2-gemini-3-pro-claude-4-5)
- [LM Council AI Model Benchmarks](https://lmcouncil.ai/benchmarks)
