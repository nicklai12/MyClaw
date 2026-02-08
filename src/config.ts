// ============================================
// 環境變數與設定
// ============================================

export interface AppConfig {
  line: {
    channelAccessToken: string;
    channelSecret: string;
  };
  llm: {
    provider: 'claude-only' | 'groq-only' | 'hybrid';
    claude?: {
      apiKey: string;
      defaultModel: string;
      complexModel: string;
    };
    groq?: {
      apiKey: string;
      model: string;
    };
  };
  port: number;
  nodeEnv: string;
}

export function loadConfig(): AppConfig {
  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const lineSecret = process.env.LINE_CHANNEL_SECRET;
  if (!lineToken || !lineSecret) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN 和 LINE_CHANNEL_SECRET 為必填');
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  if (!anthropicKey && !groqKey) {
    throw new Error('至少需要設定 ANTHROPIC_API_KEY 或 GROQ_API_KEY 其中之一');
  }

  let provider: AppConfig['llm']['provider'];
  if (anthropicKey && groqKey) {
    provider = 'hybrid';
  } else if (anthropicKey) {
    provider = 'claude-only';
  } else {
    provider = 'groq-only';
  }

  return {
    line: {
      channelAccessToken: lineToken,
      channelSecret: lineSecret,
    },
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
    },
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

// ============================================
// LLM 共用型別
// ============================================

export type Complexity = 'simple' | 'moderate' | 'complex';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
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
  tools: string; // JSON array string
  enabled: number; // SQLite boolean: 0 | 1
  source_type: SourceType;
  source_url: string;
  created_at: string;
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
  provider: 'groq' | 'claude';
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

const GROQ_DEFAULT_MODEL = 'qwen/qwen3-32b';
const CLAUDE_DEFAULT_DEFAULT_MODEL = 'claude-haiku-4-5-20250501';
const CLAUDE_DEFAULT_COMPLEX_MODEL = 'claude-sonnet-4-5-20250514';

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
 * 根據模型 ID 取得模型資訊
 */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  return GROQ_MODEL_REGISTRY[modelId] || CLAUDE_MODEL_REGISTRY[modelId];
}

// ============================================
// 常數
// ============================================

export const MAX_PROMPT_LENGTH = 5000;
export const MAX_SKILLS_PER_USER = 20;
export const MAX_TOKENS_DEFAULT = 1024;
export const MAX_MEMORY_LENGTH = 10000;
export const RECENT_MESSAGES_COUNT = 10;
