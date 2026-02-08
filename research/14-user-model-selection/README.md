# 研究報告：模型可以讓用戶選填嗎？

> 研究代理人 B | 2026-02-08

---

## 結論摘要

**可以，而且應該支援。** 推薦採用**方案 C（混合方案）**作為最終目標，但 MVP 階段僅需實現**方案 A 的增強版**（.env 配置 + config.ts 模型白名單）。

核心判斷依據：
1. MyClaw 是「個人部署」的 LINE 助理，部署者 = 用戶，.env 配置已足夠 MVP 需求
2. LINE 動態切換（方案 B）需要 DB schema 變更和命令解析，複雜度較高，應列為後續迭代
3. 模型驗證機制是安全底線，無論哪個方案都必須實作
4. Groq 和 Claude 都有明確的支援 Tool Calling 的模型清單，可建立白名單

---

## 一、用戶自選模型的使用場景分析

### 1.1 什麼情況下用戶會想選擇模型？

| 場景 | 說明 | 頻率 |
|------|------|------|
| **初次部署** | 用戶只有某個 provider 的 key，想選用特定模型 | 一次性 |
| **成本控制** | 用戶想用免費的 Groq 模型而非付費 Claude | 偶爾調整 |
| **模型升級** | Groq/Claude 推出新模型，用戶想試用 | 偶爾 |
| **效能偏好** | 某些用戶偏好速度（Haiku），某些偏好品質（Opus） | 設定一次 |
| **任務適配** | 複雜推理任務想臨時用更強的模型 | 動態需求 |
| **多租戶** | 如果 MyClaw 未來支援多人共用，不同用戶想用不同模型 | 未來需求 |

### 1.2 選擇時機

- **部署時（.env 設定）**：適合個人部署者，設定一次長期使用
- **對話中動態切換**：適合多租戶場景或頻繁調整需求的進階用戶
- **兩者並存**：.env 提供預設值，對話中可覆蓋，最彈性但最複雜

---

## 二、設計方案比較

### 方案比較總表

| 面向 | 方案 A：.env 配置 | 方案 B：LINE 動態切換 | 方案 C：混合方案 |
|------|-------------------|----------------------|------------------|
| **用戶體驗** | 需編輯檔案 + 重啟 | 在聊天中說「切換模型」 | 兩者兼備 |
| **技術用戶** | 友好 | 不需要 | 最佳 |
| **非技術用戶** | 不便 | 友好 | 最佳 |
| **實作複雜度** | 低（~30 行修改） | 中（~150 行新增） | 高（~200 行） |
| **需要 DB 變更** | 否 | 是 | 是 |
| **需要重啟** | 是 | 否 | .env 部分需要 |
| **模型驗證** | 啟動時一次 | 每次切換都要 | 兩處都要 |
| **多租戶支援** | 否（全域設定） | 是（per-user） | 是 |
| **MVP 適合度** | 最適合 | 過度設計 | 過度設計 |

### 方案 A：.env 環境變數配置（推薦 MVP）

```env
# 現有：Claude 模型已可選填
CLAUDE_DEFAULT_MODEL=claude-haiku-4-5-20251001
CLAUDE_COMPLEX_MODEL=claude-sonnet-4-5-20250929

# 新增：Groq 模型也可選填（目前硬編碼為 qwen/qwen3-32b）
GROQ_MODEL=qwen/qwen3-32b

# 新增：Provider 模式可手動覆蓋（目前由 API key 自動偵測）
# LLM_PROVIDER=hybrid  # 可選: claude-only, groq-only, hybrid
```

**優點：**
- 改動最小，只需修改 `config.ts` 約 30 行
- 不需要 DB schema 變更
- 啟動時驗證一次即可
- 符合 MyClaw 「個人部署」的定位

**缺點：**
- 需要重啟才能生效
- 非技術用戶不便（但 MyClaw 本身就需要技術能力部署）

