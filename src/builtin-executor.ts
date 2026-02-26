// ============================================
// 內建工具執行器
// ============================================
// 處理 builtin__ 前綴的工具呼叫，路由到對應的內建功能。

import { saveCodeSnippet, listCodeSnippets, getCodeSnippet } from './db';

/**
 * 判斷工具名稱是否為內建工具
 */
export function isBuiltinToolCall(toolName: string): boolean {
  return toolName.startsWith('builtin__');
}

/**
 * 執行內建工具呼叫
 */
export async function executeBuiltinTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: number
): Promise<string> {
  const action = toolName.replace('builtin__', '');

  switch (action) {
    case 'save_code': {
      const title = input.title as string;
      const language = input.language as string;
      const code = input.code as string;
      const description = (input.description as string) || '';

      if (!title || !language || !code) {
        return JSON.stringify({ error: true, message: '缺少必要參數: title, language, code' });
      }

      const snippet = saveCodeSnippet(userId, title, language, code, description);
      return JSON.stringify({
        success: true,
        snippet_id: snippet.id,
        title: snippet.title,
        language: snippet.language,
        message: `代碼「${snippet.title}」已儲存 (ID: ${snippet.id})`,
      });
    }

    case 'list_code': {
      const snippets = listCodeSnippets(userId);
      if (snippets.length === 0) {
        return JSON.stringify({ success: true, snippets: [], message: '目前沒有儲存的代碼片段' });
      }
      const list = snippets.map(s => ({
        id: s.id,
        title: s.title,
        language: s.language,
        description: s.description,
        updated_at: s.updated_at,
      }));
      return JSON.stringify({ success: true, snippets: list, total: snippets.length });
    }

    case 'get_code': {
      const snippetId = input.snippet_id as number;
      if (!snippetId) {
        return JSON.stringify({ error: true, message: '缺少必要參數: snippet_id' });
      }
      const snippet = getCodeSnippet(snippetId);
      if (!snippet) {
        return JSON.stringify({ error: true, message: `找不到 ID 為 ${snippetId} 的代碼片段` });
      }
      return JSON.stringify({
        success: true,
        id: snippet.id,
        title: snippet.title,
        language: snippet.language,
        code: snippet.code,
        description: snippet.description,
        created_at: snippet.created_at,
        updated_at: snippet.updated_at,
      });
    }

    default:
      return JSON.stringify({ error: true, message: `未知內建工具: ${toolName}` });
  }
}
