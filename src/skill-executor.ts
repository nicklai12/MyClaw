// ============================================
// 技能觸發與執行（Agent Skills 架構）
// ============================================
// AI 讀取技能的 prompt（SKILL.md 內容），自行決定呼叫哪個 API。
// 提供通用 api_call 工具，AI 指定 method + path + body，
// http-executor 自動處理 base_url 拼接和認證。

import { chat } from './llm';
import { getUserMemory } from './memory';
import { getUserCredentials } from './db';
import { buildGenericTools, buildBuiltinTools, parseApiConfig } from './dynamic-tool-builder';
import { executeApiCall, createCredentialExecutor } from './http-executor';
import { getMcpToolsForServers, isMcpToolCall, callMcpTool } from './mcp-client';
import { isBuiltinToolCall, executeBuiltinTool } from './builtin-executor';
import type { Skill, ChatMessage, ToolDefinition } from './config';

// ============================================
// 常數
// ============================================

const MAX_TOOL_ITERATIONS = 8;

// ============================================
// 觸發偵測
// ============================================

/**
 * 檢查使用者訊息是否匹配任何已啟用的技能（回傳第一個）。
 * 供 scheduler 等只需單一技能的場景使用。
 */
export function findMatchingSkill(
  text: string,
  skills: Skill[]
): Skill | null {
  const matched = findMatchingSkills(text, skills);
  return matched.length > 0 ? matched[0] : null;
}

/**
 * 檢查使用者訊息匹配的所有已啟用技能（支援 chaining）。
 *
 * 收集規則：
 * 1. keyword — 收集所有關鍵字匹配的技能
 * 2. pattern — 收集所有正則匹配的技能
 * 3. always  — 僅在無其他匹配時才加入（最低優先級）
 *
 * manual 和 cron 類型不由訊息觸發，會被跳過。
 */
export function findMatchingSkills(
  text: string,
  skills: Skill[]
): Skill[] {
  const enabledSkills = skills.filter((s) => s.enabled === 1);
  if (enabledSkills.length === 0) return [];

  const matched: Skill[] = [];
  const matchedIds = new Set<number>();

  // keyword matches — 收集全部
  // 規範：所有 keyword trigger_value 必須以 / 開頭，例如 /搜尋、/時間
  for (const skill of enabledSkills) {
    if (skill.trigger_type === 'keyword' && skill.trigger_value) {
      const trigger = skill.trigger_value;
      // 必須以 / 開頭才視為有效觸發詞
      if (trigger.startsWith('/') && text.trim().startsWith(trigger)) {
        matched.push(skill);
        matchedIds.add(skill.id);
      }
    }
  }

  // pattern matches — 收集全部
  for (const skill of enabledSkills) {
    if (skill.trigger_type === 'pattern' && skill.trigger_value) {
      try {
        const regex = new RegExp(skill.trigger_value, 'i');
        if (regex.test(text) && !matchedIds.has(skill.id)) {
          matched.push(skill);
          matchedIds.add(skill.id);
        }
      } catch {
        console.warn(
          `[skill-executor] 技能「${skill.name}」的正則表達式無效: ${skill.trigger_value}`
        );
      }
    }
  }

  // always — 僅在無其他匹配時
  if (matched.length === 0) {
    for (const skill of enabledSkills) {
      if (skill.trigger_type === 'always') {
        matched.push(skill);
        break;
      }
    }
  }

  return matched;
}

// ============================================
// Skill Chaining（Sequential Pipeline）
// ============================================

/** 前置技能的執行結果 */
interface SkillResult {
  skillName: string;
  result: string;
}

/**
 * 判斷技能是否有工具（API 或 MCP）
 */
function skillHasTools(skill: Skill): boolean {
  const apiConfig = parseApiConfig(skill.api_config);
  if (!apiConfig) return false;
  if (apiConfig.base_url) return true;
  if (apiConfig.mcp_servers && apiConfig.mcp_servers.length > 0) return true;
  if (apiConfig.builtin_tools && apiConfig.builtin_tools.length > 0) return true;
  return false;
}

