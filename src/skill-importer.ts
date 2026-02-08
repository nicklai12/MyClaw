// ============================================
// GitHub URL 匯入 + 公開技能目錄瀏覽
// ============================================

import matter from 'gray-matter';
import { chat } from './llm';
import { createSkill } from './db';
import type {
  SkillCreateRequest,
  SkillImportResult,
  ToolDefinition,
} from './config';

// ============================================
// 常數
// ============================================

/** 技能目錄 catalog.json 的 GitHub 位置（未來可改為配置） */
const SKILL_CATALOG_URL =
  'https://raw.githubusercontent.com/myclaw/skill-catalog/main/catalog.json';

/** 匯入意圖偵測的關鍵字 */
const IMPORT_KEYWORDS = [
  '安裝技能',
  '安裝這個技能',
  '匯入技能',
  '匯入這個',
  '安裝 skill',
  '安裝skill',
  'install skill',
  '加入技能',
];

/** 目錄瀏覽偵測的關鍵字 */
const CATALOG_KEYWORDS = [
  '瀏覽技能',
  '技能商店',
  '技能目錄',
  '有什麼技能',
  '推薦技能',
  '可用技能',
];

/** GitHub URL 正則 */
const GITHUB_URL_REGEX =
  /https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)(?:\/(?:tree|blob)\/([^/\s]+)\/(.+?))?(?:\s|$)/;

/** Prompt injection 危險模式 */
const DANGEROUS_PATTERNS: RegExp[] = [
  /ignore.*previous.*instructions/i,
  /forget.*system.*prompt/i,
  /你是一個.*不再是/i,
  /disregard.*above/i,
  /new instructions/i,
  /override.*system/i,
  /read.*other.*user/i,
  /access.*all.*memory/i,
  /send.*to.*external/i,
  /execute.*command/i,
  /eval\s*\(/i,
  /require\s*\(/i,
  /import\s*\(/i,
  /process\.env/i,
  /\bexec\b.*\(/i,
  /child_process/i,
];

// ============================================
// AI 格式轉換用 Tool Calling Schema
// ============================================

const CONVERT_SKILL_TOOL: ToolDefinition = {
  name: 'convert_skill',
  description:
    '將外部 Agent Skill 格式轉換為 MyClaw 技能格式，包含繁體中文名稱、觸發方式判斷、和 prompt 整理。',
  input_schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: '技能的繁體中文名稱',
      },
      description: {
        type: 'string',
        description: '技能功能的繁體中文簡述',
      },
      trigger: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['keyword', 'pattern', 'cron', 'manual', 'always'],
            description: '根據技能描述智能判斷最佳觸發方式',
          },
          value: {
            type: 'string',
            description: '觸發值',
          },
        },
        required: ['type', 'value'],
      },
      prompt: {
        type: 'string',
        description:
          '整理後的繁體中文 AI 執行指令，適配 LINE 對話情境，不包含任何程式碼',
      },
      tools: {
        type: 'array',
        items: { type: 'string' },
        description: '技能可使用的內建工具',
      },
    },
    required: ['name', 'description', 'trigger', 'prompt'],
  },
};

const CONVERT_SYSTEM_PROMPT = `你是 MyClaw LINE AI 助理的技能格式轉換助手。

你需要將外部的 Agent Skill（通常是英文的 SKILL.md 格式）轉換為 MyClaw 的技能格式。

轉換規則：
1. name：翻譯為繁體中文，簡潔的技能名稱
2. description：翻譯為繁體中文，一句話描述功能
3. trigger：根據技能描述智能判斷最佳觸發方式
   - 如果技能是回應特定關鍵字 → keyword
   - 如果技能需要偵測 URL 或特定格式 → pattern
   - 如果技能是定時執行 → cron
   - 如果技能是通用對話風格 → always
   - 其他情況 → manual
4. prompt：
   - 保留原始指令的核心功能
   - 翻譯為繁體中文
   - 適配 LINE 對話情境（簡潔、友善）
   - 不要包含任何可執行程式碼
   - 控制在合理長度內

請使用 convert_skill 工具輸出結果。`;