### 方案 B：LINE 對話中動態切換

用戶在 LINE 中輸入指令：
- 「切換模型 claude-sonnet-4-5」
- 「使用免費模型」
- 「查看可用模型」
- 「模型設定」

**需要的實作：**
1. `users` 表新增 `preferred_model` 欄位
2. 新增模型切換命令解析
3. `chat()` 函式需接受 per-user model override
4. 模型驗證 + 白名單
5. `index.ts` 新增命令路由

**優點：**
- 用戶體驗最好，即時生效
- 支援多租戶場景

**缺點：**
- 實作複雜度高
- 需要 DB migration
- 命令解析與模型名稱匹配不容易做得完善
- 安全性考量更多（惡意模型名稱注入等）

### 方案 C：混合方案（推薦最終目標）

- .env 設定全域預設模型
- DB `user_preferences` 欄位儲存用戶個人偏好
- LINE 對話中可動態覆蓋
- 優先級：用戶動態設定 > DB 偏好 > .env 預設

---

## 三、對現有程式碼的影響分析

### 3.1 config.ts 需要的修改

**目前問題：** Groq model 硬編碼為 `'qwen/qwen3-32b'`（第 66 行），不可配置。

```typescript
// 目前的寫法（第 62-67 行）
...(groqKey && {
  groq: {
    apiKey: groqKey,
    model: 'qwen/qwen3-32b',  // <-- 硬編碼
  },
}),
```

**方案 A 修改建議：**

```typescript
// === 新增：模型白名單（用於驗證） ===

export const GROQ_SUPPORTED_MODELS = [
  // 支援 Tool Calling 的模型
  'qwen/qwen3-32b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'moonshotai/kimi-k2-instruct-0905',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
] as const;

export const CLAUDE_SUPPORTED_MODELS = [
  // 現行模型
  'claude-opus-4-6',
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-5',
  'claude-haiku-4-5-20251001',
  'claude-haiku-4-5',
  // 舊版模型（仍可用）
  'claude-opus-4-5-20251101',
  'claude-opus-4-5',
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-0',
  'claude-3-7-sonnet-20250219',
  'claude-haiku-4-5-20250501',
] as const;

// === 修改 loadConfig() ===

// Groq model 改為可配置
...(groqKey && {
  groq: {
    apiKey: groqKey,
    model: process.env.GROQ_MODEL || 'qwen/qwen3-32b',
  },
}),

// === 新增：啟動時模型驗證 ===

function validateModel(
  model: string,
  allowedModels: readonly string[],
  provider: string
): void {
  if (!allowedModels.includes(model)) {
    console.warn(
      `[config] 警告：${provider} 模型 "${model}" 不在已知支援清單中。` +
      `支援的模型：${allowedModels.join(', ')}`
    );
    // 不拋錯，只警告（用戶可能使用新上線的模型）
  }
}
```

**新增的 AppConfig 型別欄位（方案 C 時）：**

```typescript
export interface UserPreferences {
  preferredProvider?: 'claude-only' | 'groq-only' | 'hybrid';
  groqModel?: string;
  claudeDefaultModel?: string;
  claudeComplexModel?: string;
}
```

### 3.2 llm.ts 需要的修改

**目前架構：** `chat()` 函式依據全域 `currentConfig` 決定路由，沒有 per-request model override 機制。

**方案 A（MVP）：** 不需要修改 llm.ts，因為 config.ts 已讀取 .env 變數。

**方案 B/C：** `ChatOptions` 需要新增可選欄位：

```typescript
// config.ts 的 ChatOptions 新增
export interface ChatOptions {
  messages: ChatMessage[];
  systemPrompt?: string;
  tools?: ToolDefinition[];
  maxTokens?: number;
  complexity?: Complexity;
  jsonMode?: boolean;
  // 新增：per-request model override
  modelOverride?: {
    provider?: 'claude' | 'groq';
    model?: string;
  };
}
```

