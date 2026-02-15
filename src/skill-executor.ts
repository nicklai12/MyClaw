// ============================================
// 技能觸發與執行（Agent Skills 架構）
// ============================================
// AI 讀取技能的 prompt（SKILL.md 內容），自行決定呼叫哪個 API。
// 提供通用 api_call 工具，AI 指定 method + path + body，
// http-executor 自動處理 base_url 拼接和認證。

import { chat } from './llm';
import { getUserMemory } from './memory';
import { getUserCredentials } from './db';
import { buildGenericTools, parseApiConfig } from './dynamic-tool-builder';
import { executeApiCall, createCredentialExecutor } from './http-executor';
import type { Skill, ChatMessage, ToolDefinition } from './config';

// ============================================
// 常數
// ============================================

const MAX_TOOL_ITERATIONS = 5;

// ============================================
// 觸發偵測
// ============================================

/**
 * 檢查使用者訊息是否匹配任何已啟用的技能。
 *
 * 匹配優先級：
 * 1. keyword — 訊息完全包含觸發關鍵字
 * 2. pattern — 訊息符合正則表達式
 * 3. always  — 永遠匹配（最低優先級）
 *
 * manual 和 cron 類型不由訊息觸發，會被跳過。
 */
export function findMatchingSkill(
  text: string,
  skills: Skill[]
): Skill | null {
  const enabledSkills = skills.filter((s) => s.enabled === 1);
  if (enabledSkills.length === 0) return null;

  for (const skill of enabledSkills) {
    if (skill.trigger_type === 'keyword' && skill.trigger_value) {
      if (text.includes(skill.trigger_value)) {
        return skill;
      }
    }
  }

  for (const skill of enabledSkills) {
    if (skill.trigger_type === 'pattern' && skill.trigger_value) {
      try {
        const regex = new RegExp(skill.trigger_value, 'i');
        if (regex.test(text)) {
          return skill;
        }
      } catch {
        console.warn(
          `[skill-executor] 技能「${skill.name}」的正則表達式無效: ${skill.trigger_value}`
        );
      }
    }
  }

  for (const skill of enabledSkills) {
    if (skill.trigger_type === 'always') {
      return skill;
    }
  }

  return null;
}

// ============================================
// 技能執行（含 Tool Calling Loop）
// ============================================

/**
 * 執行匹配到的技能。
 *
 * Agent Skills 流程：
 * 1. 載入使用者記憶
 * 2. 解析技能的 api_config（僅連線資訊：base_url + auth）
 * 3. 提供通用工具（api_call + set_credentials）
 * 4. AI 讀取技能 prompt（SKILL.md 內容），自行決定呼叫哪個 API
 * 5. Tool Calling Loop：AI 用 api_call(method, path, body) 呼叫 API
 * 6. 回傳最終回覆
 */
