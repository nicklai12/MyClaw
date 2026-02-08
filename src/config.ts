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
          defaultModel: process.env.CLAUDE_DEFAULT_MODEL || 'claude-haiku-4-5-20250501',
          complexModel: process.env.CLAUDE_COMPLEX_MODEL || 'claude-sonnet-4-5-20250514',
        },
      }),
      ...(groqKey && {
        groq: {
          apiKey: groqKey,
          model: 'qwen/qwen3-32b',
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
// 常數
// ============================================

export const MAX_PROMPT_LENGTH = 5000;
export const MAX_SKILLS_PER_USER = 20;
export const MAX_TOKENS_DEFAULT = 1024;
export const MAX_MEMORY_LENGTH = 10000;
export const RECENT_MESSAGES_COUNT = 10;