// ============================================
// 公開 API
// ============================================

/**
 * 判斷訊息是否包含技能安裝/匯入意圖。
 * 偵測 GitHub URL 和安裝關鍵字。
 */
export function isSkillImportIntent(
  text: string
): { isImport: boolean; url?: string } {
  const normalized = text.trim();

  // 檢查是否包含 GitHub URL
  const urlMatch = normalized.match(GITHUB_URL_REGEX);

  // 檢查是否包含安裝意圖關鍵字
  const hasImportKeyword = IMPORT_KEYWORDS.some((kw) =>
    normalized.includes(kw)
  );

  // 有 GitHub URL 且有安裝意圖
  if (urlMatch && hasImportKeyword) {
    return { isImport: true, url: urlMatch[0].trim() };
  }

  // 只有 GitHub URL（自動偵測意圖）
  if (urlMatch) {
    // 如果 URL 路徑包含 skill 相關字眼，視為匯入意圖
    const fullUrl = urlMatch[0].trim();
    if (/skill/i.test(fullUrl)) {
      return { isImport: true, url: fullUrl };
    }
  }

  return { isImport: false };
}

/**
 * 判斷訊息是否為目錄瀏覽意圖。
 */
export function isCatalogBrowseIntent(text: string): boolean {
  const normalized = text.trim();
  return CATALOG_KEYWORDS.some((kw) => normalized.includes(kw));
}

/**
 * 從 GitHub URL 匯入技能。
 *
 * 流程：
 * 1. 解析 GitHub URL
 * 2. Fetch SKILL.md 內容
 * 3. 解析 YAML frontmatter + Markdown body
 * 4. AI 轉換為 MyClaw 格式
 * 5. 安全檢查
 * 6. 回傳結果（不自動儲存，由呼叫端決定是否儲存）
 */
export async function importSkillFromURL(
  url: string,
  userId: number
): Promise<SkillImportResult> {
  try {
    // Step 1: 解析 GitHub URL
    const parsed = parseGitHubUrl(url);

    // Step 2: Fetch SKILL.md
    const skillContent = await fetchSkillContent(parsed);

    // Step 3: 解析 frontmatter + body
    const { name, description, instructions } =
      parseSkillMd(skillContent);

    // Step 4: AI 轉換為 MyClaw 格式
    const converted = await convertToMyClawFormat(
      name,
      description,
      instructions
    );

    // Step 5: 安全檢查
    const safety = validateSkillSafety(converted.prompt);

    const result: SkillImportResult = {
      skill: converted,
      source: {
        type: 'github_import',
        url,
        originalFormat: 'agent_skill_md',
      },
      warnings: safety.warnings,
    };

    return result;
  } catch (error) {
    console.error('[skill-importer] importSkillFromURL 錯誤:', error);
    const errorMessage =
      error instanceof Error ? error.message : '未知錯誤';
    throw new Error(`匯入技能失敗：${errorMessage}`);
  }
}

/**
 * 從內建目錄瀏覽可用技能。
 * 從 GitHub 讀取 catalog.json。
 */
export async function browseCatalog(): Promise<
  { id: string; name: string; description: string }[]
> {
  try {
    const response = await fetch(SKILL_CATALOG_URL);
    if (!response.ok) {
      console.warn(
        `[skill-importer] 無法讀取技能目錄: ${response.status} ${response.statusText}`
      );
      return getDefaultCatalog();
    }

    const data = (await response.json()) as {
      skills?: { id: string; name: string; description: string }[];
    };

    if (!data.skills || !Array.isArray(data.skills)) {
      return getDefaultCatalog();
    }

    return data.skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
    }));
  } catch (error) {
    console.warn('[skill-importer] 讀取技能目錄失敗，使用預設目錄:', error);
    return getDefaultCatalog();
  }
}

/**
 * 格式化目錄列表為使用者可讀的文字。
 */
