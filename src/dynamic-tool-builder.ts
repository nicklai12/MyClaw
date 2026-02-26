// ============================================
// Dynamic Tool Builder — 通用工具產生器
// ============================================
// 為有 API 連線設定的技能提供通用工具：
//   - api_call：AI 自行決定呼叫哪個 API 端點
//   - set_credentials：讓用戶設定帳密
// 端點知識在技能的 prompt（SKILL.md 內容）中，AI 自行閱讀並決定。

import type { ApiConfig, ToolDefinition } from './config';

// ============================================
// 通用 API 呼叫工具
// ============================================

const API_CALL_TOOL: ToolDefinition = {
  name: 'api_call',
  description: '呼叫 API 端點。根據技能指令中的 API 文件，指定 HTTP 方法、路徑和請求內容。',
  input_schema: {
    type: 'object',
    properties: {
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE'],
        description: 'HTTP 方法',
      },
      path: {
        type: 'string',
        description: 'API 路徑（如 /api/etl/employee/search），不含 base URL',
      },
      body: {
        type: 'object',
        description: 'POST/PUT/DELETE 的 JSON 請求主體（GET 時省略）',
      },
    },
    required: ['method', 'path'],
  },
};

// ============================================
// 主要匯出函式
// ============================================

/**
 * 為技能建構通用工具定義清單
 *
 * 根據 apiConfig 的認證設定，決定提供哪些工具：
 * - 一律提供 api_call 通用工具
 * - 需要認證時，額外提供 set_{service}_credentials 工具
 *
 * @param apiConfig - 技能的 API 連線設定
 * @param needsCredentialTool - 是否需要帳密設定工具（用戶尚未設定時）
 * @returns ToolDefinition 陣列
 */
export function buildGenericTools(apiConfig: ApiConfig, needsCredentialTool: boolean): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  // 只有設定了 base_url 才提供 api_call 工具（MCP-only 技能不需要）
  if (apiConfig.base_url) {
    tools.push(API_CALL_TOOL);
  }

  if (needsCredentialTool && apiConfig.auth.type !== 'none') {
    const service = apiConfig.auth.credentials_service || 'api';
    const serviceLabel = service.toUpperCase();
    tools.push({
      name: `set_${service}_credentials`,
      description: `設定使用者的${serviceLabel}系統帳號密碼。當使用者提供帳號密碼時呼叫此工具儲存。`,
      input_schema: {
        type: 'object',
        properties: {
          username: { type: 'string', description: `${serviceLabel}系統帳號` },
          password: { type: 'string', description: `${serviceLabel}系統密碼` },
        },
        required: ['username', 'password'],
      },
    });
  }

  return tools;
}

// ============================================
// 內建工具註冊表
// ============================================

const BUILTIN_TOOL_REGISTRY: Record<string, ToolDefinition> = {
  save_code: {
    name: 'builtin__save_code',
    description: '儲存代碼片段到使用者的代碼庫。AI 生成代碼後呼叫此工具存儲。',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '代碼標題' },
        language: { type: 'string', description: '程式語言 (typescript, python, etc.)' },
        code: { type: 'string', description: '完整代碼內容' },
        description: { type: 'string', description: '代碼說明' },
      },
      required: ['title', 'language', 'code'],
    },
  },
  list_code: {
    name: 'builtin__list_code',
    description: '列出使用者儲存的所有代碼片段。',
    input_schema: { type: 'object', properties: {} },
  },
  get_code: {
    name: 'builtin__get_code',
    description: '取得特定代碼片段的完整內容。',
    input_schema: {
      type: 'object',
      properties: {
        snippet_id: { type: 'number', description: '代碼片段 ID' },
      },
      required: ['snippet_id'],
    },
  },
};

/**
 * 從內建工具註冊表中取出指定工具定義
 */
export function buildBuiltinTools(builtinNames: string[]): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  for (const name of builtinNames) {
    const tool = BUILTIN_TOOL_REGISTRY[name];
    if (tool) {
      tools.push(tool);
    } else {
      console.warn(`[dynamic-tool-builder] 未知的內建工具: ${name}`);
    }
  }
  return tools;
}

/**
 * 解析技能的 api_config JSON 字串為 ApiConfig 物件
 */
export function parseApiConfig(apiConfigJson: string): ApiConfig | null {
  if (!apiConfigJson || apiConfigJson.trim() === '') {
    return null;
  }

  try {
    const config = JSON.parse(apiConfigJson) as ApiConfig;
    // MCP-only 技能不需要 base_url，只需要 mcp_servers
    const hasMcp = config.mcp_servers && config.mcp_servers.length > 0;
    // builtin_tools-only 技能不需要 base_url 或 mcp_servers
    const hasBuiltin = config.builtin_tools && config.builtin_tools.length > 0;
    if (!hasMcp && !hasBuiltin && (!config.base_url || !config.auth)) {
      console.warn('[dynamic-tool-builder] api_config 缺少必要欄位 (base_url, auth, mcp_servers, or builtin_tools)');
      return null;
    }
    // 確保 auth 至少有預設值
    if (!config.auth) {
      config.auth = { type: 'none' };
    }
    return config;
  } catch {
    console.warn('[dynamic-tool-builder] api_config JSON 解析失敗');
    return null;
  }
}
