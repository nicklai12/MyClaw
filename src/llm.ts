// ============================================
// LLM Provider Pattern — AI 引擎核心
// ============================================
// 支援三種模式：claude-only / groq-only / hybrid
// 由 config.ts 的 loadConfig() 自動偵測 API Key 決定

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import {
  AppConfig,
  ChatOptions,
  ChatResponse,
  ChatMessage,
  ToolDefinition,
  ToolCall,
  Complexity,
  MAX_TOKENS_DEFAULT,
  getModelInfo,
} from './config';

// ============================================
// OpenAI 相容 Provider 介面
// ============================================

interface OpenAICompatProvider {
  client: OpenAI;
  model: string;
  providerName: string;
  /** 是否在 tool 定義中加入 strict: true（某些 provider 支援） */
  strictTools?: boolean;
}

// ============================================
// 模組狀態
// ============================================

let currentConfig: AppConfig | null = null;
let claudeClient: Anthropic | null = null;
let groqClient: OpenAI | null = null;
let cerebrasClient: OpenAI | null = null;
let moonshotClient: OpenAI | null = null;

// ============================================
// 初始化
// ============================================

/**
 * 初始化 LLM Provider（在 server 啟動時呼叫一次）
 */
export function initLLM(config: AppConfig): void {
  currentConfig = config;

  const { provider, claude, groq } = config.llm;

  // 初始化 Claude client
  if (claude) {
    claudeClient = new Anthropic({ apiKey: claude.apiKey });
    console.log(
      `[LLM] Claude provider 已初始化 — defaultModel: ${claude.defaultModel}, complexModel: ${claude.complexModel}`
    );
  }

  // 初始化 Groq client（OpenAI 相容格式）
  if (groq) {
    groqClient = new OpenAI({
      apiKey: groq.apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    console.log(`[LLM] Groq provider 已初始化 — model: ${groq.model}`);
  }

  // 初始化 Cerebras client（OpenAI 相容格式）
  const cerebras = config.llm.cerebras;
  if (cerebras) {
    cerebrasClient = new OpenAI({
      apiKey: cerebras.apiKey,
      baseURL: 'https://api.cerebras.ai/v1',
    });
    console.log(`[LLM] Cerebras provider 已初始化 — model: ${cerebras.model}`);
  }

  // 初始化 Moonshot client（OpenAI 相容格式）
  const moonshot = config.llm.moonshot;
  if (moonshot) {
    moonshotClient = new OpenAI({
      apiKey: moonshot.apiKey,
      baseURL: 'https://api.moonshot.ai/v1',
    });
    console.log(`[LLM] Moonshot provider 已初始化 — model: ${moonshot.model}`);
  }

  console.log(`[LLM] 執行模式: ${provider}`);
}

// ============================================
// 主要對話介面
// ============================================

/**
 * 主要對話介面 — 根據 provider 模式和複雜度路由到對應的 LLM
 */
export async function chat(options: ChatOptions): Promise<ChatResponse> {
  if (!currentConfig) {
    throw new Error('[LLM] 尚未初始化，請先呼叫 initLLM()');
  }

  const { provider } = currentConfig.llm;
  const complexity = options.complexity || 'simple';

  switch (provider) {
    case 'claude-only':
      return chatWithClaude(options, complexity);

    case 'groq-only':
      return chatWithOpenAICompat(options, getGroqProvider());

    case 'cerebras-only':
      return chatWithOpenAICompat(options, getCerebrasProvider());

    case 'moonshot-only':
      return chatWithOpenAICompat(options, getMoonshotProvider());

    case 'hybrid': {
      // 混合模式路由：
      //   complex（報告/生成）→ Claude（品質最好）→ Cerebras（速度快）→ Moonshot → Groq
      //   simple（tool calling）→ Groq（工具呼叫精準）→ Cerebras（速度快）→ Moonshot → Claude
      if (complexity === 'complex') {
        if (currentConfig.llm.claude) return chatWithClaude(options, complexity);
        if (currentConfig.llm.cerebras) return chatWithOpenAICompat(options, getCerebrasProvider());
        if (currentConfig.llm.moonshot) return chatWithOpenAICompat(options, getMoonshotProvider());
        if (currentConfig.llm.groq) return chatWithOpenAICompat(options, getGroqProvider());
      } else {
        if (currentConfig.llm.groq) return chatWithOpenAICompat(options, getGroqProvider());
        if (currentConfig.llm.cerebras) return chatWithOpenAICompat(options, getCerebrasProvider());
        if (currentConfig.llm.moonshot) return chatWithOpenAICompat(options, getMoonshotProvider());
        if (currentConfig.llm.claude) return chatWithClaude(options, complexity);
      }
      throw new Error('[LLM] hybrid 模式但無可用的 provider');
    }

    default:
      throw new Error(`[LLM] 未知的 provider: ${provider}`);
  }
}

// ============================================
// Provider 資訊
// ============================================

/**
 * 取得目前 Provider 資訊
 */
export function getProviderInfo(): { provider: string; model: string } {
  if (!currentConfig) {
    return { provider: 'uninitialized', model: 'none' };
  }

  const { provider, claude, groq } = currentConfig.llm;

  const cerebras = currentConfig.llm.cerebras;
  const moonshot = currentConfig.llm.moonshot;

  switch (provider) {
    case 'claude-only':
      return {
        provider: 'claude-only',
        model: `${claude!.defaultModel} / ${claude!.complexModel}`,
      };
    case 'groq-only':
      return {
        provider: 'groq-only',
        model: groq!.model,
      };
    case 'cerebras-only':
      return {
        provider: 'cerebras-only',
        model: cerebras!.model,
      };
    case 'moonshot-only':
      return {
        provider: 'moonshot-only',
        model: moonshot!.model,
      };
    case 'hybrid': {
      const parts: string[] = [];
      if (groq) parts.push(`Groq(${groq.model})`);
      if (cerebras) parts.push(`Cerebras(${cerebras.model})`);
      if (moonshot) parts.push(`Moonshot(${moonshot.model})`);
      if (claude) parts.push(`Claude(${claude.complexModel})`);
      return {
        provider: 'hybrid',
        model: parts.join(' + '),
      };
    }
    default:
      return { provider: 'unknown', model: 'unknown' };
  }
}

// ============================================
// Claude Provider 實作
// ============================================

/**
 * 使用 Claude API 進行對話
 * - 支援 Tool Calling（轉換 ToolDefinition → Anthropic 格式）
 * - 支援 Prompt Caching（system prompt 加 cache_control）
 * - 內部路由：simple/moderate → defaultModel, complex → complexModel
 * - 錯誤處理 + 基本 retry（最多 2 次）
 */
async function chatWithClaude(
  options: ChatOptions,
  complexity: Complexity
): Promise<ChatResponse> {
  if (!claudeClient || !currentConfig?.llm.claude) {
    throw new Error('[LLM] Claude client 未初始化');
  }

  const claudeConfig = currentConfig.llm.claude;

  // 內部路由：根據複雜度選擇模型
  const model =
    complexity === 'complex'
      ? claudeConfig.complexModel
      : claudeConfig.defaultModel;

  const maxTokens = options.maxTokens || MAX_TOKENS_DEFAULT;

  // 轉換 messages 為 Anthropic 格式（支援 tool result 多輪對話）
  const messages: Anthropic.MessageParam[] = convertToAnthropicMessages(options.messages);

  // 建構 system prompt（支援 Prompt Caching）
  const systemBlocks: Anthropic.TextBlockParam[] = options.systemPrompt
    ? [
        {
          type: 'text' as const,
          text: options.systemPrompt,
          cache_control: { type: 'ephemeral' as const },
        },
      ]
    : [];

  // 轉換 tools 為 Anthropic 格式
  const tools: Anthropic.Tool[] | undefined = options.tools?.map(
    convertToolToAnthropic
  );

  // retry 邏輯（最多 2 次）
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // tool_choice: 強制 AI 使用工具（防止造假資料）
      const toolChoice = options.toolChoice === 'any'
        ? { type: 'any' as const }
        : options.toolChoice === 'none'
          ? { type: 'none' as const }
          : { type: 'auto' as const };

      const response = await claudeClient.messages.create({
        model,
        max_tokens: maxTokens,
        ...(systemBlocks.length > 0 ? { system: systemBlocks } : {}),
        messages,
        ...(tools && tools.length > 0 ? { tools, tool_choice: toolChoice } : {}),
      });

      // 解析回應：處理 text block 和 tool_use block
      const content = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      const toolCalls: ToolCall[] = response.content
        .filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
        )
        .map((block) => ({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        }));

      // 取得 usage（包含 cache 資訊）
      const usage = response.usage as Anthropic.Usage & {
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };

      if (usage.cache_read_input_tokens && usage.cache_read_input_tokens > 0) {
        console.log(
          `[LLM] Claude cache hit: ${usage.cache_read_input_tokens} tokens`
        );
      }

      return {
        content,
        toolCalls,
        usage: {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
        },
        provider: 'claude',
        model,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[LLM] Claude API 錯誤 (attempt ${attempt + 1}/3): ${lastError.message}`
      );

      // 不可重試的錯誤：認證失敗、無效請求
      if (
        error instanceof Anthropic.AuthenticationError ||
        error instanceof Anthropic.BadRequestError
      ) {
        throw lastError;
      }

      // 可重試的錯誤：等待後重試
      if (attempt < 2) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s
        console.log(`[LLM] 等待 ${delay}ms 後重試...`);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('[LLM] Claude API 呼叫失敗（已重試 3 次）');
}

/**
 * 將 ChatMessage[] 轉換為 Anthropic MessageParam[]
 * 處理 role='tool' → tool_result，以及 assistant 的 toolCalls → tool_use blocks
 */
function convertToAnthropicMessages(msgs: ChatMessage[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];

  for (const msg of msgs) {
    if (msg.role === 'user') {
      result.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      // 如果 assistant 有 toolCalls，需要包含 tool_use blocks
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const contentBlocks: (Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam)[] = [];
        if (msg.content) {
          contentBlocks.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.input,
          });
        }
        result.push({ role: 'assistant', content: contentBlocks });
      } else {
        result.push({ role: 'assistant', content: msg.content });
      }
    } else if (msg.role === 'tool') {
      // tool result → Anthropic 的 user message with tool_result block
      result.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.toolCallId || '',
            content: msg.content,
          },
        ],
      });
    }
  }

  return result;
}

/**
 * 將 config.ts 的 ToolDefinition 轉換為 Anthropic Tool 格式
 */
function convertToolToAnthropic(tool: ToolDefinition): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
  };
}

// ============================================
// OpenAI 相容 Provider Helper
// ============================================

function getGroqProvider(): OpenAICompatProvider {
  if (!groqClient || !currentConfig?.llm.groq) {
    throw new Error('[LLM] Groq client 未初始化');
  }
  return {
    client: groqClient,
    model: currentConfig.llm.groq.model,
    providerName: 'groq',
  };
}

function getCerebrasProvider(): OpenAICompatProvider {
  if (!cerebrasClient || !currentConfig?.llm.cerebras) {
    throw new Error('[LLM] Cerebras client 未初始化');
  }
  return {
    client: cerebrasClient,
    model: currentConfig.llm.cerebras.model,
    providerName: 'cerebras',
  };
}

function getMoonshotProvider(): OpenAICompatProvider {
  if (!moonshotClient || !currentConfig?.llm.moonshot) {
    throw new Error('[LLM] Moonshot client 未初始化');
  }
  return {
    client: moonshotClient,
    model: currentConfig.llm.moonshot.model,
    providerName: 'moonshot',
  };
}

// ============================================
// OpenAI 相容 Provider 實作（Groq / Cerebras 共用）
// ============================================

/**
 * 使用 OpenAI 相容 API 進行對話
 * - 根據模型註冊表決定前處理行為（/no_think、<think> 清理）
 * - Tool Calling 支援
 * - JSON 輸出有可靠性問題，需要基本驗證
 * - 錯誤處理 + 基本 retry（最多 2 次）
 */
async function chatWithOpenAICompat(options: ChatOptions, provider: OpenAICompatProvider): Promise<ChatResponse> {
  const { client, model, providerName } = provider;
  const modelInfo = getModelInfo(model);
  const maxTokens = options.maxTokens || MAX_TOKENS_DEFAULT;

  // 建構 OpenAI 格式 messages
  const messages: OpenAI.ChatCompletionMessageParam[] = [];

  // System prompt
  if (options.systemPrompt) {
    messages.push({
      role: 'system',
      content: options.systemPrompt,
    });
  }

  // 對話歷史（支援 tool result 多輪對話）
  for (const msg of options.messages) {
    if (msg.role === 'tool') {
      // tool result → OpenAI tool message
      messages.push({
        role: 'tool',
        content: msg.content,
        tool_call_id: msg.toolCallId || '',
      } as OpenAI.ChatCompletionToolMessageParam);
    } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      // assistant with tool_calls
      messages.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.input),
          },
        })),
      } as OpenAI.ChatCompletionAssistantMessageParam);
    } else {
      // 一般 user / assistant 訊息
      const isLastUser =
        msg === options.messages[options.messages.length - 1] &&
        msg.role === 'user';
      const shouldAppendNoThink = isLastUser && modelInfo?.needsNoThink;

      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: shouldAppendNoThink ? `${msg.content}\n/no_think` : msg.content,
      });
    }
  }

  // 轉換 tools 為 OpenAI 格式
  const tools: OpenAI.ChatCompletionTool[] | undefined = options.tools?.map(
    (t) => convertToolToOpenAI(t, provider.strictTools)
  );

  // retry 邏輯（最多 2 次）
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // tool_choice: 強制 AI 使用工具（防止造假資料）
      const toolChoice = options.toolChoice === 'any'
        ? 'required' as const      // OpenAI 格式：'required' = 強制使用工具
        : options.toolChoice === 'none'
          ? 'none' as const
          : 'auto' as const;

      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages,
        ...(tools && tools.length > 0 ? { tools, tool_choice: toolChoice } : {}),
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error(`[LLM] ${providerName} API 未回傳任何 choice`);
      }

      const rawContent = choice.message.content || '';

      // 只有模型需要時才清理 thinking tags（Qwen3 系列）
      const content = modelInfo?.needsThinkCleanup
        ? cleanThinkingTags(rawContent)
        : rawContent.trim();

      // 解析 tool calls
      const toolCalls: ToolCall[] = (choice.message.tool_calls || []).map(
        (tc) => ({
          id: tc.id,
          name: tc.function.name,
          input: safeJsonParse(tc.function.arguments),
        })
      );

      // JSON mode 驗證（某些 provider 的 JSON 輸出可能不可靠）
      if (options.jsonMode && content) {
        validateJsonOutput(content);
      }

      return {
        content,
        toolCalls,
        usage: {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
        },
        provider: providerName,
        model,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[LLM] ${providerName} API 錯誤 (attempt ${attempt + 1}/3): ${lastError.message}`
      );

      // 認證錯誤不重試
      if (
        error instanceof OpenAI.AuthenticationError ||
        error instanceof OpenAI.BadRequestError
      ) {
        throw lastError;
      }

      // 可重試的錯誤：等待後重試
      if (attempt < 2) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s
        console.log(`[LLM] 等待 ${delay}ms 後重試...`);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(`[LLM] ${provider.providerName} API 呼叫失敗（已重試 3 次）`);
}

/**
 * 將 config.ts 的 ToolDefinition 轉換為 OpenAI Tool 格式
 */
function convertToolToOpenAI(
  tool: ToolDefinition,
  strict?: boolean
): OpenAI.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
      ...(strict ? { strict: true } : {}),
    },
  };
}

/**
 * 清理 Qwen3 回應中可能出現的 thinking tags
 * Qwen3 有時會在 /no_think 模式下仍然產生 <think>...</think> 標籤
 */
function cleanThinkingTags(content: string): string {
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return cleaned;
}

/**
 * 安全解析 JSON 字串（用於 tool call arguments）
 */
function safeJsonParse(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str) as Record<string, unknown>;
  } catch {
    console.error(`[LLM] 無法解析 tool call arguments: ${str}`);
    return {};
  }
}

/**
 * 驗證 JSON 輸出的基本有效性
 * Groq/Qwen 的 JSON 輸出有可靠性問題：
 * - 多餘的 { 或 [
 * - markdown code fences
 * - 無效的 JSON 格式
 */
function validateJsonOutput(content: string): void {
  // 嘗試清理 markdown code fences
  let cleaned = content;
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?```\s*$/i, '');
  cleaned = cleaned.trim();

  try {
    JSON.parse(cleaned);
  } catch {
    console.warn(
      `[LLM] Groq JSON 輸出驗證失敗，內容可能不是有效 JSON: ${content.substring(0, 100)}...`
    );
  }
}

// ============================================
// 工具函數
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