```typescript
// llm.ts 的 chat() 需要修改路由邏輯
export async function chat(options: ChatOptions): Promise<ChatResponse> {
  if (!currentConfig) {
    throw new Error('[LLM] 尚未初始化');
  }

  // 如果有 modelOverride，優先使用
  if (options.modelOverride) {
    const { provider, model } = options.modelOverride;
    if (provider === 'groq' && model) {
      return chatWithGroq(options, model);  // 需要修改 chatWithGroq 簽名
    }
    if (provider === 'claude' && model) {
      return chatWithClaude(options, 'simple', model);  // 需要修改簽名
    }
  }

  // 原有路由邏輯不變
  // ...
}
```

**chatWithGroq 修改（方案 B/C）：**

```typescript
// 新增 modelOverride 參數
async function chatWithGroq(
  options: ChatOptions,
  modelOverride?: string  // 新增
): Promise<ChatResponse> {
  // ...
  const model = modelOverride || groqConfig.model;
  // 其餘不變
}
```

### 3.3 db.ts 需要的修改

**方案 A（MVP）：** 不需要任何 DB 變更。

**方案 B/C：** 需要在 `users` 表新增偏好欄位。

有兩種做法：

**做法 1：直接加欄位**
```sql
ALTER TABLE users ADD COLUMN preferred_provider TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN preferred_groq_model TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN preferred_claude_model TEXT DEFAULT NULL;
```

**做法 2：JSON 偏好欄位（推薦）**
```sql
ALTER TABLE users ADD COLUMN preferences TEXT DEFAULT '{}';
-- preferences 存 JSON，例如：
-- {"provider": "groq-only", "groqModel": "llama-3.3-70b-versatile"}
```

做法 2 更彈性，未來新增偏好項目不需再 ALTER TABLE。

```typescript
// db.ts 新增函式
export function getUserPreferences(userId: number): UserPreferences {
  const user = getUserById(userId);
  if (!user || !user.preferences) return {};
  try {
    return JSON.parse(user.preferences) as UserPreferences;
  } catch {
    return {};
  }
}

export function updateUserPreferences(
  userId: number,
  prefs: Partial<UserPreferences>
): void {
  const existing = getUserPreferences(userId);
  const merged = { ...existing, ...prefs };
  db.prepare(
    "UPDATE users SET preferences = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(merged), userId);
}
```

---

## 四、模型驗證機制

### 4.1 驗證策略

模型驗證應分為兩個層級：

**第一層：白名單檢查（啟動時 / 切換時）**
- 檢查模型 ID 是否在已知支援清單中
- 不在清單中只警告，不拒絕（因為新模型可能尚未更新到白名單）

**第二層：Tool Calling 相容性標記**
- 維護一個「已知支援 Tool Calling」的模型子集
- 如果用戶選擇不支援 Tool Calling 的模型，警告技能功能可能受限

### 4.2 各 Provider 支援 Tool Calling 的模型清單

#### Groq 支援 Tool Calling 的模型（2026-02 最新）

| Model ID | 速度 | 定價 | Tool Calling |
|----------|------|------|-------------|
| `qwen/qwen3-32b` | 快 | 免費/極低 | 支援 |
| `llama-3.3-70b-versatile` | 280 t/s | $0.59/1M in | 支援 |
| `llama-3.1-8b-instant` | 560 t/s | $0.05/1M in | 支援 |
| `meta-llama/llama-4-scout-17b-16e-instruct` | 快 | 低 | 支援 |
| `meta-llama/llama-4-maverick-17b-128e-instruct` | 快 | 低 | 支援 |
| `moonshotai/kimi-k2-instruct-0905` | 快 | 低 | 支援 |
| `openai/gpt-oss-20b` | 1000 t/s | $0.075/1M in | 支援 |
| `openai/gpt-oss-120b` | 500 t/s | $0.15/1M in | 支援 |

