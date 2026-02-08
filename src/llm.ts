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
} from './config';

// ============================================
// 模組狀態
// ============================================

let currentConfig: AppConfig | null = null;
let claudeClient: Anthropic | null = null;
let groqClient: OpenAI | null = null;

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
      return chatWithGroq(options);

    case 'hybrid':
      // 混合模式：simple/moderate → Groq，complex → Claude
      if (complexity === 'complex') {
        return chatWithClaude(options, complexity);
      }
      return chatWithGroq(options);

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
    case 'hybrid':
      return {
        provider: 'hybrid',
        model: `Groq(${groq!.model}) + Claude(${claude!.complexModel})`,
      };
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

  // 轉換 messages 為 Anthropic 格式
  const messages: Anthropic.MessageParam[] = options.messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

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
      const response = await claudeClient.messages.create({
        model,
        max_tokens: maxTokens,
        ...(systemBlocks.length > 0 ? { system: systemBlocks } : {}),
        messages,
        ...(tools && tools.length > 0 ? { tools } : {}),
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
// Groq Provider 實作
// ============================================

/**
 * 使用 Groq API（OpenAI 相容格式）進行對話
 * - model: qwen/qwen3-32b
 * - Tool Calling 支援
 * - user prompt 結尾附加 /no_think 加速回應
 * - JSON 輸出有可靠性問題，需要基本驗證
 * - 錯誤處理 + 基本 retry（最多 2 次）
 */
async function chatWithGroq(options: ChatOptions): Promise<ChatResponse> {
  if (!groqClient || !currentConfig?.llm.groq) {
    throw new Error('[LLM] Groq client 未初始化');
  }

  const groqConfig = currentConfig.llm.groq;
  const model = groqConfig.model;
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

  // 對話歷史
  for (const msg of options.messages) {
    // 最後一條 user message 附加 /no_think 加速回應
    const isLastUser =
      msg === options.messages[options.messages.length - 1] &&
      msg.role === 'user';

    messages.push({
      role: msg.role,
      content: isLastUser ? `${msg.content}\n/no_think` : msg.content,
    });
  }

  // 轉換 tools 為 OpenAI 格式
  const tools: OpenAI.ChatCompletionTool[] | undefined = options.tools?.map(
    convertToolToOpenAI
  );

  // retry 邏輯（最多 2 次）
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await groqClient.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages,
        ...(tools && tools.length > 0 ? { tools } : {}),
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error('[LLM] Groq API 未回傳任何 choice');
      }

      const rawContent = choice.message.content || '';

      // 清理 Groq/Qwen 可能產生的 thinking tags
      const content = cleanGroqContent(rawContent);

      // 解析 tool calls
      const toolCalls: ToolCall[] = (choice.message.tool_calls || []).map(
        (tc) => ({
          id: tc.id,
          name: tc.function.name,
          input: safeJsonParse(tc.function.arguments),
        })
      );

      // JSON mode 驗證（Groq/Qwen 的 JSON 輸出可能不可靠）
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
        provider: 'groq',
        model,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[LLM] Groq API 錯誤 (attempt ${attempt + 1}/3): ${lastError.message}`
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

  throw lastError || new Error('[LLM] Groq API 呼叫失敗（已重試 3 次）');
}

/**
 * 將 config.ts 的 ToolDefinition 轉換為 OpenAI Tool 格式
 */
function convertToolToOpenAI(
  tool: ToolDefinition
): OpenAI.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

/**
 * 清理 Groq/Qwen 回應中可能出現的 thinking tags
 * Qwen3 有時會在 /no_think 模式下仍然產生 <think>...</think> 標籤
 */
function cleanGroqContent(content: string): string {
  // 移除 <think>...</think> 區塊（包含換行）
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
