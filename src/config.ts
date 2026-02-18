// ============================================
// 環境變數與設定
// ============================================

export type PlatformType = 'line' | 'telegram';

export interface McpServerConfig {
  name: string;
  transport:
    | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
    | { type: 'sse'; url: string; headers?: Record<string, string> };
}

export interface AppConfig {
  line?: {
    channelAccessToken: string;
    channelSecret: string;
  };
  telegram?: {
    botToken: string;
  };
  llm: {
    provider: 'claude-only' | 'groq-only' | 'cerebras-only' | 'hybrid';
    claude?: {
      apiKey: string;
      defaultModel: string;
      complexModel: string;
    };
    groq?: {
      apiKey: string;
      model: string;
    };
    cerebras?: {
      apiKey: string;
      model: string;
    };
  };
  mcp?: {
    servers: McpServerConfig[];
  };
  port: number;
  nodeEnv: string;
  webhookBaseUrl?: string;
}

export function loadConfig(): AppConfig {
  // 平台設定：至少需要一個平台（LINE 或 Telegram）
  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const lineSecret = process.env.LINE_CHANNEL_SECRET;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;

  const hasLine = !!(lineToken && lineSecret);
  const hasTelegram = !!telegramToken;

  if (!hasLine && !hasTelegram) {
    throw new Error('至少需要設定一個平台：LINE (LINE_CHANNEL_ACCESS_TOKEN + LINE_CHANNEL_SECRET) 或 Telegram (TELEGRAM_BOT_TOKEN)');
  }

  // LLM 設定：至少需要一個 LLM provider
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const cerebrasKey = process.env.CEREBRAS_API_KEY;

  if (!anthropicKey && !groqKey && !cerebrasKey) {
    throw new Error('至少需要設定 ANTHROPIC_API_KEY、GROQ_API_KEY 或 CEREBRAS_API_KEY 其中之一');
  }

  // Provider 偵測：計算有幾個 LLM key
  const llmCount = [anthropicKey, groqKey, cerebrasKey].filter(Boolean).length;
  let provider: AppConfig['llm']['provider'];
  if (llmCount >= 2) {
    provider = 'hybrid';
  } else if (anthropicKey) {
    provider = 'claude-only';
  } else if (groqKey) {
    provider = 'groq-only';
  } else {
    provider = 'cerebras-only';
  }

  return {
    ...(hasLine && {
      line: {
        channelAccessToken: lineToken!,
        channelSecret: lineSecret!,
      },
    }),
    ...(hasTelegram && {
      telegram: {
        botToken: telegramToken!,
      },
    }),
    llm: {
      provider,
      ...(anthropicKey && {
        claude: {
          apiKey: anthropicKey,
          defaultModel: validateClaudeModel(
            process.env.CLAUDE_DEFAULT_MODEL || CLAUDE_DEFAULT_DEFAULT_MODEL,
            CLAUDE_DEFAULT_DEFAULT_MODEL,
          ),
          complexModel: validateClaudeModel(
            process.env.CLAUDE_COMPLEX_MODEL || CLAUDE_DEFAULT_COMPLEX_MODEL,
            CLAUDE_DEFAULT_COMPLEX_MODEL,
          ),
        },
      }),
      ...(groqKey && {
        groq: {
          apiKey: groqKey,
          model: validateGroqModel(process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL),
        },
      }),
      ...(cerebrasKey && {
        cerebras: {
          apiKey: cerebrasKey,
          model: validateCerebrasModel(process.env.CEREBRAS_MODEL || CEREBRAS_DEFAULT_MODEL),
        },
      }),
    },
    ...parseMcpConfig(),
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    webhookBaseUrl: process.env.WEBHOOK_BASE_URL,
  };
}

// ============================================
// LLM 共用型別
// ============================================