> 備註：Groq 官方文件聲明「所有託管模型都支援 Tool Use」，但實際效果因模型而異。`qwen/qwen3-32b` 和 `llama-3.3-70b-versatile` 是目前 Tool Calling 效果最穩定的。

#### Claude 支援 Tool Calling 的模型

| Model ID | 別名 | 定價 (input/output MTok) | Tool Calling |
|----------|------|--------------------------|-------------|
| `claude-opus-4-6` | claude-opus-4-6 | $5 / $25 | 最佳 |
| `claude-sonnet-4-5-20250929` | claude-sonnet-4-5 | $3 / $15 | 優秀 |
| `claude-haiku-4-5-20251001` | claude-haiku-4-5 | $1 / $5 | 良好 |
| `claude-opus-4-5-20251101` | claude-opus-4-5 | $5 / $25 | 優秀 |
| `claude-sonnet-4-20250514` | claude-sonnet-4-0 | $3 / $15 | 優秀 |
| `claude-3-7-sonnet-20250219` | claude-3-7-sonnet-latest | $3 / $15 | 良好 |

> 備註：所有 Claude 模型都支援 Tool Calling，差異在於複雜任務的準確度。Opus 系列最強，Haiku 適合簡單工具呼叫。

### 4.3 驗證實作建議

```typescript
// config.ts 新增

export interface ModelInfo {
  id: string;
  provider: 'groq' | 'claude';
  toolCalling: boolean;
  description: string;
}

export const MODEL_REGISTRY: ModelInfo[] = [
  // Groq 模型
  { id: 'qwen/qwen3-32b', provider: 'groq', toolCalling: true, description: 'Qwen3 32B (推薦，免費)' },
  { id: 'llama-3.3-70b-versatile', provider: 'groq', toolCalling: true, description: 'Llama 3.3 70B' },
  { id: 'llama-3.1-8b-instant', provider: 'groq', toolCalling: true, description: 'Llama 3.1 8B (最快)' },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', provider: 'groq', toolCalling: true, description: 'Llama 4 Scout' },
  { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', provider: 'groq', toolCalling: true, description: 'Llama 4 Maverick' },
  { id: 'moonshotai/kimi-k2-instruct-0905', provider: 'groq', toolCalling: true, description: 'Kimi K2' },
  { id: 'openai/gpt-oss-20b', provider: 'groq', toolCalling: true, description: 'GPT-OSS 20B' },
  { id: 'openai/gpt-oss-120b', provider: 'groq', toolCalling: true, description: 'GPT-OSS 120B' },

  // Claude 模型
  { id: 'claude-opus-4-6', provider: 'claude', toolCalling: true, description: 'Claude Opus 4.6 (最強)' },
  { id: 'claude-sonnet-4-5', provider: 'claude', toolCalling: true, description: 'Claude Sonnet 4.5' },
  { id: 'claude-sonnet-4-5-20250929', provider: 'claude', toolCalling: true, description: 'Claude Sonnet 4.5 (固定版)' },
  { id: 'claude-haiku-4-5', provider: 'claude', toolCalling: true, description: 'Claude Haiku 4.5 (最快)' },
  { id: 'claude-haiku-4-5-20251001', provider: 'claude', toolCalling: true, description: 'Claude Haiku 4.5 (固定版)' },
  { id: 'claude-opus-4-5', provider: 'claude', toolCalling: true, description: 'Claude Opus 4.5' },
  { id: 'claude-sonnet-4-0', provider: 'claude', toolCalling: true, description: 'Claude Sonnet 4' },
  { id: 'claude-sonnet-4-20250514', provider: 'claude', toolCalling: true, description: 'Claude Sonnet 4 (固定版)' },
];

export function validateModelId(modelId: string, provider: 'groq' | 'claude'): {
  valid: boolean;
  known: boolean;
  toolCalling: boolean;
  warning?: string;
} {
  const entry = MODEL_REGISTRY.find(
    m => m.id === modelId && m.provider === provider
  );

  if (entry) {
    return { valid: true, known: true, toolCalling: entry.toolCalling };
  }

  // 不在白名單中 — 允許但警告
  return {
    valid: true,  // 仍然允許（可能是新模型）
    known: false,
    toolCalling: false,  // 無法確認
    warning: `模型 "${modelId}" 不在已知 ${provider} 模型清單中。Tool Calling 功能可能不可用。`,
  };
}
```