export function formatCatalogList(
  catalog: { id: string; name: string; description: string }[]
): string {
  if (catalog.length === 0) {
    return '目前沒有可用的技能目錄。';
  }

  const lines = ['以下是可安裝的技能：', ''];

  for (let i = 0; i < catalog.length; i++) {
    const skill = catalog[i];
    lines.push(`${i + 1}. ${skill.name}`);
    lines.push(`   ${skill.description}`);
    lines.push('');
  }

  lines.push('輸入數字安裝對應技能，或直接貼 GitHub 連結安裝其他技能。');

  return lines.join('\n');
}

// ============================================
// 內部工具函式
// ============================================

/**
 * 解析 GitHub URL 為 owner/repo/branch/path 結構。
 *
 * 支援格式：
 * - https://github.com/owner/repo/tree/branch/path
 * - https://github.com/owner/repo/blob/branch/path/SKILL.md
 * - https://github.com/owner/repo (預設 main branch)
 */
function parseGitHubUrl(url: string): {
  owner: string;
  repo: string;
  branch: string;
  path: string;
} {
  const cleaned = url.trim().replace(/\/$/, '');

  // 完整路徑格式: github.com/owner/repo/tree|blob/branch/path
  const fullMatch = cleaned.match(
    /github\.com\/([^/]+)\/([^/]+)\/(?:tree|blob)\/([^/]+)\/(.+)/
  );
  if (fullMatch) {
    let path = fullMatch[4];
    // 如果 path 直接指向 SKILL.md，取其目錄
    if (path.endsWith('/SKILL.md') || path.endsWith('/skill.md')) {
      path = path.replace(/\/SKILL\.md$/i, '');
    }
    return {
      owner: fullMatch[1],
      repo: fullMatch[2],
      branch: fullMatch[3],
      path,
    };
  }

  // 簡短格式: github.com/owner/repo
  const shortMatch = cleaned.match(/github\.com\/([^/]+)\/([^/\s]+)/);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      branch: 'main',
      path: '',
    };
  }

  throw new Error(
    '無效的 GitHub URL。請提供格式如 https://github.com/owner/repo/tree/branch/path 的連結。'
  );
}

/**
 * 從 GitHub 取得 SKILL.md 的內容。
 * 使用 raw.githubusercontent.com 直接取得檔案。
 */
