# 免費 LLM API 替代方案研究：NVIDIA NIM vs Groq vs Claude

## 1. 研究目標

評估 NVIDIA NIM API 和 Groq API 能否替代 Claude API，作為 LINE AI 個人助理的推理引擎。

## 2. NVIDIA NIM API

### 2.1 概覽
- **平台**: [build.nvidia.com](https://build.nvidia.com)
- **本質**: NVIDIA 託管的模型推理 API，支援多種開源模型
- **免費額度**: 註冊後獲得 1,000~5,000 免費 credits（依帳號類型不同）
- **速率限制**: 40 requests/minute

### 2.2 可用模型
- Llama 3.2 Vision
- Nemotron (NVIDIA 自家模型)
- Mistral 7B/8x7B
- VILA (視覺語言模型)
- 各種 Embedding 模型

### 2.3 免費額度分析

| 項目 | 詳情 |
|------|------|
| 初始 Credits | 1,000~5,000 (一次性) |
| 可申請追加 | +4,000 credits |
| 速率限制 | 40 RPM |
| 長期免費 | ❌ Credits 用完就沒了 |
| 正式環境授權 | 需要 NVIDIA AI Enterprise ($4,500/GPU/年) |

### 2.4 Tool Calling / Function Calling
- NIM API 是 **OpenAI API 兼容** 的
- 支援 function calling（取決於底層模型支援度）
- Llama 3.1+ 模型支援 tool use

### 2.5 可行性判定: ⚠️ 有限可行

**優點**:
- 模型品質不錯 (Llama 3.1 70B 接近 Claude Haiku)
- OpenAI 兼容 API，容易整合
- 有 function calling 支持

**致命缺點**:
- Credits 是一次性的，**用完即止**，不是持續免費
- 正式環境需要付費授權
- 不適合作為持續運行的聊天機器人 API

**結論: 不適合。** NIM 的免費額度是用來「試用」的，不是持續免費的服務。

---

## 3. Groq API

### 3.1 概覽
- **平台**: [console.groq.com](https://console.groq.com)
- **本質**: 基於 LPU (Language Processing Unit) 的超快推理服務
- **核心賣點**: 極快的推理速度 (比 GPU 推理快 10x+)
- **免費方案**: 有持續性的免費 tier，有每日限額

### 3.2 可用模型與定價

| 模型 | Input $/M tokens | Output $/M tokens | 備註 |
|------|-------------------|--------------------|----|
| **Llama 3.1 8B Instant** | $0.05 | $0.08 | 最便宜，128K context |
| **Llama 3.3 70B Versatile** | $0.59 | $0.79 | 品質最好 |
| Llama 4 Scout (17Bx16E) | $0.11 | $0.34 | 新世代 MoE |
| Llama 4 Maverick (17Bx128E) | $0.20 | $0.60 | 新世代大模型 |
| Qwen3 32B | $0.29 | $0.59 | 中文能力強 |
| GPT-OSS 20B | $0.075 | $0.30 | OpenAI 開源 |
| Kimi K2 1T | $1.00 | $3.00 | 超大模型 |

### 3.3 免費 Tier 具體限制

| 模型 | RPM | RPD | TPM | TPD |
|------|-----|-----|-----|-----|
| **Llama 3.1 8B Instant** | 30 | 14,400 | 6,000 | 500,000 |
| **Llama 3.3 70B Versatile** | 30 | 1,000 | 12,000 | 100,000 |
| Allam 2 7B | 30 | 7,000 | 6,000 | 500,000 |
| GPT-OSS 20B | 30 | 1,000 | 8,000 | 200,000 |

> RPM=Requests/Min, RPD=Requests/Day, TPM=Tokens/Min, TPD=Tokens/Day

### 3.4 免費額度能用多少？

以 **Llama 3.1 8B** 為例（每日 500K tokens）：
- 假設每次對話平均 1,000 tokens (input + output)
- 每天可以進行 **~500 次對話**
- 個人使用 (20-50 次/天) 完全夠用

以 **Llama 3.3 70B** 為例（每日 100K tokens）：
- 每次對話平均 1,000 tokens
- 每天可以進行 **~100 次對話**
- 個人使用還是夠用，但比較緊

### 3.5 Tool Calling 支持
- ✅ 完整支持 function calling
- ✅ 支持 parallel tool use
- ✅ 有專門的 Llama 3 Groq Tool Use 模型
- ✅ OpenAI 兼容 API
- ✅ 支持 auto / required / none 模式

### 3.6 中文能力評估

| 模型 | 繁體中文能力 | 評估 |
|------|-------------|------|
| Llama 3.1 8B | ⚠️ 中等 | 基本對話可以，複雜指令可能有問題 |
| Llama 3.3 70B | ✅ 良好 | 多語言能力強，繁中表現不錯 |
| **Qwen3 32B** | ✅✅ 優秀 | 專為中文優化，繁中最佳選擇 |
| GPT-OSS 20B | ✅ 良好 | 新模型，多語言能力好 |

**推薦: Qwen3 32B 或 Llama 3.3 70B** — 中文最好且品質最高。

### 3.7 速度
- Groq 使用自家 LPU 硬體
- Llama 3.1 8B: **~800 tokens/sec**（比 GPU 快 10x+）
- 回應時間通常 < 1 秒
- 對 LINE 聊天機器人來說，速度是巨大優勢（Reply Token 1 分鐘限制）

### 3.8 可行性判定: ✅ 高度可行

**優點**:
- 持續免費 (不是一次性 credits)
- 速度極快，非常適合聊天場景
- 支持 tool calling
- OpenAI 兼容 API，整合簡單
- Qwen3 32B 中文能力優秀
- 免費額度足夠個人使用

**缺點**:
- 免費 tier 有每日限制
- 模型品質不如 Claude Sonnet/Opus
- 6,000 TPM 可能在密集對話時觸頂
- Groq 服務穩定性不如 Anthropic/OpenAI

---

## 4. 三方對比

| 項目 | Claude API | Groq (免費) | NVIDIA NIM |
|------|-----------|-------------|------------|
| **費用** | $3-15/M tokens | $0 (有限額) | 一次性 credits |
| **持續免費** | ❌ | ✅ | ❌ |
| **每日額度** | 無限 (付費) | 100K-500K tokens | Credits 用完就沒 |
| **速度** | 中等 (2-10秒) | 極快 (<1秒) | 中等 |
| **繁中能力** | ✅✅ 最佳 | ✅ 良好 (Qwen3) | ✅ 良好 |
| **Tool Calling** | ✅ 原生 | ✅ 支持 | ✅ 取決於模型 |
| **API 兼容** | Anthropic SDK | OpenAI 兼容 | OpenAI 兼容 |
| **穩定性** | ✅✅ 生產級 | ⚠️ 中等 | ⚠️ 中等 |
| **模型品質** | ✅✅ 頂級 | ✅ 良好 | ✅ 良好 |

## 5. 推薦方案：混合架構

最佳策略不是二選一，而是 **混合使用**：

```
使用者訊息
    ↓
判斷複雜度
├── 簡單對話 (80%) → Groq (免費)
│   ├── Qwen3 32B (中文對話)
│   └── Llama 3.1 8B (快速回應)
└── 複雜任務 (20%) → Claude API (付費)
    └── 需要深度推理、長文生成、精確 tool use
```

### 混合架構實現

```typescript
async function getAIResponse(message: string, complexity: 'simple' | 'complex') {
  if (complexity === 'simple') {
    // 免費: Groq API (OpenAI 兼容)
    return await groqClient.chat.completions.create({
      model: 'qwen-qwq-32b',  // 中文最好
      messages: [{ role: 'user', content: message }],
    });
  } else {
    // 付費: Claude API (複雜任務)
    return await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      messages: [{ role: 'user', content: message }],
    });
  }
}
```

### 成本預估（混合方案）

| 場景 | 每月對話次數 | Groq (免費) | Claude | 總成本 |
|------|------------|------------|--------|--------|
| 輕度使用 | 300 | 300 (100%) | 0 | **$0** |
| 中度使用 | 1,000 | 800 (80%) | 200 (20%) | **~$1-3** |
| 重度使用 | 3,000 | 2,400 (80%) | 600 (20%) | **~$3-8** |

## 6. 結論

### NVIDIA NIM: ❌ 不推薦
- 免費 credits 是一次性的，不適合持續服務
- 正式環境需要昂貴授權

### Groq API: ✅ 強烈推薦
- 持續免費的 tier
- 速度極快，完美匹配聊天場景
- Qwen3 32B 中文能力優秀
- 免費額度足夠個人日常使用 (每天 100-500 次對話)
- 支持 tool calling

### 最佳方案: 混合架構
- 80% 流量走 Groq (免費)
- 20% 複雜任務走 Claude (低成本)
- 個人使用可以做到 **完全免費** 或 **月費 < $3**

## 7. 參考來源

- [Groq Rate Limits](https://console.groq.com/docs/rate-limits)
- [Groq Pricing](https://groq.com/pricing)
- [Groq Tool Use](https://console.groq.com/docs/tool-use)
- [NVIDIA NIM](https://build.nvidia.com)
- [NVIDIA NIM FAQ](https://docs.api.nvidia.com/nim/docs/product)
- [NVIDIA Developer Forums - NIM Credits](https://forums.developer.nvidia.com/t/nim-api-credits/305703)