---

## 五、安全性考量

### 5.1 用戶自帶 API Key（多租戶場景）

**目前架構：** 所有用戶共用部署者的 API key（單租戶）。

**是否應支援用戶自帶 key？**

| 面向 | 共用部署者 Key | 用戶自帶 Key |
|------|----------------|-------------|
| 實作複雜度 | 低 | 高 |
| 安全風險 | 低 | 需加密儲存 key |
| 成本控制 | 部署者負擔 | 用戶自負 |
| 適用場景 | 個人/小團隊 | SaaS 平台 |
| MVP 建議 | 採用 | 不建議 |

**建議：MVP 階段不支援用戶自帶 API key。** 理由：
1. API key 儲存需要加密（SQLite 明文儲存不安全）
2. 需要 per-user client 實例管理（目前是全域單一 client）
3. MyClaw 定位是個人助理，不是 SaaS 平台
4. 如果用戶想用自己的 key，可以自行部署一個 MyClaw 實例

### 5.2 模型名稱注入風險

如果支援 LINE 動態切換（方案 B/C），用戶輸入的模型名稱會被傳入 API 呼叫：
```typescript
const response = await groqClient.chat.completions.create({
  model: userInputModelName,  // 潛在風險
  // ...
});
```

**防護措施：**
1. 白名單驗證（最重要）：只允許 `MODEL_REGISTRY` 中的模型 ID
2. 字串消毒：移除特殊字元、限制長度
3. 嚴格模式（可選）：設定 `STRICT_MODEL_VALIDATION=true` 時，拒絕不在白名單中的模型

### 5.3 費用控制

如果用戶可以選擇昂貴的模型（如 Claude Opus），需要考慮費用爆炸的風險。

**建議措施：**
- .env 新增 `ALLOWED_CLAUDE_MODELS` 環境變數，部署者可限制可用的 Claude 模型
- 例如：`ALLOWED_CLAUDE_MODELS=claude-haiku-4-5,claude-sonnet-4-5`（不允許 Opus）
- 記憶更新等背景任務始終使用最便宜的模型，不受用戶偏好影響

---

## 六、推薦方案與實施路線圖

### Phase 1：MVP（方案 A 增強版）— 建議立即實施

**目標：** Groq 模型可在 .env 中選填，不再硬編碼。

**修改範圍：**

| 檔案 | 修改內容 | 改動量 |
|------|----------|--------|
| `config.ts` | 1. Groq model 改讀 `process.env.GROQ_MODEL`<br>2. 新增 `MODEL_REGISTRY` 常數<br>3. 新增 `validateModelId()` 函式<br>4. 啟動時驗證模型並 console.warn | ~60 行新增 |
| `llm.ts` | 無需修改（已從 config 讀取 model） | 0 行 |
| `db.ts` | 無需修改 | 0 行 |
| `.env.example` | 新增 `GROQ_MODEL` 說明 | ~3 行 |
| `CLAUDE.md` | 更新環境變數說明 | ~5 行 |

**具體修改：**

**config.ts 第 62-67 行：**
```typescript
// 修改前
...(groqKey && {
  groq: {
    apiKey: groqKey,
    model: 'qwen/qwen3-32b',
  },
}),

// 修改後
...(groqKey && {
  groq: {
    apiKey: groqKey,
    model: process.env.GROQ_MODEL || 'qwen/qwen3-32b',
  },
}),
```

