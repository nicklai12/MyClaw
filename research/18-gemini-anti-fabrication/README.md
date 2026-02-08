# Gemini 模型能否解決 MyClaw AI 造假數據問題？

> 研究日期：2026-02-08
> 研究模型：Gemini 2.5 Pro、Gemini 3 Flash Preview、Gemini 3 Pro Preview
> 核心問題：AI 在執行 Agent Skills 時不按照工具呼叫 API，而是直接編造數據

---

## 結論摘要

### Gemini 能否解決造假問題？— 部分能，但不是透過更好的 Tool Calling

| 面向 | 能解決？ | 說明 |
|------|---------|------|
| Tool Calling 更可靠？ | **否** | Gemini `mode: ANY` 可靠性 ~85-95%，不如 Claude (~99%)，不優於 Groq (~90-95%) |
| 指令遵循更好？ | **否** | Gemini 3 系列有嚴重的 System Prompt 遵循問題，幻覺率高達 88% |
| Google Search Grounding？ | **是（差異化優勢）** | 唯一能讓無 API 技能取得真實數據的機制，可部分解決根因 A |

**核心判斷：Gemini 的 Tool Calling 和指令遵循不如 Claude，但 Google Search Grounding 是其他 Provider 沒有的獨特能力，值得作為「無 API 技能的 fallback」整合。**

---

## 詳細分析

### 1. Tool Calling 可靠性（不推薦切換）

> 完整報告：[tool-calling.md](tool-calling.md)

| 模型 | tool_choice 強制 | 實際呼叫率 | BFCL 排名 |
|------|----------------|-----------|----------|
| Claude Haiku 4.5 | `any` (~99%) | 極高 | 前 3 |
| Claude Sonnet 4.5 | `any` (~99%) | 極高 | 前 3 |
| Groq Qwen3 32B | `required` (~90-95%) | 高 | 優秀 |
| Gemini 2.5 Pro | `ANY` (~85-95%) | 中高 | 未進前列 |
| Gemini 3 Flash Preview | `ANY` (不穩定) | 中 | 未進前列 |
| Gemini 3 Pro Preview | `ANY` (不穩定) | 中高 | 未進前列 |

**問題：**
- Gemini `ANY` 模式有 500 Internal Error 報告
- 社群回報模型有時用 ```json 代碼區塊代替真正的 function_call
- Gemini 3 Preview 有 `thought_signature` 並行呼叫 bug，導致 400 錯誤
- BFCL V4 排名中 Claude 穩居前三，Gemini 未進前列

### 2. 防造假 / 指令遵循（不推薦切換）

> 完整報告：[anti-fabrication.md](anti-fabrication.md)

| 模型 | IFEval | 幻覺率 (AA-Omniscience) | 承認不確定傾向 |
|------|--------|------------------------|---------------|
| Gemini 2.5 Pro | 93.2% | 中等 | 中 |
| Gemini 3 Pro | 85% | **88%（極高）** | **低（傾向編造）** |
| Gemini 3 Flash | ~85% | **91%（某評測）** | **低** |
| Claude 4.1 Opus | — | 最低 | **高** |
| Claude Haiku 4.5 | — | 26%（最低） | 高 |

**關鍵發現：**
- Gemini 3 Pro **準確率最高 (53%) 但幻覺率也最高 (88%)**，傾向自信地給錯誤答案
- Gemini 3 系列有嚴重的 System Prompt 遵循問題，社群大量回報
- Google 官方建議避免否定約束指令（「不要...」），但防造假本質就是否定約束
- Claude 系列更傾向在不確定時拒絕回答，幻覺率最低

### 3. Google Search Grounding（推薦整合的唯一理由）

**這是 Gemini 相對 Claude/Groq 的真正差異化優勢。**

Google Search Grounding 允許模型在回應前自動搜尋 Google，取得真實、可驗證的資訊。

**對 MyClaw 造假根因的解決效果：**

| 根因 | 嚴重度 | Grounding 能解決？ |
|------|--------|------------------|
| A. 無 api_config 技能完全沒有工具 | 致命 | **部分解決** — 提供 Google Search 作為工具 |
| B. parseApiConfig 靜默失敗 | 中 | 不適用 |
| C. 防造假指示缺失 | 高 | 已另外修復 |
| D. Groq tool_choice 可靠性 | 中 | 不適用 |
| E. API 錯誤後編造回覆 | 低 | **完全解決** — 可用 Search 取得替代資訊 |

**使用場景：**
```
技能有 api_config → 現有 Claude/Groq + tool_choice（已驗證）
技能無 api_config 但需要即時數據 → Gemini + Google Search Grounding
技能無 api_config 且不需即時數據 → 現有 Claude/Groq + 防造假 prompt
```

**定價：**
- Gemini 3 Flash Preview：**免費**（5,000 search/day）
- Gemini 2.5 Flash：**免費**（1,500 search/day）
- 超出免費額度：$14-35/1,000 查詢

### 4. API 整合可行性

| 面向 | 評估 |
|------|------|
| SDK | `@google/genai`（npm），或 OpenAI 相容模式 |
| OpenAI 相容 | 支援，可用 OpenAI SDK + baseURL |
| tool_choice 強制 | `toolConfig.functionCallingConfig.mode: 'ANY'` |
| Function Calling 格式 | `functionDeclarations` + `parametersJsonSchema` |
| Structured Output | 支援 JSON mode |
| 整合難度 | 中等 — 新增 Gemini provider 到 llm.ts 約 150-200 行 |

**定價對比：**

| 模型 | Input/MTok | Output/MTok | 免費額度 | 月費估算 (50 對話/天) |
|------|-----------|-------------|---------|---------------------|
| Claude Haiku 4.5 | $0.80 | $4.00 | 無 | ~$1-3 |
| Groq Qwen3 32B | 免費 | 免費 | 500+ 次/天 | $0 |
| Gemini 3 Flash Preview | $0.50 | $3.00 | 有 (10 RPM) | ~$0-2 |
| Gemini 2.5 Flash | $0.30 | $2.50 | 有 (10 RPM) | ~$0-1 |
| Gemini 2.5 Pro | $1.25 | $10.00 | 有 (5 RPM) | ~$2-8 |
| Gemini 3 Pro Preview | $2.00 | $12.00 | **無** | ~$3-12 |

**免費額度限制（2025 年 12 月後大幅縮減）：**
- Gemini 2.5 Pro：5 RPM、100 RPD
- Gemini 2.5 Flash：10 RPM、250 RPD
- Gemini 3 Flash Preview：免費，限制類似 2.5 Flash

---

## 建議行動方案

### 推薦：有限度整合 Gemini，僅用於 Grounding Fallback

```
MyClaw LLM Provider Pattern（更新版）：