export async function executeSkill(
  skill: Skill,
  userId: number,
  userMessage: string
): Promise<string> {
  try {
    const memory = getUserMemory(userId);
    const apiConfig = parseApiConfig(skill.api_config);

    // 建構工具列表
    const toolDefs: ToolDefinition[] = [];
    let credentialService: string | undefined;

    if (apiConfig) {
      // 檢查是否已有 credentials
      credentialService = apiConfig.auth.credentials_service || 'api';
      const creds = getUserCredentials(userId, credentialService);
      const needsCredentialTool = !creds && apiConfig.auth.type !== 'none';

      const genericTools = buildGenericTools(apiConfig, needsCredentialTool);
      toolDefs.push(...genericTools);

      console.log(
        `[skill-executor] 技能「${skill.name}」提供 ${genericTools.length} 個通用工具 (base_url=${apiConfig.base_url})`
      );
    }

    const hasTools = toolDefs.length > 0;
    const systemPrompt = buildSkillSystemPrompt(skill, memory, hasTools, credentialService);
    const messages: ChatMessage[] = [{ role: 'user', content: userMessage }];

    // prompt-only 技能靠 LLM 文字生成能力，需要較好的模型；有工具的技能用便宜模型即可
    const complexity = hasTools ? 'simple' : 'complex';
    // prompt-only 技能需要較多輸出空間（如產生報告，中文每字約 2-3 tokens），有工具的技能 1024 已足夠
    const maxTokens = hasTools ? 1024 : 4096;

    // 第一次呼叫 chat — 有工具時強制使用，防止 AI 造假資料
    let response = await chat({
      messages,
      systemPrompt,
      complexity,
      maxTokens,
      ...(hasTools ? { tools: toolDefs, toolChoice: 'any' } : {}),
    });

    // prompt-only 技能：若 LLM 回傳空內容，重試一次
    if (!hasTools && !response.content?.trim()) {
      console.warn(`[skill-executor] 技能「${skill.name}」首次回傳空內容 (provider=${response.provider}, model=${response.model})，重試中...`);
      response = await chat({
        messages,
        systemPrompt,
        complexity,
        maxTokens,
      });
    }

    // Tool Calling Loop
    let iteration = 0;
    while (response.toolCalls.length > 0 && iteration < MAX_TOOL_ITERATIONS) {
      iteration++;
      console.log(
        `[skill-executor] Tool calling loop 第 ${iteration} 輪，${response.toolCalls.length} 個工具呼叫`
      );

      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      });

      for (const tc of response.toolCalls) {
        console.log(`[skill-executor] 執行工具: ${tc.name}(${JSON.stringify(tc.input).substring(0, 200)})`);

        let result: string;

        if (tc.name === 'api_call' && apiConfig) {
          // 通用 API 呼叫：AI 指定 method + path + body
          const method = (tc.input.method as string) || 'GET';
          const path = tc.input.path as string;
          const body = tc.input.body as Record<string, unknown> | undefined;
          result = await executeApiCall(apiConfig, method, path, body, userId);
        } else if (tc.name.startsWith('set_') && tc.name.endsWith('_credentials') && credentialService) {
          // 帳密設定工具
          const credExecutor = createCredentialExecutor(credentialService);
          result = await credExecutor(tc.input, userId);
        } else {
          result = JSON.stringify({ error: true, message: `未知工具: ${tc.name}` });
        }

        messages.push({
          role: 'tool',
          content: result,
          toolCallId: tc.id,
        });
      }

      response = await chat({
        messages,
        systemPrompt,
        complexity,
        maxTokens,
        ...(hasTools ? { tools: toolDefs } : {}),
      });
    }

    if (iteration >= MAX_TOOL_ITERATIONS && response.toolCalls.length > 0) {
      console.warn(
        `[skill-executor] Tool calling loop 達到上限 ${MAX_TOOL_ITERATIONS} 輪，強制結束`
      );
    }

    return response.content || '技能執行完成，但沒有產生回應。';
  } catch (error) {
    console.error(
      `[skill-executor] 執行技能「${skill.name}」時發生錯誤:`,
      error
    );
    return `執行技能「${skill.name}」時發生錯誤，請稍後再試。`;
  }
}

// ============================================
// 內部工具函式
// ============================================

/**
 * 組合技能的系統 prompt。
 * 技能的 prompt 欄位包含完整的 SKILL.md 內容（API 文件），
 * AI 自行閱讀並決定呼叫哪個端點。
 */
function buildSkillSystemPrompt(
  skill: Skill,
  memory: string,
  hasTools: boolean,
  credentialService?: string
): string {
  const parts: string[] = [];

  parts.push(`你正在執行技能「${skill.name}」。`);
  parts.push('');
  parts.push('## 技能指令');
  parts.push(skill.prompt);

  if (memory && memory.trim()) {
    parts.push('');
    parts.push('## 使用者記憶');
    parts.push(memory);
  }

  parts.push('');
  parts.push('## 注意事項');
  parts.push('- 使用繁體中文回覆');
  parts.push('- 回覆簡潔扼要，適合 LINE 對話的長度');
  parts.push('- 不要提及你正在執行技能，自然地回應使用者');

  // 核心防造假規則 — 無論有無工具都必須遵守
  parts.push('');
  parts.push('## 重要規則（必須嚴格遵守）');
  parts.push('- 絕對不可以編造、虛構或猜測任何數據、數字、名稱、狀態等事實性資訊');
  parts.push('- 如果你無法取得真實資料，必須誠實告知使用者「目前無法取得資料」，不要用假資料充數');

  if (hasTools) {
    parts.push('- 你有一個 api_call 工具，可以呼叫上述技能指令中描述的任何 API 端點');
    parts.push('- 使用 api_call 時，根據技能指令中的 API 文件指定正確的 method、path 和 body');
    parts.push('- 必須使用 api_call 工具呼叫真實 API 取得數據');
    parts.push('- 如果 API 回傳錯誤，如實告知使用者錯誤內容，不要試圖猜測或編造替代資料');
    if (credentialService) {
      parts.push(`- 如果用戶尚未設定帳密，使用 set_${credentialService}_credentials 工具引導用戶提供帳號密碼`);
    }
  } else {
    // 無工具的技能 — 明確告知 AI 它沒有 API 存取能力
    parts.push('- 你目前沒有任何工具可以呼叫外部 API 或取得即時資料');
    parts.push('- 如果使用者詢問需要即時數據的問題（如查詢、搜尋），請告知他們此技能尚未連接 API，無法提供即時資料');
    parts.push('- 你只能根據技能指令中的知識回答，不要假裝有查詢結果');
  }

  return parts.join('\n');
}
