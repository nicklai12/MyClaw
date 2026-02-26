// ============================================
// 技能建立與管理
// ============================================

import { chat } from './llm';
import { createSkill, getUserSkills, toggleSkill, deleteSkill, updateSkill } from './db';
import type { SkillCreateRequest, Skill } from './config';

// ============================================
// Prompt-based JSON — 不依賴 Tool Calling 的技能解析
// ============================================
// 研究發現 Kimi K2 在 Groq 上的 Tool Calling 失敗率 ~5-10%，
// 改用 prompt 指令讓 AI 直接輸出 JSON，繞過 Tool Calling 問題。
// 參見：research/15-kimi-k2-skill-execution/README.md

const SKILL_PARSE_SYSTEM_PROMPT = `你是 MyClaw LINE AI 助理的技能建立助手。

使用者會用自然語言描述他們想要的功能，你需要判斷這是否是一個技能建立請求。

## 判斷規則

如果使用者的訊息是在描述一個想要自動化的任務、定時提醒、或特定觸發條件下的回應行為，請回傳技能配置 JSON。

如果使用者的訊息不像是在建立技能（例如閒聊、問問題、一般對話），請只回覆 NOT_SKILL 這四個字，不要輸出其他任何內容。

## 技能配置 JSON 格式

當判斷為技能建立請求時，只回傳以下格式的 JSON，不要包含任何其他文字：

{"name":"技能名稱","description":"一句話功能描述","trigger_type":"keyword","trigger_value":"觸發值","prompt":"給 AI 的執行指令","api_config":null}

## 欄位說明

- name：簡短的繁體中文名稱，例如「每日天氣提醒」
- description：一句話說明這個技能做什麼
- trigger_type：觸發類型，只能是以下之一：keyword、pattern、cron、manual、always
- trigger_value：觸發值（keyword 時為關鍵字、pattern 時為正則表達式、cron 時為 cron 表達式、manual/always 為空字串）
- prompt：給 AI 的執行指令，使用繁體中文撰寫，清晰具體
- api_config：工具配置（無需工具時設為 null，需要工具時設為物件，見下方說明）

## 觸發類型判斷規則

- 提到「每天」「每週」「每小時」等時間週期 → cron
- 提到「當我說...」「當我傳...」等特定關鍵字 → keyword
- 需要匹配 URL、數字、特定格式 → pattern
- 通用對話風格設定（如「用台語回我」）→ always
- 沒有明確觸發條件 → manual

## cron 表達式範例

- 每天早上 8 點：0 8 * * *
- 每天下午 6 點：0 18 * * *
- 每週一早上 9 點：0 9 * * 1
- 每小時：0 * * * *

## api_config 工具配置規則

技能可透過 api_config 配置工具能力。以下是可用的工具類型：

### 內建工具 (builtin_tools)
- save_code, list_code, get_code — 代碼生成、儲存、列表、查看

當使用者提到「寫代碼」「生成代碼」「程式碼」「寫程式」「coding」，設定：
"api_config": {"builtin_tools": ["save_code", "list_code", "get_code"], "auth": {"type": "none"}}

### MCP 工具伺服器 (mcp_servers)
- "github" — GitHub 操作（推送代碼、建立 PR、管理 repo）
- "browser" — 瀏覽器自動化（開網頁、截圖、填表單）
- "tavily" — 網路搜尋與網頁擷取

當使用者提到「推送 GitHub」「push 到 GitHub」「GitHub repo」，加入 "mcp_servers": ["github"]
當使用者提到「瀏覽器」「開網頁」「截圖」，加入 "mcp_servers": ["browser"]
當使用者提到「搜尋」「擷取網頁」，加入 "mcp_servers": ["tavily"]

### 組合範例

代碼生成 + GitHub 推送：
"api_config": {"builtin_tools": ["save_code", "list_code", "get_code"], "mcp_servers": ["github"], "auth": {"type": "none"}}

純搜尋技能：
"api_config": {"mcp_servers": ["tavily"], "auth": {"type": "none"}}

不需要工具的技能（如翻譯、對話風格）：
"api_config": null

## 重要

- 只回傳純 JSON 或 NOT_SKILL，不要加 \`\`\` 標記，不要加說明文字
- JSON 必須是單行，不要換行
- api_config 不需要工具時必須設為 null，不要省略這個欄位`;

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
  '更新技能',
  '修改技能',
  '管理技能',
];

// ============================================
// 公開 API
// ============================================