export type Complexity = 'simple' | 'moderate' | 'complex';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;    // role='tool' 時必填，對應 tool_use block 的 id
  toolCalls?: ToolCall[];  // role='assistant' 時，LLM 回傳的 tool calls
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ChatOptions {
  messages: ChatMessage[];
  systemPrompt?: string;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'any' | 'none';  // any = 強制使用工具，防止 AI 造假
  maxTokens?: number;
  complexity?: Complexity;
  jsonMode?: boolean;
}

export interface ChatResponse {
  content: string;
  toolCalls: ToolCall[];
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  provider: string;
  model: string;
}

// ============================================
// 資料庫型別
// ============================================

export interface User {
  id: number;
  line_user_id: string;
  display_name: string;
  memory_md: string;
  platform: string;
  platform_user_id: string;
  created_at: string;
  updated_at: string;
}

export type TriggerType = 'keyword' | 'pattern' | 'cron' | 'manual' | 'always';
export type SourceType = 'user_created' | 'github_import' | 'catalog' | 'shared';

export interface Skill {
  id: number;
  user_id: number;
  name: string;
  description: string;
  trigger_type: TriggerType;
  trigger_value: string;
  prompt: string;
  tools: string; // JSON array string (legacy, 由 api_config 取代)
  api_config: string; // JSON string of ApiConfig | null
  enabled: number; // SQLite boolean: 0 | 1
  source_type: SourceType;
  source_url: string;
  created_at: string;
}

// ============================================
// API 連線設定型別（僅連線資訊，不含端點定義）
// ============================================
// 端點知識存在技能的 prompt 中（SKILL.md 內容），
// AI 自行讀取 prompt 決定呼叫哪個 API，透過通用 api_call 工具執行。

export interface ApiConfig {
  base_url: string;
  auth: {
    type: 'bearer_token' | 'api_key' | 'none';
    login_endpoint?: string;     // bearer_token: 登入取得 token 的端點
    credentials_service?: string; // bearer_token: credentials 在 DB 中的 service 名稱
    token_field?: string;         // bearer_token: 回傳 JSON 中 token 的欄位名
    token_ttl_minutes?: number;   // bearer_token: token 過期時間
    api_key_header?: string;      // api_key: header 名稱
    api_key_service?: string;     // api_key: credentials 中的 key 名稱
  };
  mcp_servers?: string[];  // 技能要使用的 MCP server 名稱列表
  mcp_tool_filter?: string[];  // 只使用這些 MCP 工具（白名單，不含前綴）
}