**.env.example 新增：**
```env
# GROQ_MODEL=qwen/qwen3-32b    # Groq 模型（預設 qwen/qwen3-32b）
# 可選模型：llama-3.3-70b-versatile, llama-3.1-8b-instant,
#           meta-llama/llama-4-scout-17b-16e-instruct 等
```

### Phase 2：LINE 查詢模型資訊 — 建議第二迭代

**目標：** 用戶在 LINE 中可查詢目前使用的模型和可用模型清單。

新增 LINE 指令（只讀，不切換）：
- 「查看模型」→ 顯示目前使用的 provider + model
- 「可用模型」→ 列出所有支援的模型

**修改範圍：**
- `index.ts`：新增指令路由（約 20 行）
- `llm.ts`：`getProviderInfo()` 已存在，可直接使用

### Phase 3：LINE 動態切換 — 建議第三迭代

**目標：** 用戶在 LINE 中可動態切換模型。

**修改範圍：**
- `config.ts`：新增 `UserPreferences` 型別
- `db.ts`：users 表新增 `preferences` JSON 欄位 + CRUD 函式
- `llm.ts`：`ChatOptions` 新增 `modelOverride`，chat() 路由邏輯調整
- `index.ts`：新增切換模型指令路由
- 新增 `user-settings.ts`：用戶偏好管理模組

---

## 七、注意事項與風險

### 7.1 Groq 模型特殊處理

不同 Groq 模型可能需要不同的前處理：
- `qwen/qwen3-32b`：需要 `/no_think` 後綴和 `<think>` 標籤清理（目前已實作）
- 其他模型（如 Llama）：不需要 `/no_think`，也不會有 `<think>` 標籤

**建議：** 在 `MODEL_REGISTRY` 中加入 `requiresNoThink` 和 `hasThinkingTags` 標記：

```typescript
export interface ModelInfo {
  id: string;
  provider: 'groq' | 'claude';
  toolCalling: boolean;
  description: string;
  // Groq 特有
  requiresNoThink?: boolean;  // 是否需要加 /no_think
  hasThinkingTags?: boolean;  // 是否可能產生 <think> 標籤
}
```

這樣 `chatWithGroq()` 可以根據模型動態決定是否加 `/no_think` 和清理 `<think>` 標籤。

### 7.2 Claude 模型版本管理

Claude 模型有兩種 ID 格式：
- 別名：`claude-sonnet-4-5`（永遠指向最新版本）
- 固定版：`claude-sonnet-4-5-20250929`（指向特定快照）

**建議：** .env 預設使用別名版本，讓用戶自動獲得更新。但在 `MODEL_REGISTRY` 中同時保留兩種格式供驗證。

### 7.3 現有程式碼中的硬編碼模型引用

需要確認除了 `config.ts` 之外，是否有其他地方硬編碼了模型 ID。經搜尋確認，目前只有 `config.ts` 第 66 行有 Groq 模型硬編碼，其他地方都從 config 讀取，改動範圍可控。

---

## 八、總結

| 問題 | 回答 |
|------|------|
| 模型可以讓用戶選填嗎？ | 可以，且應該支援 |
| MVP 推薦方案？ | 方案 A（.env 配置，Groq model 可選填） |
| 改動量？ | config.ts ~60 行、.env.example ~3 行 |
| 需要改 DB 嗎？ | MVP 不需要 |
| 需要改 llm.ts 嗎？ | MVP 不需要 |
| 最大風險？ | 不同模型的前處理差異（/no_think 等） |
| 最終目標？ | 方案 C（.env 預設 + LINE 動態切換 + DB 偏好） |

---

## 參考資料

- [Groq 支援模型清單](https://console.groq.com/docs/models)
- [Groq Tool Use 文件](https://console.groq.com/docs/tool-use)
- [Claude 模型概覽](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Claude Tool Use 實作指南](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)
