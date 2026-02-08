// ============================================
// node-cron 排程系統
// ============================================
// 管理 cron 排程任務：定時觸發技能並透過 LINE Push Message 發送結果

import cron from 'node-cron';
import { messagingApi } from '@line/bot-sdk';
import { AppConfig, ScheduledTask } from './config';
import { getActiveScheduledTasks, updateLastRun, getUserById, getEnabledSkills } from './db';
import { executeSkill } from './skill-executor';

// ============================================
// LINE 訊息上限
// ============================================

const LINE_TEXT_MAX_LENGTH = 5000;

// ============================================
// 模組狀態
// ============================================

let lineClient: messagingApi.MessagingApiClient | null = null;

/** 以 taskId 為 key 的 cron job map */
const cronJobs = new Map<number, cron.ScheduledTask>();

// ============================================
// 初始化
// ============================================

/**
 * 初始化排程系統
 * 從 DB 讀取所有啟用的排程任務並建立 cron job
 */
export function initScheduler(config: AppConfig): void {
  // 初始化 LINE client（用於 Push Message）
  lineClient = new messagingApi.MessagingApiClient({
    channelAccessToken: config.line.channelAccessToken,
  });

  // 讀取所有啟用的排程任務
  try {
    const tasks = getActiveScheduledTasks();
    console.log(`[scheduler] 載入 ${tasks.length} 個排程任務`);

    for (const task of tasks) {
      addCronJob(task);
    }
  } catch (error) {
    console.error('[scheduler] 載入排程任務失敗:', error);
  }

  console.log('[scheduler] 排程系統已初始化');
}

// ============================================
// 排程執行
// ============================================

/**
 * 執行排程技能
 * 讀取 skill → 執行 → 用 LINE Push Message 發送結果 → 更新 last_run
 */
async function executeCronSkill(task: ScheduledTask): Promise<void> {
  console.log(`[scheduler] 執行排程任務: id=${task.id}, skill_id=${task.skill_id}`);

  try {
    // 從使用者的已啟用技能中找到對應的 skill
    const skills = getEnabledSkills(task.user_id);
    const skill = skills.find((s) => s.id === task.skill_id);

    if (!skill) {
      console.error(`[scheduler] 排程任務 ${task.id} 找不到對應的技能 (skill_id=${task.skill_id})`);
      return;
    }

    // 執行技能（executeSkill 內部會讀取 memory 和呼叫 chat）
    const result = await executeSkill(skill, task.user_id, '');

    // 透過 LINE Push Message 發送結果
    if (lineClient) {
      const user = getUserById(task.user_id);
      if (user) {
        const message: messagingApi.TextMessage = {
          type: 'text',
          text: truncateForLine(result),
        };

        try {
          await lineClient.pushMessage({ to: user.line_user_id, messages: [message] });
          console.log(`[scheduler] 排程結果已發送給用戶: ${user.line_user_id}`);
        } catch (pushError) {
          console.error('[scheduler] Push Message 失敗:', pushError);
        }
      } else {
        console.error(`[scheduler] 找不到使用者 (user_id=${task.user_id})`);
      }
    }

    // 更新 last_run
    updateLastRun(task.id);
    console.log(`[scheduler] 排程任務 ${task.id} 已執行完成`);
  } catch (error) {
    console.error(`[scheduler] 排程任務 ${task.id} 執行失敗:`, error);
  }
}

// ============================================
// 動態管理
// ============================================

/**
 * 新增 cron job
 */
export function addCronJob(task: ScheduledTask): void {
  // 檢查 cron expression 是否有效
  if (!cron.validate(task.cron_expression)) {
    console.error(`[scheduler] 無效的 cron expression: "${task.cron_expression}" (task_id=${task.id})`);
    return;
  }

  // 如果已有同 id 的 job，先移除
  if (cronJobs.has(task.id)) {
    removeCronJob(task.id);
  }

  const job = cron.schedule(task.cron_expression, () => {
    executeCronSkill(task).catch((err) => {
      console.error(`[scheduler] cron job 執行錯誤 (task_id=${task.id}):`, err);
    });
  });

  cronJobs.set(task.id, job);
  console.log(`[scheduler] Cron job 已建立: id=${task.id}, cron="${task.cron_expression}", skill_id=${task.skill_id}`);
}

/**
 * 移除 cron job
 */
export function removeCronJob(taskId: number): void {
  const job = cronJobs.get(taskId);
  if (job) {
    job.stop();
    cronJobs.delete(taskId);
    console.log(`[scheduler] Cron job 已移除: id=${taskId}`);
  }
}

// ============================================
// 工具函式
// ============================================

/**
 * 截斷訊息至 LINE 上限（5000 字元）
 */
function truncateForLine(text: string): string {
  if (text.length <= LINE_TEXT_MAX_LENGTH) {
    return text;
  }
  return text.substring(0, LINE_TEXT_MAX_LENGTH - 20) + '\n...(訊息已截斷)';
}
