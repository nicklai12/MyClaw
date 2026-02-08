import { getUserById, updateUserMemory } from './db.js';
import { MAX_MEMORY_LENGTH } from './config.js';

// ============================================
// 使用者記憶系統
// ============================================
//
// 記憶以 Markdown 格式儲存在 users.memory_md 欄位中。
// AI 在對話過程中提取重要資訊，呼叫 updateMemory 累積記憶。
// 記憶內容會注入 system prompt，讓 AI 具備個人化回應能力。
//
// 格式範例：
// # 使用者記憶
//
// ## 基本資訊
// - 暱稱：小明
// - 所在城市：台北
//
// ## 偏好
// - 喜歡簡短回覆
// - 使用繁體中文
//
// ## 備忘
// - 2024/1/1 開始記帳

// ============================================
// 預設記憶範本
// ============================================

const DEFAULT_MEMORY_TEMPLATE = `# 使用者記憶

## 基本資訊

## 偏好

## 備忘
`;

// ============================================
// 匯出函式
// ============================================

/**
 * 取得使用者記憶（供 AI system prompt 注入）
 *
 * 從資料庫讀取使用者的 memory_md 欄位。
 * 如果使用者尚無記憶，回傳空字串。
 * 呼叫端可直接將回傳值嵌入 system prompt。
 */
export function getUserMemory(userId: number): string {
  const user = getUserById(userId);
  if (!user) {
    console.log(`[memory] 找不到使用者 id=${userId}`);
    return '';
  }
  return user.memory_md || '';
}

/**
 * 更新使用者記憶（AI 提取重要資訊後呼叫）
 *
 * 接收 AI 產生的新版完整記憶內容（Markdown 格式），
 * 直接覆寫儲存到資料庫。
 *
 * 若內容超過 MAX_MEMORY_LENGTH，會從尾部截斷以保留最近的資訊。
 *
 * @param userId - 使用者資料庫 ID
 * @param newInfo - AI 產生的新版完整記憶 Markdown
 * @returns 實際儲存的記憶字串
 */
export function updateMemory(userId: number, newInfo: string): string {
  let memoryToSave = newInfo.trim();

  // 如果新內容為空，初始化為預設範本
  if (!memoryToSave) {
    memoryToSave = DEFAULT_MEMORY_TEMPLATE;
  }

  // 長度限制：截斷超出部分
  if (memoryToSave.length > MAX_MEMORY_LENGTH) {
    // 從尾端往前找到最近的換行符，避免截斷在行中間
    const truncated = memoryToSave.substring(0, MAX_MEMORY_LENGTH);
    const lastNewline = truncated.lastIndexOf('\n');
    memoryToSave = lastNewline > 0
      ? truncated.substring(0, lastNewline) + '\n\n(記憶已截斷，超出上限)'
      : truncated + '\n\n(記憶已截斷，超出上限)';
  }

  updateUserMemory(userId, memoryToSave);
  console.log(`[memory] 使用者記憶已更新: userId=${userId}, 長度=${memoryToSave.length}`);

  return memoryToSave;
}

/**
 * 建立記憶更新 prompt（讓 AI 決定哪些資訊值得記住）
 *
 * 將現有記憶和最近對話組合成 prompt，
 * 讓 LLM 判斷對話中是否有值得記住的新資訊，
 * 並回傳更新後的完整記憶 Markdown。
 *
 * @param existingMemory - 現有的記憶 Markdown（可能為空字串）
 * @param conversation - 最近的對話內容（格式為 "user: ...\nassistant: ..."）
 * @returns 供 LLM 處理的 prompt 字串
 */
export function buildMemoryUpdatePrompt(existingMemory: string, conversation: string): string {
  const currentMemory = existingMemory || DEFAULT_MEMORY_TEMPLATE;

  return `你是一個記憶管理助手。請分析以下對話，判斷是否有值得記住的新資訊。

## 目前的使用者記憶

${currentMemory}

## 最近的對話

${conversation}

## 指示

請根據對話內容，更新使用者記憶。規則如下：

1. **保留**所有現有記憶中仍然正確的資訊
2. **更新**如果對話中的新資訊與現有記憶矛盾，以新資訊為準
3. **新增**對話中提到的重要個人資訊，例如：
   - 姓名、暱稱、所在地
   - 工作、興趣、習慣
   - 偏好的回覆風格
   - 重要的日期或事件
   - 正在進行的專案或目標
4. **忽略**不重要的閒聊內容（如「你好」「謝謝」）
5. **格式**使用 Markdown，保持「# 使用者記憶」為頂層標題，下分「## 基本資訊」「## 偏好」「## 備忘」三個分類
6. **長度**保持簡潔，每個分類下不超過 10 個要點
7. **語言**使用繁體中文

如果對話中沒有任何值得記住的新資訊，請原封不動回傳現有記憶。

請直接回傳更新後的完整記憶 Markdown，不要加任何解釋或前後綴。`;
}
