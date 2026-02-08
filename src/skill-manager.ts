// ============================================
// 技能建立與管理
// ============================================

import { chat } from './llm';
import { createSkill, getUserSkills, toggleSkill, deleteSkill } from './db';
import type { SkillCreateRequest, Skill, ToolDefinition } from './config';

// ============================================
// Tool Calling Schema — 讓 AI 結構化輸出技能配置
// ============================================

const CREATE_SKILL_TOOL: ToolDefinition = {
  name: 'create_skill',
  description:
    '根據使用者的自然語言描述，建立一個新的技能配置。只有當使用者明確表達想要建立新技能、設定提醒、自動化任務時才使用此工具。',
  input_schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '技能名稱，簡短的繁體中文名稱，例如「每日天氣提醒」',
      },
      description: {
        type: 'string',
        description: '技能功能描述，一句話說明這個技能做什麼',
      },
      trigger: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['keyword', 'pattern', 'cron', 'manual', 'always'],
            description:
              '觸發類型：keyword=關鍵字觸發、pattern=正則匹配、cron=定時執行、manual=手動觸發、always=每次對話都執行',
          },
          value: {
            type: 'string',
            description:
              '觸發值：keyword 時為關鍵字、pattern 時為正則表達式、cron 時為 cron 表達式、manual/always 可為空字串',
          },
        },
        required: ['type', 'value'],
      },
      prompt: {
        type: 'string',
        description:
          '給 AI 的執行指令，描述這個技能被觸發時要做什麼。使用繁體中文撰寫，清晰具體。',
      },
      tools: {
        type: 'array',
        items: { type: 'string' },
        description:
          '技能可使用的內建工具列表，可選值：web_search, memory_read, memory_write, get_weather, get_time',
      },
    },
    required: ['name', 'description', 'trigger', 'prompt'],
  },
};

const SKILL_PARSE_SYSTEM_PROMPT = `你是 MyClaw LINE AI 助理的技能建立助手。

使用者會用自然語言描述他們想要的功能，你需要判斷這是否是一個技能建立請求。

如果使用者的訊息是在描述一個想要自動化的任務、定時提醒、或特定觸發條件下的回應行為，
請使用 create_skill 工具來建立技能配置。

觸發類型判斷規則：
- 如果提到「每天」「每週」「每小時」等時間週期 → cron
- 如果提到「當我說...」「當我傳...」等特定關鍵字 → keyword
- 如果需要匹配 URL、數字、特定格式 → pattern
- 如果是通用對話風格設定（如「用台語回我」）→ always
- 如果沒有明確觸發條件 → manual

cron 表達式範例：
- 每天早上 8 點：0 8 * * *
- 每天下午 6 點：0 18 * * *
- 每週一早上 9 點：0 9 * * 1
- 每小時：0 * * * *

如果使用者的訊息不像是在建立技能（例如閒聊、問問題、一般對話），請不要使用任何工具，直接回覆說明即可。`;

// ============================================
// 技能管理意圖偵測關鍵字
// ============================================

const MANAGEMENT_KEYWORDS = [
  '我的技能',
  '技能列表',
  '列出技能',
  '查看技能',
  '所有技能',
  '停用技能',
  '停用',
  '啟用技能',
  '啟用',
  '刪除技能',
  '移除技能',
  '管理技能',
];

// ============================================
// 公開 API
// ============================================

/**
 * 解析使用者的自然語言，透過 LLM Tool Calling 生成技能配置。
 * 如果使用者文字不像是在建立技能，回傳 null。
 */