export interface Message {
  id: number;
  user_id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ScheduledTask {
  id: number;
  skill_id: number;
  user_id: number;
  cron_expression: string;
  next_run: string;
  last_run: string;
  enabled: number;
}

// ============================================
// 技能系統型別
// ============================================

export interface SkillCreateRequest {
  name: string;
  description: string;
  trigger: {
    type: TriggerType;
    value: string;
  };
  prompt: string;
  tools?: string[];
  api_config?: ApiConfig;
}

export interface SkillImportResult {
  skill: SkillCreateRequest;
  source: {
    type: SourceType;
    url: string;
    originalFormat: string;
  };
  warnings: string[];
}

// ============================================
// 模型註冊表（白名單 + 特性標記）
// ============================================

export interface ModelInfo {
  id: string;
  name: string;
  provider: 'groq' | 'claude' | 'cerebras';
  toolCalling: boolean;
  /** 需要在 user prompt 結尾附加 /no_think 加速回應（Qwen3 系列） */
  needsNoThink: boolean;
  /** 回應可能包含 <think> 標籤需要清理（Qwen3 系列） */
  needsThinkCleanup: boolean;
  note: string;
}

export const GROQ_MODEL_REGISTRY: Record<string, ModelInfo> = {
  'qwen/qwen3-32b': {
    id: 'qwen/qwen3-32b',
    name: 'Qwen3 32B',
    provider: 'groq',
    toolCalling: true,
    needsNoThink: true,
    needsThinkCleanup: true,
    note: '免費主力，中文優秀，JSON 輸出偶有問題',
  },
  'qwen-qwq-32b': {
    id: 'qwen-qwq-32b',
    name: 'QwQ 32B (推理)',
    provider: 'groq',
    toolCalling: true,
    needsNoThink: true,
    needsThinkCleanup: true,
    note: '推理型模型，適合複雜任務',
  },
  'moonshotai/kimi-k2-instruct-0905': {
    id: 'moonshotai/kimi-k2-instruct-0905',
    name: 'Kimi K2',
    provider: 'groq',
    toolCalling: true,
    needsNoThink: false,
    needsThinkCleanup: false,
    note: 'Tool Calling ~95% 成功率，中英雙語優秀，速度較慢',
  },
  'meta-llama/llama-4-scout-17b-16e-instruct': {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    name: 'Llama 4 Scout',
    provider: 'groq',
    toolCalling: true,
    needsNoThink: false,
    needsThinkCleanup: false,
    note: 'Meta Llama 4，TPD 500K，中文能力一般',
  },
  'meta-llama/llama-3.3-70b-versatile': {
    id: 'meta-llama/llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B',
    provider: 'groq',
    toolCalling: true,
    needsNoThink: false,
    needsThinkCleanup: false,
    note: 'Llama 3.3，穩定可靠',
  },
  'openai/gpt-oss-120b': {
    id: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    provider: 'groq',
    toolCalling: true,
    needsNoThink: false,
    needsThinkCleanup: false,
    note: '中文能力極差，不建議用於中文場景',
  },
  'mistralai/mistral-saba-24b': {
    id: 'mistralai/mistral-saba-24b',
    name: 'Mistral Saba 24B',
    provider: 'groq',
    toolCalling: true,
    needsNoThink: false,
    needsThinkCleanup: false,
    note: 'Mistral 輕量模型',
  },
};

export const CLAUDE_MODEL_REGISTRY: Record<string, ModelInfo> = {
  'claude-haiku-4-5-20250501': {
    id: 'claude-haiku-4-5-20250501',
    name: 'Claude Haiku 4.5',
    provider: 'claude',
    toolCalling: true,
    needsNoThink: false,
    needsThinkCleanup: false,
    note: '快速便宜，~101 TPS',
  },
  'claude-sonnet-4-5-20250514': {
    id: 'claude-sonnet-4-5-20250514',
    name: 'Claude Sonnet 4.5',
    provider: 'claude',
    toolCalling: true,
    needsNoThink: false,
    needsThinkCleanup: false,
    note: '均衡首選，品質優秀',
  },
  'claude-sonnet-4-20250514': {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'claude',
    toolCalling: true,
    needsNoThink: false,
    needsThinkCleanup: false,
    note: '均衡穩定',
  },
  'claude-haiku-3-5-20241022': {
    id: 'claude-haiku-3-5-20241022',
    name: 'Claude Haiku 3.5',
    provider: 'claude',
    toolCalling: true,
    needsNoThink: false,
    needsThinkCleanup: false,
    note: '最便宜，$0.80/MTok input',
  },
};

export const CEREBRAS_MODEL_REGISTRY: Record<string, ModelInfo> = {
  'gpt-oss-120b': {
    id: 'gpt-oss-120b',
    name: 'GPT-OSS 120B',
    provider: 'cerebras',
    toolCalling: true,
    needsNoThink: false,
    needsThinkCleanup: false,
    note: 'Production, 3000 tok/s, 131K context',
  },
  'qwen-3-235b-a22b-instruct-2507': {
    id: 'qwen-3-235b-a22b-instruct-2507',
    name: 'Qwen3 235B A22B',
    provider: 'cerebras',
    toolCalling: true,
    needsNoThink: true,
    needsThinkCleanup: true,
    note: 'Preview, Qwen3 系列需 /no_think',
  },
  'zai-glm-4.7': {
    id: 'zai-glm-4.7',
    name: 'ZAI GLM 4.7',
    provider: 'cerebras',
    toolCalling: true,
    needsNoThink: false,
    needsThinkCleanup: false,
    note: 'Preview, RPD=100',
  },
};

const GROQ_DEFAULT_MODEL = 'qwen/qwen3-32b';
const CLAUDE_DEFAULT_DEFAULT_MODEL = 'claude-haiku-4-5-20250501';
const CLAUDE_DEFAULT_COMPLEX_MODEL = 'claude-sonnet-4-5-20250514';
const CEREBRAS_DEFAULT_MODEL = 'gpt-oss-120b';

/**
 * 驗證 Groq 模型是否在白名單中，回傳驗證後的 model ID
 */
function validateGroqModel(model: string): string {
  if (GROQ_MODEL_REGISTRY[model]) {
    return model;
  }
  const available = Object.keys(GROQ_MODEL_REGISTRY).join(', ');
  console.warn(`[config] GROQ_MODEL "${model}" 不在白名單中，改用預設 ${GROQ_DEFAULT_MODEL}`);
  console.warn(`[config] 可用的 Groq 模型: ${available}`);
  return GROQ_DEFAULT_MODEL;
}

/**
 * 驗證 Claude 模型是否在白名單中
 */
function validateClaudeModel(model: string, fallback: string): string {
  if (CLAUDE_MODEL_REGISTRY[model]) {
    return model;
  }
  const available = Object.keys(CLAUDE_MODEL_REGISTRY).join(', ');
  console.warn(`[config] Claude 模型 "${model}" 不在白名單中，改用預設 ${fallback}`);
  console.warn(`[config] 可用的 Claude 模型: ${available}`);
  return fallback;
}

/**
 * 驗證 Cerebras 模型是否在白名單中
 */
function validateCerebrasModel(model: string): string {
  if (CEREBRAS_MODEL_REGISTRY[model]) {
    return model;
  }
  const available = Object.keys(CEREBRAS_MODEL_REGISTRY).join(', ');
  console.warn(`[config] CEREBRAS_MODEL "${model}" 不在白名單中，改用預設 ${CEREBRAS_DEFAULT_MODEL}`);
  console.warn(`[config] 可用的 Cerebras 模型: ${available}`);
  return CEREBRAS_DEFAULT_MODEL;
}

/**
 * 根據模型 ID 取得模型資訊
 */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  return GROQ_MODEL_REGISTRY[modelId] || CLAUDE_MODEL_REGISTRY[modelId] || CEREBRAS_MODEL_REGISTRY[modelId];
}