/**
 * 排序技能的執行順序：有工具的先跑（取得資料），prompt-only 後跑（轉換資料）
 */
function sortSkillsForChaining(skills: Skill[]): Skill[] {
  return [...skills].sort((a, b) => {
    const aTools = skillHasTools(a);
    const bTools = skillHasTools(b);
    if (aTools && !bTools) return -1;
    if (!aTools && bTools) return 1;
    return 0;
  });
}

/**
 * 執行技能鏈（Sequential Pipeline）。
 *
 * 流程：
 * 1. 排序：有工具的技能先跑（取得資料），prompt-only 技能後跑（轉換/加工）
 * 2. 依序執行：前一個技能的輸出注入為下一個技能的 context
 * 3. 回傳最後一個技能的輸出
 *
 * 若只匹配到一個技能，等同直接 executeSkill。
 */
export async function executeSkillChain(
  skills: Skill[],
  userId: number,
  userMessage: string
): Promise<string> {
  if (skills.length === 0) return '';
  if (skills.length === 1) return executeSkill(skills[0], userId, userMessage);

  const sorted = sortSkillsForChaining(skills);
  console.log(
    `[skill-executor] Skill chaining: ${sorted.map((s) => `「${s.name}」`).join(' → ')}`
  );

  const previousResults: SkillResult[] = [];

  for (const skill of sorted) {
    const result = await executeSkill(skill, userId, userMessage, previousResults);
    previousResults.push({ skillName: skill.name, result });
  }

  return previousResults[previousResults.length - 1].result;
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
 *
 * @param previousResults — chaining 時前置技能的結果，會注入 system prompt
 */
export async function executeSkill(
  skill: Skill,
  userId: number,
  userMessage: string,
  previousResults?: SkillResult[]
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

    // 內建工具：技能透過 api_config.builtin_tools 聲明使用哪些內建工具
    if (apiConfig?.builtin_tools && apiConfig.builtin_tools.length > 0) {
      const builtinTools = buildBuiltinTools(apiConfig.builtin_tools);
      if (builtinTools.length > 0) {
        toolDefs.push(...builtinTools);
        console.log(
          `[skill-executor] 技能「${skill.name}」加入 ${builtinTools.length} 個內建工具 (${apiConfig.builtin_tools.join(', ')})`
        );
      }
    }

    // MCP 工具：技能透過 api_config.mcp_servers 聲明使用哪些 MCP server
    if (apiConfig?.mcp_servers && apiConfig.mcp_servers.length > 0) {
      let mcpTools = getMcpToolsForServers(apiConfig.mcp_servers);
      // 白名單過濾：技能可指定只使用特定 MCP 工具，減少 LLM 混淆
      if (apiConfig.mcp_tool_filter && apiConfig.mcp_tool_filter.length > 0) {
        const filter = new Set(apiConfig.mcp_tool_filter);
        mcpTools = mcpTools.filter(t => {
          // 工具名稱格式：mcp__{server}__{tool}，比對 tool 部分
          const toolName = t.name.split('__').slice(2).join('__');
          return filter.has(toolName) || filter.has(t.name);
        });
      }
      if (mcpTools.length > 0) {
        toolDefs.push(...mcpTools);
        console.log(
          `[skill-executor] 技能「${skill.name}」加入 ${mcpTools.length} 個 MCP 工具 (servers: ${apiConfig.mcp_servers.join(', ')})`
        );
      }
    }

    const hasTools = toolDefs.length > 0;
    const systemPrompt = buildSkillSystemPrompt(skill, memory, hasTools, credentialService, previousResults);
    const messages: ChatMessage[] = [{ role: 'user', content: userMessage }];

    // prompt-only 技能靠 LLM 文字生成能力，需要較好的模型；有工具的技能用便宜模型即可
    const complexity = hasTools ? 'simple' : 'complex';
    // 統一 4096：Telegram 單則上限 4096 字元，LLM 4096 tokens ≈ 1500-2000 中文字，不會超出
    const maxTokens = 4096;

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
        } else if (isBuiltinToolCall(tc.name)) {
          // 內建工具呼叫
          result = await executeBuiltinTool(tc.name, tc.input, userId);
        } else if (isMcpToolCall(tc)) {
          // MCP 工具呼叫：路由到對應的 MCP server
          result = await callMcpTool(tc.name, tc.input);
        } else {
          result = JSON.stringify({ error: true, message: `未知工具: ${tc.name}` });
        }

        messages.push({
          role: 'tool',
          content: result,
          toolCallId: tc.id,
        });
      }

      // Tool result 之後的呼叫：不提供 tools，讓 AI 直接回答
      // 這避免 Groq 等 provider 在 tool calling loop 中出現「Failed to call a function」錯誤
      response = await chat({
        messages,
        systemPrompt,
        complexity,
        maxTokens,
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
  credentialService?: string,
  previousResults?: SkillResult[]
): string {
  const parts: string[] = [];

  parts.push(`你正在執行技能「${skill.name}」。`);
  parts.push('');
  parts.push('## 技能指令');
  parts.push(skill.prompt);

  // Chaining：注入前置技能的結果
  if (previousResults && previousResults.length > 0) {
    parts.push('');
    parts.push('## 前置技能已取得的資料');
    parts.push('以下是之前執行的技能已取得的真實資料，請基於這些資料完成你的任務。');
    parts.push('注意：前置技能的輸出可能包含工具呼叫過程的描述文字（例如「Attempt to...」「Let me...」等），請忽略這些過程描述，只使用實質內容。你的回覆中也不要包含這些過程描述。');
    for (const prev of previousResults) {
      parts.push('');
      parts.push(`### 技能「${prev.skillName}」的輸出：`);
      parts.push(prev.result);
    }
  }

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

  const hasPreviousData = previousResults && previousResults.length > 0;

  if (hasTools) {
    parts.push('- 必須使用提供的工具取得真實數據，不可自行編造');
    parts.push('- 如果工具回傳錯誤，如實告知使用者錯誤內容，不要試圖猜測或編造替代資料');
    if (credentialService) {
      parts.push(`- 如果用戶尚未設定帳密，使用 set_${credentialService}_credentials 工具引導用戶提供帳號密碼`);
    }
  } else if (hasPreviousData) {
    // Chaining：前置技能已取得資料，此技能負責加工/轉換
    parts.push('- 上方「前置技能已取得的資料」是真實資料，請直接基於這些資料完成你的任務');
    parts.push('- 不需要額外工具，專注在資料的分析、整理和呈現');
  } else {
    // 無工具且無前置資料 — 檢查是否為時間相關技能
    const isTimeRelated = /時間|報時|幾點|現在.*[幾多].*[點時分]|clock|time/i.test(skill.name + ' ' + skill.prompt);

    if (isTimeRelated) {
      // 時間相關技能：注入當前時間（台北時間 UTC+8）
      const now = new Date();
      // 正確計算台北時間（UTC+8）
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const taipeiTime = new Date(utc + (3600000 * 8));
      const timeString = taipeiTime.toISOString().replace('T', ' ').substring(0, 19);
      parts.push('## 當前系統時間（台北時間 UTC+8，供你參考）');
      parts.push(`系統當前時間: ${timeString}`);
      parts.push('你可以使用這個時間資訊來回答使用者的問題。請注意這是台北時間（UTC+8）。');
    } else {
      // 其他無工具技能
      parts.push('- 你目前沒有任何工具可以呼叫外部 API 或取得即時資料');
      parts.push('- 如果使用者詢問需要即時數據的問題（如查詢、搜尋），請告知他們此技能尚未連接 API，無法提供即時資料');
      parts.push('- 你只能根據技能指令中的知識回答，不要假裝有查詢結果');
    }
  }

  return parts.join('\n');
}