export async function parseSkillFromText(
  userText: string
): Promise<SkillCreateRequest | null> {
  try {
    const response = await chat({
      messages: [{ role: 'user', content: userText }],
      systemPrompt: SKILL_PARSE_SYSTEM_PROMPT,
      tools: [CREATE_SKILL_TOOL],
      complexity: 'moderate',
      maxTokens: 1024,
    });

    // 如果 AI 沒有呼叫 create_skill 工具，表示不是技能建立意圖
    if (!response.toolCalls || response.toolCalls.length === 0) {
      return null;
    }

    const toolCall = response.toolCalls.find(
      (tc) => tc.name === 'create_skill'
    );
    if (!toolCall) {
      return null;
    }

    const input = toolCall.input as {
      name: string;
      description: string;
      trigger: { type: string; value: string };
      prompt: string;
      tools?: string[];
    };

    // 驗證必要欄位
    if (!input.name || !input.trigger?.type || !input.prompt) {
      return null;
    }

    const request: SkillCreateRequest = {
      name: input.name,
      description: input.description || '',
      trigger: {
        type: input.trigger.type as SkillCreateRequest['trigger']['type'],
        value: input.trigger.value || '',
      },
      prompt: input.prompt,
      tools: input.tools,
    };

    return request;
  } catch (error) {
    console.error('[skill-manager] parseSkillFromText 錯誤:', error);
    return null;
  }
}

/**
 * 判斷使用者訊息是否為技能管理意圖（列出、啟用、停用、刪除）。
 */
export function isSkillManagementIntent(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return MANAGEMENT_KEYWORDS.some((kw) => normalized.includes(kw));
}

/**
 * 處理技能管理指令，根據意圖呼叫 db 函式並回傳結果訊息。
 */
export async function handleSkillManagement(
  userId: number,
  text: string
): Promise<string> {
  const normalized = text.trim();

  try {
    // 列出技能
    if (
      normalized.includes('我的技能') ||
      normalized.includes('技能列表') ||
      normalized.includes('列出技能') ||
      normalized.includes('查看技能') ||
      normalized.includes('所有技能') ||
      normalized.includes('管理技能')
    ) {
      const skills = await getUserSkills(userId);
      if (skills.length === 0) {
        return '你目前還沒有任何技能。\n\n你可以用自然語言描述想要的功能來建立技能，例如：\n- 「每天早上 8 點提醒我喝水」\n- 「當我說翻譯時，幫我翻譯成英文」\n- 「幫我摘要我傳的連結」';
      }
      return formatSkillList(skills);
    }

    // 停用技能
    if (normalized.includes('停用')) {
      const skillName = extractSkillName(normalized, '停用');
      if (!skillName) {
        return '請指定要停用的技能名稱，例如：「停用 每日天氣提醒」';
      }
      const skills = await getUserSkills(userId);
      const target = findSkillByName(skills, skillName);
      if (!target) {
        return `找不到名為「${skillName}」的技能。輸入「我的技能」查看所有技能。`;
      }
      if (target.enabled === 0) {
        return `「${target.name}」已經是停用狀態。`;
      }
      await toggleSkill(target.id, false);
      return `已停用技能「${target.name}」。你可以隨時說「啟用 ${target.name}」來重新啟用。`;
    }

    // 啟用技能
    if (normalized.includes('啟用')) {
      const skillName = extractSkillName(normalized, '啟用');
      if (!skillName) {
        return '請指定要啟用的技能名稱，例如：「啟用 每日天氣提醒」';
      }
      const skills = await getUserSkills(userId);
      const target = findSkillByName(skills, skillName);
      if (!target) {
        return `找不到名為「${skillName}」的技能。輸入「我的技能」查看所有技能。`;
      }
      if (target.enabled === 1) {
        return `「${target.name}」已經是啟用狀態。`;
      }
      await toggleSkill(target.id, true);
      return `已啟用技能「${target.name}」。`;
    }

    // 刪除技能
    if (normalized.includes('刪除技能') || normalized.includes('移除技能')) {
      const skillName =
        extractSkillName(normalized, '刪除技能') ||
        extractSkillName(normalized, '移除技能');
      if (!skillName) {
        return '請指定要刪除的技能名稱，例如：「刪除技能 每日天氣提醒」';
      }
      const skills = await getUserSkills(userId);
      const target = findSkillByName(skills, skillName);
      if (!target) {
        return `找不到名為「${skillName}」的技能。輸入「我的技能」查看所有技能。`;
      }
      await deleteSkill(target.id);
      return `已刪除技能「${target.name}」。`;
    }

    return '我不確定你想做什麼。你可以說：\n- 「我的技能」查看技能列表\n- 「停用 [技能名稱]」停用技能\n- 「啟用 [技能名稱]」啟用技能\n- 「刪除技能 [技能名稱]」刪除技能';
  } catch (error) {
    console.error('[skill-manager] handleSkillManagement 錯誤:', error);
    return '處理技能管理指令時發生錯誤，請稍後再試。';
  }
}

