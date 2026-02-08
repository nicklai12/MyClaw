# Qwen3 32B 技能建立與調用能力研究

## 1. 研究目標

評估 Qwen3 32B（Groq 免費 tier）能否勝任：
1. 解析使用者自然語言 → 生成技能 JSON 配置
2. 執行技能 prompt → 產生有用回應
3. 使用 Tool Calling 與外部系統互動
4. 流暢處理繁體中文對話

## 2. Qwen3 32B 模型概覽

### 基本規格
- **參數量**: 32.8B (Dense 架構)
- **訓練資料**: 36T tokens，涵蓋 119 種語言
- **Context Window**: 128K tokens
- **授權**: Apache 2.0（完全開源商用）

### Groq 上的模型 ID
| 模型 | Groq Model ID | 特點 |
|------|--------------|------|
| **Qwen3 32B** | `qwen/qwen3-32b` | 通用對話，支持思考模式切換 |
| **QwQ 32B** | `qwen-qwq-32b` | 推理專精，更強的邏輯能力 |

### Benchmark 表現

| Benchmark | Qwen3-32B | 對比 |
|-----------|-----------|------|
| ArenaHard | 89.5 | 接近 GPT-4.1 |
| MultiIF | 73.0 | 領先同級 |
| MMLU-Pro | 65.54 | 大幅超越 Qwen2.5-32B |
| BFCL (Tool Calling) | 頂級 | 開源模型最佳之一 |
| C-Eval (中文) | 優秀 | 中文專項優化 |

**關鍵發現**: Qwen3-32B 在 BFCL (Berkeley Function Calling Leaderboard) 上表現頂級，這是 **Tool Calling** 的權威排行榜。

## 3. Tool Calling 能力評估

### 3.1 Groq 上的 Tool Calling 支援

| 模型 | Tool Calling | JSON Mode | 並行呼叫 |
|------|-------------|-----------|---------|
| Qwen3 32B | ✅ 支持 | ✅ 支持 | ✅ 支持 |
| QwQ 32B | ✅ 支持 | ✅ 支持 | ✅ 支持 |

### 3.2 Tool Calling 格式

Groq 使用 OpenAI 兼容格式：
```javascript
const response = await groq.chat.completions.create({
  model: "qwen/qwen3-32b",
  messages: [{ role: "user", content: "每天早上8點提醒我喝水" }],
  tools: [{
    type: "function",
    function: {
      name: "create_skill",
      description: "建立新技能",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "技能名稱" },
          trigger_type: { type: "string", enum: ["cron", "keyword", "pattern"] },
          trigger_value: { type: "string" },
          prompt: { type: "string", description: "技能執行指令" }
        },
        required: ["name", "trigger_type", "trigger_value", "prompt"]
      }
    }
  }],
  tool_choice: "auto"
});
```

### 3.3 BFCL 排行榜表現

Qwen3 在 BFCL (Berkeley Function Calling Leaderboard) 上是開源模型中的頂級選手，這意味著：
- ✅ 能準確理解何時需要呼叫工具
- ✅ 能正確填充 function 參數
- ✅ 能處理多步驟工具調用
- ✅ 並行呼叫多個工具

## 4. 技能建立能力評估

### 4.1 場景測試分析

**場景 1**: "每天早上8點提醒我喝水"
```json
// 預期 Qwen3 輸出
{
  "name": "喝水提醒",
  "trigger_type": "cron",
  "trigger_value": "0 8 * * *",
  "prompt": "友善地提醒使用者喝水，可以加入一些健康小知識"
}
```
- **可行性**: ✅ 高。Cron 格式是標準化的，Qwen3 的訓練資料中大量包含。

**場景 2**: "當我說「摘要」的時候，幫我摘要接下來的文字"
```json
{
  "name": "智慧摘要",
  "trigger_type": "keyword",
  "trigger_value": "摘要",
  "prompt": "將使用者接下來傳送的文字摘要成3-5個重點，保持精簡"
}
```
- **可行性**: ✅ 高。關鍵字提取是基本 NLP 能力。

**場景 3**: "幫我建立一個記帳助手，每次我說花了多少錢就幫我記錄"
```json
{
  "name": "記帳助手",
  "trigger_type": "pattern",
  "trigger_value": "花了|花費|消費|支出",
  "prompt": "從使用者訊息中提取金額和項目，記錄到記憶中的 ## 帳本 區塊，格式為「日期 | 項目 | 金額」"
}
```
- **可行性**: ✅ 中高。需要理解「花了」是觸發模式，並生成正則表達式。Qwen3 在中文理解上有優勢。

