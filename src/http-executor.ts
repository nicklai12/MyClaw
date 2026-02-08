// ============================================
// HTTP Executor — 通用 HTTP API 執行器
// ============================================
// 提供一個通用的 api_call 執行器，根據 ApiConfig 的連線設定
// 自動處理認證（Bearer Token / API Key），AI 只需指定 method + path + body。
// Token 管理：per-user per-service 快取，可配置過期時間。

import { getUserCredentials, saveUserCredentials } from './db';
import type { ApiConfig } from './config';

// ============================================
// 常數
// ============================================

const MAX_RESPONSE_LENGTH = 5000;

// ============================================
// Path 安全驗證
// ============================================

/**
 * 驗證 API path 的安全性，防止路徑遍歷和任意 URL 注入
 */
function validatePath(path: string): string {
  // 禁止絕對 URL（防止繞過 base_url）
  if (/^https?:\/\//i.test(path)) {
    throw new Error(`不允許的 path：不可使用完整 URL，請只提供路徑（如 /api/xxx）`);
  }

  // 禁止路徑遍歷
  if (path.includes('/../') || path.includes('/..') || path.startsWith('../')) {
    throw new Error(`不允許的 path：路徑中不可包含 ..`);
  }

  // 確保以 / 開頭
  if (!path.startsWith('/')) {
    return `/${path}`;
  }

  return path;
}

/**
 * 截斷過長的 API 回傳，防止撐爆 LLM context
 */
function truncateResponse(text: string): string {
  if (text.length <= MAX_RESPONSE_LENGTH) {
    return text;
  }
  const truncated = text.substring(0, MAX_RESPONSE_LENGTH);
  console.warn(`[http-executor] API 回傳已截斷: ${text.length} → ${MAX_RESPONSE_LENGTH} 字元`);
  return truncated + '\n...(回傳資料過長，已截斷)';
}

// ============================================
// Token 快取
// ============================================

interface TokenCache {
  token: string;
  expiresAt: number;
}

// key = `${userId}:${service}` — per-user per-service 快取
const tokenStore = new Map<string, TokenCache>();

// ============================================
// 認證處理
// ============================================

/**
 * 取得 Bearer Token（自動處理快取與登入）
 */
async function getBearerToken(userId: number, apiConfig: ApiConfig): Promise<string> {
  const auth = apiConfig.auth;
  const service = auth.credentials_service || 'default';
  const cacheKey = `${userId}:${service}`;
  const ttlMs = (auth.token_ttl_minutes || 30) * 60 * 1000;

  // 檢查快取
  const cached = tokenStore.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.token;
  }

  // 從 DB 取得憑證
  const creds = getUserCredentials(userId, service);
  if (!creds || !creds.username || !creds.password) {
    throw new Error('NO_CREDENTIALS');
  }

  // 登入取得 token
  const loginUrl = `${apiConfig.base_url}${auth.login_endpoint || '/auth/login'}`;
  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: creds.username,
      password: creds.password,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error(`[http-executor] 登入失敗: HTTP ${response.status} ${errorText}`);
    throw new Error(`API 登入失敗 (HTTP ${response.status})，請確認帳號密碼是否正確。`);
  }

  const data = await response.json() as Record<string, unknown>;
  const tokenField = auth.token_field || 'token';
  const token = (data[tokenField] || data.access_token || data.accessToken || data.token) as string;
  if (!token) {
    throw new Error('API 登入回應中找不到 token，請聯絡管理員。');
  }

  // 快取 token
  tokenStore.set(cacheKey, {
    token,
    expiresAt: Date.now() + ttlMs,
  });

  console.log(`[http-executor] 使用者 ${userId} 登入 ${service} 成功，token 已快取 (TTL ${auth.token_ttl_minutes || 30}min)`);
  return token;
}

/**
 * 建構帶認證的 HTTP Headers
 */
async function buildAuthHeaders(userId: number, apiConfig: ApiConfig): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  switch (apiConfig.auth.type) {
    case 'bearer_token': {
      const token = await getBearerToken(userId, apiConfig);
      headers['Authorization'] = `Bearer ${token}`;
      break;
    }
    case 'api_key': {
      const service = apiConfig.auth.api_key_service || 'default';
      const creds = getUserCredentials(userId, service);
      if (!creds || !creds.api_key) {
        throw new Error('NO_CREDENTIALS');
      }
      const headerName = apiConfig.auth.api_key_header || 'X-API-Key';
      headers[headerName] = creds.api_key;
      break;
    }
    case 'none':
      break;
  }

  return headers;
}

// ============================================
// Credential 設定工具 Executor
// ============================================

/**
 * 建立通用的 credential 設定 executor
 */
export function createCredentialExecutor(serviceName: string) {
  return async (args: Record<string, unknown>, userId: number): Promise<string> => {
    const username = args.username as string;
    const password = args.password as string;
    if (!username || !password) {
      return JSON.stringify({ error: true, message: '帳號和密碼都是必填的。' });
    }
    saveUserCredentials(userId, serviceName, { username, password });
    return JSON.stringify({ success: true, message: `${serviceName} 帳密已儲存成功。` });
  };
}

// ============================================
// 主要匯出函式
// ============================================

/**
 * 通用 API 呼叫執行器
 *
 * AI 透過 api_call 工具指定 method + path + body，
 * 本函式自動拼接 base_url、處理認證、執行 HTTP 請求。
 *
 * @param apiConfig - 技能的 API 連線設定（base_url + auth）
 * @param method - HTTP 方法
 * @param path - API 路徑（如 /api/etl/employee/search）
 * @param body - 請求主體（POST/PUT/DELETE 時使用）
 * @param userId - 使用者 DB ID（用於取得認證 token）
 * @returns JSON 字串結果
 */
export async function executeApiCall(
  apiConfig: ApiConfig,
  method: string,
  path: string,
  body: Record<string, unknown> | undefined,
  userId: number
): Promise<string> {
  try {
    // 驗證 path 安全性
    const safePath = validatePath(path);

    // 建構認證 headers
    const headers = await buildAuthHeaders(userId, apiConfig);

    // 建構完整 URL
    const url = `${apiConfig.base_url}${safePath}`;

    // 執行 HTTP 請求
    const options: RequestInit = { method, headers };

    if (body && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
      options.body = JSON.stringify(body);
    }

    console.log(`[http-executor] ${method} ${url}`);
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API 錯誤: ${method} ${path} → HTTP ${response.status} ${errorText}`);
    }

    // 處理空回應
    const text = await response.text();
    if (!text) return JSON.stringify({ success: true });

    try {
      const json = JSON.parse(text);
      return truncateResponse(JSON.stringify(json));
    } catch {
      return truncateResponse(JSON.stringify({ result: text }));
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[http-executor] ${method} ${path} 失敗:`, msg);

    if (msg === 'NO_CREDENTIALS') {
      const service = apiConfig.auth.credentials_service || 'API';
      return JSON.stringify({
        error: true,
        message: `尚未設定 ${service} 帳密。請先提供你的帳號和密碼。`,
      });
    }

    return JSON.stringify({ error: true, message: msg });
  }
}