/**
 * 將技能列表格式化為使用者可讀的文字。
 */
export function formatSkillList(skills: Skill[]): string {
  if (skills.length === 0) {
    return '目前沒有任何技能。';
  }

  const lines = [`你目前有 ${skills.length} 個技能：`, ''];

  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    const statusIcon = skill.enabled ? '[ON]' : '[OFF]';
    const triggerDesc = formatTriggerDescription(
      skill.trigger_type,
      skill.trigger_value
    );

    lines.push(`${i + 1}. ${statusIcon} ${skill.name}`);
    lines.push(`   ${skill.description}`);
    lines.push(`   觸發：${triggerDesc}`);
    if (skill.source_type !== 'user_created' && skill.source_url) {
      lines.push(`   來源：${skill.source_type}`);
    }
    lines.push('');
  }

  lines.push('你可以：');
  lines.push('- 「停用 [技能名稱]」停用技能');
  lines.push('- 「啟用 [技能名稱]」啟用技能');
  lines.push('- 「刪除技能 [技能名稱]」刪除技能');

  return lines.join('\n');
}

// ============================================
// 內部工具函式
// ============================================

/**
 * 從使用者文字中提取技能名稱。
 * 例如「停用 每日天氣提醒」→ 「每日天氣提醒」
 */
function extractSkillName(text: string, keyword: string): string | null {
  const idx = text.indexOf(keyword);
  if (idx === -1) return null;

  const afterKeyword = text.substring(idx + keyword.length).trim();
  if (!afterKeyword) return null;

  return afterKeyword;
}

/**
 * 從技能列表中根據名稱模糊搜尋技能。
 */
function findSkillByName(skills: Skill[], name: string): Skill | undefined {
  // 完全匹配
  const exact = skills.find((s) => s.name === name);
  if (exact) return exact;

  // 包含匹配
  const partial = skills.find(
    (s) => s.name.includes(name) || name.includes(s.name)
  );
  return partial;
}

/**
 * 將觸發類型和觸發值格式化為可讀描述。
 */
function formatTriggerDescription(
  triggerType: string,
  triggerValue: string
): string {
  switch (triggerType) {
    case 'keyword':
      return `當訊息包含「${triggerValue}」時觸發`;
    case 'pattern':
      return `當訊息符合模式 ${triggerValue} 時觸發`;
    case 'cron':
      return `定時執行：${formatCronExpression(triggerValue)}`;
    case 'manual':
      return '手動觸發';
    case 'always':
      return '每次對話都會執行';
    default:
      return triggerValue || '未知觸發方式';
  }
}

/**
 * 將 cron 表達式格式化為人類可讀的中文描述。
 */
function formatCronExpression(cron: string): string {
  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // 每天特定時間
  if (
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*' &&
    hour !== '*'
  ) {
    return `每天 ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  // 每週特定日的特定時間
  if (dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    const dayIdx = parseInt(dayOfWeek, 10);
    const dayName =
      dayIdx >= 0 && dayIdx <= 6 ? `週${dayNames[dayIdx]}` : `週${dayOfWeek}`;
    return `每${dayName} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  // 每小時
  if (hour === '*' && dayOfMonth === '*' && month === '*') {
    return `每小時的第 ${minute} 分鐘`;
  }

  return cron;
}
