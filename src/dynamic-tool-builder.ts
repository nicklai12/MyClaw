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
  const tools: ToolDefinition[] = [API_CALL_TOOL];

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

/**
 * 解析技能的 api_config JSON 字串為 ApiConfig 物件
 */
export function parseApiConfig(apiConfigJson: string): ApiConfig | null {
  if (!apiConfigJson || apiConfigJson.trim() === '') {
    return null;
  }

  try {
    const config = JSON.parse(apiConfigJson) as ApiConfig;
    if (!config.base_url || !config.auth) {
      console.warn('[dynamic-tool-builder] api_config 缺少必要欄位 (base_url, auth)');
      return null;
    }
    return config;
  } catch {
    console.warn('[dynamic-tool-builder] api_config JSON 解析失敗');
    return null;
  }
}