/**
 * 解析使用者的自然語言，透過 Prompt-based JSON 生成技能配置。
 * 不依賴 Tool Calling，改用 prompt 指令讓 AI 直接輸出 JSON。
 * 如果使用者文字不像是在建立技能，回傳 null。
 */
export async function parseSkillFromText(
  userText: string
): Promise<SkillCreateRequest | null> {
  try {
    const response = await chat({
      messages: [{ role: 'user', content: userText }],
      systemPrompt: SKILL_PARSE_SYSTEM_PROMPT,
      complexity: 'moderate',
      maxTokens: 1024,
    });

    const content = (response.content || '').trim();

    // AI 判斷不是技能建立意圖
    if (!content || content === 'NOT_SKILL' || content.startsWith('NOT_SKILL')) {
      return null;
    }

    // 從回應中提取 JSON
    const json = extractJsonFromText(content);
    if (!json) {
      console.warn(
        `[skill-manager] 無法從 AI 回應中提取 JSON: ${content.substring(0, 200)}`
      );
      return null;
    }

    // 解析 JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json);
    } catch {
      console.warn(
        `[skill-manager] JSON 解析失敗: ${json.substring(0, 200)}`
      );
      return null;
    }

    // 驗證必要欄位
    const name = typeof parsed.name === 'string' ? parsed.name : '';
    const triggerType = typeof parsed.trigger_type === 'string' ? parsed.trigger_type : '';
    const prompt = typeof parsed.prompt === 'string' ? parsed.prompt : '';

    if (!name || !triggerType || !prompt) {
      console.warn(
        `[skill-manager] JSON 缺少必要欄位: name=${!!name}, trigger_type=${!!triggerType}, prompt=${!!prompt}`
      );
      return null;
    }

    // 驗證 trigger_type 是合法值
    const validTriggerTypes = ['keyword', 'pattern', 'cron', 'manual', 'always'];
    if (!validTriggerTypes.includes(triggerType)) {
      console.warn(
        `[skill-manager] 無效的 trigger_type: ${triggerType}`
      );
      return null;
    }

    const request: SkillCreateRequest = {
      name,
      description: typeof parsed.description === 'string' ? parsed.description : '',
      trigger: {
        type: triggerType as SkillCreateRequest['trigger']['type'],
        value: typeof parsed.trigger_value === 'string' ? parsed.trigger_value : '',
      },
      prompt,
      tools: Array.isArray(parsed.tools) ? parsed.tools as string[] : undefined,
      api_config: parsed.api_config && typeof parsed.api_config === 'object'
        ? parsed.api_config as SkillCreateRequest['api_config']
        : undefined,
    };

    return request;
  } catch (error) {
    console.error('[skill-manager] parseSkillFromText 錯誤:', error);
    return null;
  }
}

/**
 * 從 AI 回應文字中提取 JSON 字串。
 * 處理常見的格式問題：markdown code fences、前後多餘文字等。
 */
function extractJsonFromText(text: string): string | null {
  let cleaned = text.trim();

  // 移除 markdown code fences: ```json ... ``` 或 ``` ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // 嘗試找到 JSON 物件的起始和結束位置
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  } else {
    return null;
  }

  // 驗證是否為有效 JSON
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
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

    // 更新技能（修改觸發方式、描述等）
    if (normalized.includes('更新技能') || normalized.includes('修改技能')) {
      const skillName =
        extractSkillName(normalized, '更新技能') ||
        extractSkillName(normalized, '修改技能');
      if (!skillName) {
        return '請指定要更新的技能名稱和新內容，例如：「更新技能 每日天氣提醒」\n\n目前更新技能最簡單的方式是重新匯入同一個 GitHub URL，系統會自動更新。\n\n你也可以先「刪除技能 [名稱]」再重新建立。';
      }
      const skills = await getUserSkills(userId);
      const target = findSkillByName(skills, skillName);
      if (!target) {
        return `找不到名為「${skillName}」的技能。輸入「我的技能」查看所有技能。`;
      }
      // 目前支援重新匯入更新，手動更新引導用戶刪除重建
      return `技能「${target.name}」目前可透過以下方式更新：\n\n1. 重新匯入：傳送原始 GitHub URL，系統會自動更新\n2. 刪除重建：「刪除技能 ${target.name}」後重新建立`;
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

    return '我不確定你想做什麼。你可以說：\n- 「我的技能」查看技能列表\n- 「停用 [技能名稱]」停用技能\n- 「啟用 [技能名稱]」啟用技能\n- 「更新技能 [技能名稱]」更新技能\n- 「刪除技能 [技能名稱]」刪除技能';
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