├── Claude-only：ANTHROPIC_API_KEY
│    └── 主力 Tool Calling + 防造假（最可靠）
├── Groq-only：GROQ_API_KEY
│    └── 免費 Tool Calling（已驗證）
├── 混合模式：ANTHROPIC + GROQ
│    └── 簡單→Groq, 複雜→Claude
└── [新增] Gemini Grounding：GEMINI_API_KEY（選填）
     └── 僅用於無 API 技能的 Google Search fallback
```

**不建議：**
- ❌ 用 Gemini 取代 Claude 做 Tool Calling（可靠性不如 Claude）
- ❌ 用 Gemini 3 系列做主力模型（幻覺率太高、指令遵循有問題）
- ❌ 全面切換到 Gemini（增加複雜度，收益不明確）

**建議：**
- ✅ 新增 `GEMINI_API_KEY` 環境變數（選填）
- ✅ 無 API 技能執行時，若有 Gemini key，自動啟用 Google Search Grounding
- ✅ 優先使用 Gemini 2.5 Flash（穩定 + 免費 + 便宜）
- ✅ 保持 Claude 作為 Tool Calling 主力

### 整合優先級

| 優先級 | 行動 | 工作量 |
|--------|------|--------|
| P0 | 維持 Claude tool_choice: any 作為 Tool Calling 主力 | 0（已完成）|
| P0 | 維持 System Prompt 防造假指示 | 0（已完成）|
| P1 | 新增 Gemini provider 到 llm.ts（僅 Grounding） | ~150 行 |
| P1 | skill-executor 判斷：無 API 技能 + 有 Gemini key → 使用 Grounding | ~50 行 |
| P2 | config.ts 新增 GEMINI_API_KEY + 模型白名單 | ~30 行 |
| P3 | 完整 Gemini Tool Calling 支援（作為 Claude 備選） | ~200 行 |

---

## 參考資料

### 子報告
- [Tool Calling 能力研究](tool-calling.md)
- [防造假能力研究](anti-fabrication.md)
- [API 整合可行性](api-integration.md)（如有）

### 外部來源
- [Gemini API Function Calling 官方文件](https://ai.google.dev/gemini-api/docs/function-calling)
- [Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [BFCL V4 Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html)
- [AA-Omniscience Benchmark](https://artificialanalysis.ai/evaluations/omniscience)
- [Vectara Hallucination Leaderboard](https://github.com/vectara/hallucination-leaderboard)
- [@google/genai NPM](https://www.npmjs.com/package/@google/genai)
- [Gemini OpenAI 相容模式](https://ai.google.dev/gemini-api/docs/openai)
