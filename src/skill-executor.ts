// ============================================
// 技能觸發與執行
// ============================================

import { chat } from './llm';
import { getUserMemory } from './memory';
import type { Skill } from './config';

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

  // 優先級 1：keyword 完全包含匹配
  for (const skill of enabledSkills) {
    if (skill.trigger_type === 'keyword' && skill.trigger_value) {
      if (text.includes(skill.trigger_value)) {
        return skill;
      }
    }
  }

  // 優先級 2：pattern 正則匹配
  for (const skill of enabledSkills) {
    if (skill.trigger_type === 'pattern' && skill.trigger_value) {
      try {
        const regex = new RegExp(skill.trigger_value, 'i');
        if (regex.test(text)) {
          return skill;
        }
      } catch {
        // 正則表達式無效，跳過此技能
        console.warn(
          `[skill-executor] 技能「${skill.name}」的正則表達式無效: ${skill.trigger_value}`
        );
      }
    }
  }

  // 優先級 3：always 永遠匹配
  for (const skill of enabledSkills) {
    if (skill.trigger_type === 'always') {
      return skill;
    }
  }

  // manual 和 cron 不由訊息觸發
  return null;
}

// ============================================
// 技能執行
// ============================================

/**
 * 執行匹配到的技能。
 *
 * 流程：
 * 1. 載入使用者記憶（memory_md）
 * 2. 組合系統 prompt = 技能 prompt + 使用者記憶
 * 3. 呼叫 chat() 取得 AI 回應
 * 4. 回傳回應文字
 */
export async function executeSkill(
  skill: Skill,
  userId: number,
  userMessage: string
): Promise<string> {
  try {
    // 取得使用者記憶作為上下文
    const memory = await getUserMemory(userId);

    // 組合系統 prompt
    const systemPrompt = buildSkillSystemPrompt(skill, memory);

    // 解析技能可用的工具
    const skillTools = parseSkillTools(skill.tools);

    const response = await chat({
      messages: [{ role: 'user', content: userMessage }],
      systemPrompt,
      complexity: 'simple',
      maxTokens: 1024,
      ...(skillTools.length > 0 ? { tools: skillTools } : {}),
    });

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
 * 組合技能的系統 prompt，包含技能指令和使用者記憶。
 */
function buildSkillSystemPrompt(skill: Skill, memory: string): string {
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

  return parts.join('\n');
}

/**
 * 解析技能的 tools JSON 字串為 ToolDefinition 陣列。
 * 目前回傳空陣列，因為內建工具系統尚未實作。
 * 未來可以根據 tools 欄位載入對應的 ToolDefinition。
 */
function parseSkillTools(
  toolsJson: string
): { name: string; description: string; input_schema: Record<string, unknown> }[] {
  if (!toolsJson) return [];

  try {
    const toolNames: string[] = JSON.parse(toolsJson);
    if (!Array.isArray(toolNames) || toolNames.length === 0) return [];

    // 目前內建工具系統尚未實作，回傳空陣列
    // 未來可以在此處根據 toolNames 映射到實際的 ToolDefinition
    // 例如：toolNames.map(name => BUILT_IN_TOOLS[name]).filter(Boolean)
    return [];
  } catch {
    return [];
  }
}