// ============================================
// 常數
// ============================================

export const MAX_PROMPT_LENGTH = 10000;
export const MAX_SKILLS_PER_USER = 20;
export const MAX_TOKENS_DEFAULT = 1024;
export const MAX_MEMORY_LENGTH = 10000;
export const RECENT_MESSAGES_COUNT = 10;

// ============================================
// MCP 配置解析
// ============================================

/**
 * 解析 MCP_SERVERS 環境變數
 * 格式：JSON 陣列，例如：
 * [{"name":"playwright","transport":{"type":"sse","url":"http://127.0.0.1:8080/sse"}}]
 */
function parseMcpConfig(): { mcp?: { servers: McpServerConfig[] } } {
  const raw = process.env.MCP_SERVERS;
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as McpServerConfig[];
    if (!Array.isArray(parsed) || parsed.length === 0) return {};

    // 基本驗證
    for (const server of parsed) {
      if (!server.name || !server.transport || !server.transport.type) {
        console.warn(`[config] MCP server 配置無效（缺少 name 或 transport）: ${JSON.stringify(server)}`);
        return {};
      }
    }

    console.log(`[config] MCP 配置已載入: ${parsed.map(s => s.name).join(', ')}`);
    return { mcp: { servers: parsed } };
  } catch (error) {
    console.warn(`[config] MCP_SERVERS 環境變數解析失敗: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}