async function fetchSkillContent(parsed: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}): Promise<string> {
  const { owner, repo, branch, path } = parsed;

  // 嘗試多種可能的檔案位置
  const candidates = path
    ? [
        `${path}/SKILL.md`,
        `${path}/skill.md`,
        `${path}/README.md`,
        path.endsWith('.md') ? path : null,
      ].filter(Boolean) as string[]
    : ['SKILL.md', 'skill.md', 'README.md'];

  for (const candidate of candidates) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${candidate}`;
    try {
      const response = await fetch(rawUrl);
      if (response.ok) {
        return await response.text();
      }
    } catch {
      // 繼續嘗試下一個候選路徑
    }
  }

  throw new Error(
    `無法在 ${owner}/${repo} 中找到 SKILL.md 檔案。請確認 URL 正確且倉庫為公開。`
  );
}

/**
 * 解析 SKILL.md 的 YAML frontmatter 和 Markdown body。
 * 使用 gray-matter 套件。
 */
function parseSkillMd(content: string): {
  name: string;
  description: string;
  instructions: string;
} {
  try {
    const parsed = matter(content);

    const name =
      (parsed.data.name as string) || extractTitleFromMarkdown(parsed.content);
    const description = (parsed.data.description as string) || '';
    const instructions = parsed.content.trim();

    if (!name) {
      throw new Error('SKILL.md 缺少名稱（frontmatter name 或 Markdown 標題）');
    }

    return { name, description, instructions };
  } catch (error) {
    // 如果 gray-matter 解析失敗，嘗試純文字解析
    if (error instanceof Error && error.message.includes('SKILL.md')) {
      throw error;
    }

    const title = extractTitleFromMarkdown(content);
    return {
      name: title || 'Unnamed Skill',
      description: '',
      instructions: content.trim(),
    };
  }
}

/**
 * 從 Markdown 內容中提取第一個 H1 標題作為名稱。
 */
function extractTitleFromMarkdown(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

/**
 * 使用 AI 將外部 Skill 格式轉換為 MyClaw JSON 格式。
 */
async function convertToMyClawFormat(
  name: string,
  description: string,
  instructions: string
): Promise<SkillCreateRequest> {
  try {
    const userMessage = `請將以下 Agent Skill 轉換為 MyClaw 格式：

原始名稱：${name}
原始描述：${description}
指令內容：
${instructions}`;

    const response = await chat({
      messages: [{ role: 'user', content: userMessage }],
      systemPrompt: CONVERT_SYSTEM_PROMPT,
      tools: [CONVERT_SKILL_TOOL],
      complexity: 'moderate',
      maxTokens: 1024,
    });

    // 從 tool call 中提取轉換結果
    const toolCall = response.toolCalls?.find(
      (tc) => tc.name === 'convert_skill'
    );

    if (toolCall) {
      const input = toolCall.input as {
        name: string;
        description: string;
        trigger: { type: string; value: string };
        prompt: string;
        tools?: string[];
      };

      return {
        name: input.name,
        description: input.description || '',
        trigger: {
          type: input.trigger.type as SkillCreateRequest['trigger']['type'],
          value: input.trigger.value || '',
        },
        prompt: input.prompt,
        tools: input.tools,
      };
    }

    // 如果 AI 沒有使用 tool，用降級方案
    return {
      name: name,
      description: description || `匯入自 GitHub 的技能：${name}`,
      trigger: { type: 'manual', value: '' },
      prompt: instructions.substring(0, 5000),
    };
  } catch (error) {
    console.error('[skill-importer] AI 格式轉換失敗:', error);
    // 降級方案：直接使用原始資料
    return {
      name,
      description: description || `匯入自 GitHub 的技能：${name}`,
      trigger: { type: 'manual', value: '' },
      prompt: instructions.substring(0, 5000),
    };
  }
}

/**
 * 驗證技能 prompt 的安全性。
 * 掃描 prompt injection 模式和長度限制。
 */
function validateSkillSafety(prompt: string): {
  safe: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // 檢查 prompt injection 模式
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(prompt)) {
      warnings.push(`偵測到可疑指令模式: ${pattern.source}`);
    }
  }

  // 檢查 prompt 長度
  if (prompt.length > 5000) {
    warnings.push(
      `Prompt 長度 (${prompt.length}) 超過 5000 字元限制，將被截斷`
    );
  }

  // 檢查是否包含程式碼區塊（可能是可執行程式碼）
  const codeBlockCount = (prompt.match(/```/g) || []).length;
  if (codeBlockCount >= 4) {
    warnings.push('Prompt 包含大量程式碼區塊，請確認內容安全');
  }

  return {
    safe: warnings.length === 0,
    warnings,
  };
}

/**
 * 當遠端目錄不可用時，回傳預設的技能推薦列表。
 */
function getDefaultCatalog(): {
  id: string;
  name: string;
  description: string;
}[] {
  return [
    {
      id: 'smart-summary',
      name: '智慧摘要',
      description: '傳送連結或長文，自動摘要成 3-5 個重點',
    },
    {
      id: 'translation-helper',
      name: '翻譯助手',
      description: '說「翻譯」即時將訊息翻譯成英文或中文',
    },
    {
      id: 'expense-tracker',
      name: '記帳助手',
      description: '說「花了 XX 元」自動記錄花費，支援查詢統計',
    },
    {
      id: 'daily-reminder',
      name: '提醒事項',
      description: '說「提醒我」設定各種定時提醒',
    },
    {
      id: 'writing-helper',
      name: '寫作助手',
      description: '幫你潤稿、改寫、檢查文法',
    },
    {
      id: 'mood-diary',
      name: '心情日記',
      description: '每天記錄心情，AI 陪你聊聊',
    },
  ];
}