### 4.2 結構化輸出可靠性

Qwen3 支持兩種確保結構化輸出的方式：
1. **Tool Calling** — 透過 function schema 強制 JSON 格式
2. **JSON Mode** — Groq 的 `response_format: { type: "json_object" }`

**推薦用 Tool Calling**，因為它透過 schema 定義確保輸出格式正確。

## 5. 繁體中文能力

### 5.1 語言支持
- Qwen3 支持 **119 種語言和方言**
- 由阿里巴巴開發，**中文是核心優化語言**
- 繁體中文是明確支持的語言之一
- C-Eval (中文理解 benchmark) 表現優秀

### 5.2 繁簡分辨
- 阿里巴巴模型對中文有天然優勢
- 比 Llama 系列的中文能力顯著更好
- 能正確區分繁體和簡體
- 文化語境理解（台灣用語 vs 大陸用語）：良好但不完美

### 5.3 與 Claude 的中文對比

| 能力 | Qwen3 32B | Claude Sonnet |
|------|-----------|---------------|
| 繁中理解 | ✅ 優秀 | ✅✅ 頂級 |
| 繁簡分辨 | ✅ 良好 | ✅ 優秀 |
| 台灣用語 | ⚠️ 中等偏好 | ✅ 良好 |
| 文化語境 | ⚠️ 偏大陸 | ✅ 均衡 |
| 自然度 | ✅ 良好 | ✅✅ 頂級 |

**結論**: Qwen3 的中文能力**足以勝任**技能建立和對話，但在細微的台灣在地化表達上不如 Claude。

## 6. Groq 免費額度（Qwen3 32B 專項）

| 限制 | 數值 |
|------|------|
| RPM (每分鐘請求) | 30 |
| RPD (每日請求) | 14,400 |
| TPM (每分鐘 tokens) | 6,000 |
| TPD (每日 tokens) | 依模型不同 |

**個人助理使用預估**:
- 每次對話 ~500-1500 tokens
- 每天 20-50 次互動
- 每天消耗 ~10K-75K tokens
- **完全在免費額度內**

## 7. 結論

### Qwen3 32B 能否勝任技能建立？ ✅ YES

| 能力 | 評級 | 說明 |
|------|------|------|
| 解析自然語言意圖 | ✅ 優秀 | 119 語言支持，中文專項優化 |
| 生成 JSON 配置 | ✅ 優秀 | BFCL 頂級，Tool Calling 完善 |
| Cron 表達式生成 | ✅ 良好 | 標準格式，訓練充分 |
| 關鍵字/模式提取 | ✅ 良好 | 中文 NLP 強項 |
| 繁體中文對話 | ✅ 良好 | 阿里巴巴模型，中文核心語言 |

### Qwen3 32B 能否勝任技能調用？ ✅ YES

| 能力 | 評級 | 說明 |
|------|------|------|
| 遵循 System Prompt | ✅ 優秀 | 128K context，指令遵循好 |
| Tool Calling 執行 | ✅ 優秀 | BFCL 排行榜頂級 |
| 記憶讀寫 | ✅ 良好 | 透過 tool calling 操作 |
| 回應品質 | ✅ 良好 | 接近 GPT-4.1 水準 |
| 穩定性 | ✅ 良好 | Groq LPU 推理穩定 |

### 建議
- **主力使用 Qwen3 32B (`qwen/qwen3-32b`)**：通用對話和技能建立
- **複雜推理用 QwQ 32B (`qwen-qwq-32b`)**：需要深度推理的技能執行
- **保留 Claude 作為 fallback**：台灣在地化表達和超複雜任務

## 8. 參考來源

- [Qwen3 官方博客](https://qwenlm.github.io/blog/qwen3/)
- [Qwen3 32B - Hugging Face](https://huggingface.co/Qwen/Qwen3-32B)
- [Groq Qwen3 32B 文件](https://console.groq.com/docs/model/qwen/qwen3-32b)
- [Groq QwQ 32B 文件](https://console.groq.com/docs/model/qwen-qwq-32b)
- [Qwen Function Calling 文件](https://qwen.readthedocs.io/en/latest/framework/function_call.html)
- [Qwen-Agent GitHub](https://github.com/QwenLM/Qwen-Agent)
- [BFCL Leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html)
