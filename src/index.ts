// ============================================
// Express 伺服器 + LINE Webhook 處理
// ============================================

import 'dotenv/config';
import express from 'express';
import {
  middleware,
  MiddlewareConfig,
  messagingApi,
  webhook,
} from '@line/bot-sdk';
import { loadConfig, AppConfig, ChatMessage, RECENT_MESSAGES_COUNT } from './config';
import { initLLM, chat, getProviderInfo } from './llm';
import { initDB, getOrCreateUser, saveMessage, getRecentMessages, getEnabledSkills, getUserSkills, createSkill, findSkillBySourceUrl, updateSkill } from './db';
import { getUserMemory, updateMemory, buildMemoryUpdatePrompt } from './memory';
import { isSkillManagementIntent, handleSkillManagement } from './skill-manager';
import { findMatchingSkill, executeSkill } from './skill-executor';
import { isSkillImportIntent, importSkillFromURL } from './skill-importer';
import { initScheduler } from './scheduler';

// ============================================
// LINE 訊息上限
// ============================================

const LINE_TEXT_MAX_LENGTH = 5000;

// ============================================
// 模組狀態
// ============================================

let lineClient: messagingApi.MessagingApiClient;

// ============================================
// Express 伺服器設定
// ============================================

const app = express();

// ============================================
// LINE 回覆工具函式
// ============================================

/**
 * 截斷過長文字（LINE 文字訊息上限 5000 字元）
 */
function truncateText(text: string): string {
  if (text.length <= LINE_TEXT_MAX_LENGTH) {
    return text;
  }
  return text.substring(0, LINE_TEXT_MAX_LENGTH - 20) + '\n...(訊息已截斷)';
}

/**
 * 回覆 LINE 訊息
 * 優先使用 replyMessage，若 token 過期則改用 pushMessage
 */
async function replyToUser(
  replyToken: string,
  userId: string,
  text: string
): Promise<void> {
  const message: messagingApi.TextMessage = {
    type: 'text',
    text: truncateText(text),
  };

  try {
    await lineClient.replyMessage({ replyToken, messages: [message] });
  } catch (replyError) {
    console.error('[index] replyMessage 失敗，改用 pushMessage:', replyError);
    try {
      await lineClient.pushMessage({ to: userId, messages: [message] });
    } catch (pushError) {
      console.error('[index] pushMessage 也失敗:', pushError);
    }
  }
}

// ============================================
// 訊息處理主流程
// ============================================

/**
 * 處理文字訊息的主流程
 * 依序判斷：技能匯入 → 技能管理 → 技能匹配 → 一般對話
 */
async function handleTextMessage(
  replyToken: string,
  userId: string,
  text: string
): Promise<void> {
  try {
    // 1. 取得或建立用戶
    const user = getOrCreateUser(userId);

    // 2. 儲存用戶訊息
    saveMessage(user.id, 'user', text);

    // 3. 技能匯入意圖判斷
    const importCheck = isSkillImportIntent(text);
    if (importCheck.isImport && importCheck.url) {
      try {
        const result = await importSkillFromURL(importCheck.url, user.id);

        // 檢查是否已存在同 source_url 的技能 → 更新而非重複建立
        const existingSkill = findSkillBySourceUrl(user.id, result.source.url);
        let savedSkill;
        let actionLabel: string;

        if (existingSkill) {
          savedSkill = updateSkill(existingSkill.id, result.skill);
          actionLabel = '已更新';
          console.log(`[index] 技能已更新（重複匯入）: id=${savedSkill.id}, name="${savedSkill.name}"`);
        } else {
          savedSkill = createSkill(
            user.id,
            result.skill,
            result.source.type as 'github_import',
            result.source.url
          );
          actionLabel = '已成功匯入';
          console.log(`[index] 技能已儲存到資料庫: id=${savedSkill.id}, name="${savedSkill.name}"`);
        }

        const warningText = result.warnings.length > 0
          ? `\n\n注意：\n${result.warnings.map(w => `- ${w}`).join('\n')}`
          : '';
        const apiInfo = result.skill.api_config
          ? `\nAPI 連線：${result.skill.api_config.base_url}`
          : '';
        const reply = `${actionLabel}技能「${result.skill.name}」！\n\n` +
          `描述：${result.skill.description}\n` +
          `觸發方式：${result.skill.trigger.type} (${result.skill.trigger.value || '無'})` +
          apiInfo +
          warningText;
        await replyToUser(replyToken, userId, reply);
        saveMessage(user.id, 'assistant', reply);
        return;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[index] 技能匯入失敗:', errMsg);
        const reply = `技能匯入失敗: ${errMsg}`;
        await replyToUser(replyToken, userId, reply);
        saveMessage(user.id, 'assistant', reply);
        return;
      }
    }

    // 4. 技能管理意圖判斷
    if (isSkillManagementIntent(text)) {
      try {
        const result = await handleSkillManagement(user.id, text);
        await replyToUser(replyToken, userId, result);
        saveMessage(user.id, 'assistant', result);
        return;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[index] 技能管理失敗:', errMsg);
        const reply = `技能管理失敗: ${errMsg}`;
        await replyToUser(replyToken, userId, reply);
        saveMessage(user.id, 'assistant', reply);
        return;
      }
    }

    // 5. 技能匹配 → 執行
    const enabledSkills = getEnabledSkills(user.id);
    const matchedSkill = findMatchingSkill(text, enabledSkills);
    if (matchedSkill) {
      try {
        const skillResult = await executeSkill(matchedSkill, user.id, text);
        await replyToUser(replyToken, userId, skillResult);
        saveMessage(user.id, 'assistant', skillResult);
        return;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[index] 技能執行失敗:', errMsg);
        const reply = `技能執行失敗: ${errMsg}`;
        await replyToUser(replyToken, userId, reply);
        saveMessage(user.id, 'assistant', reply);
        return;
      }
    }

    // 6. 一般對話 — 使用 LLM
    const memory = getUserMemory(user.id);
    const recentMessages = getRecentMessages(user.id, RECENT_MESSAGES_COUNT);

    // 將 DB messages 轉為 ChatMessage 格式
    const chatHistory: ChatMessage[] = recentMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // 確保最後一條是當前用戶訊息
    // 因為已經 saveMessage 了，recentMessages 理論上已包含最新的 user message
    // 但如果 chatHistory 最後一條不是當前訊息，補上它
    if (
      chatHistory.length === 0 ||
      chatHistory[chatHistory.length - 1].content !== text
    ) {
      chatHistory.push({ role: 'user', content: text });
    }

    const userSkills = getUserSkills(user.id);
    const systemPrompt = buildSystemPrompt(memory, user.display_name, userSkills);

    const response = await chat({
      messages: chatHistory,
      systemPrompt,
    });

    const aiReply = response.content || '(AI 無回應)';

    // 回覆用戶
    await replyToUser(replyToken, userId, aiReply);

    // 7. 儲存 AI 回覆
    saveMessage(user.id, 'assistant', aiReply);

    // 8. 非同步記憶更新（不阻塞回覆）
    triggerMemoryUpdate(user.id, text, aiReply, memory).catch((err) => {
      console.error('[index] 記憶更新失敗:', err);
    });
  } catch (error) {
    console.error('[index] 處理訊息時發生錯誤:', error);
    try {
      await replyToUser(replyToken, userId, '抱歉，處理訊息時發生錯誤，請稍後再試。');
    } catch {
      // 最後的防線：即使錯誤回覆也失敗，靜默處理
    }
  }
}

// ============================================
// System Prompt 建構
// ============================================

/**
 * 建構包含使用者記憶和技能資訊的 system prompt
 */
function buildSystemPrompt(memory: string, displayName: string, skills: import('./config').Skill[] = []): string {
  let prompt = `你是一個友善、聰明的 LINE 個人 AI 助理「MyClaw」。
你會用繁體中文回答，回覆簡潔有重點。
你能記住使用者的偏好和習慣，提供個人化的幫助。`;

  if (displayName) {
    prompt += `\n\n使用者名稱: ${displayName}`;
  }

  // 注入真實的技能資訊，讓 AI 回答時依據實際資料庫
  if (skills.length > 0) {
    const skillLines = skills.map((s, i) => {
      const status = s.enabled ? 'ON' : 'OFF';
      return `${i + 1}. [${status}] ${s.name} — ${s.description}（觸發：${s.trigger_type}${s.trigger_value ? ` "${s.trigger_value}"` : ''}）`;
    });
    prompt += `\n\n## 使用者的技能（來自資料庫，共 ${skills.length} 個）\n${skillLines.join('\n')}`;
  } else {
    prompt += `\n\n## 使用者的技能\n此使用者目前沒有任何技能。`;
  }

  if (memory && memory.trim().length > 0) {
    prompt += `\n\n## 使用者記憶\n以下是你記住的關於此使用者的資訊：\n${memory}`;
  }

  prompt += `\n\n## 注意事項
- 回覆保持簡潔，不要過度冗長
- 使用繁體中文
- 當使用者詢問有什麼技能時，必須根據上方「使用者的技能」區塊的資料庫資料回答，不要自己編造
- 如果使用者想要建立技能，引導他們說出技能名稱、觸發方式和功能描述
- 如果使用者傳送 GitHub URL，詢問是否要匯入為技能`;

  return prompt;
}

// ============================================
// 記憶更新（非同步）
// ============================================

/**
 * 非同步觸發記憶更新
 * 用 AI 判斷對話中是否有值得記住的資訊
 */
async function triggerMemoryUpdate(
  userId: number,
  userText: string,
  aiReply: string,
  currentMemory: string
): Promise<void> {
  try {
    // buildMemoryUpdatePrompt 接收 (existingMemory, conversation)
    const conversation = `user: ${userText}\nassistant: ${aiReply}`;
    const memoryPrompt = buildMemoryUpdatePrompt(currentMemory, conversation);

    const response = await chat({
      messages: [{ role: 'user', content: memoryPrompt }],
      systemPrompt: '你是一個記憶管理助手。請根據指示分析對話內容並更新記憶。',
      maxTokens: 512,
    });

    const result = response.content.trim();
    if (result && result !== currentMemory) {
      updateMemory(userId, result);
      console.log(`[index] 使用者 ${userId} 的記憶已更新`);
    }
  } catch (error) {
    console.error('[index] 記憶更新 AI 呼叫失敗:', error);
  }
}

// ============================================
// Webhook 路由
// ============================================

function setupRoutes(config: AppConfig): void {
  const providerInfo = getProviderInfo();

  // 健康檢查
  app.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      provider: providerInfo.provider,
      model: providerInfo.model,
      uptime: process.uptime(),
    });
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      provider: providerInfo.provider,
      model: providerInfo.model,
      uptime: process.uptime(),
    });
  });

  // LINE Webhook
  const middlewareConfig: MiddlewareConfig = {
    channelSecret: config.line.channelSecret,
  };

  app.post('/webhook', middleware(middlewareConfig), (req, res) => {
    // LINE Webhook 永遠回傳 200
    res.status(200).json({ status: 'ok' });

    // 非同步處理 events
    const body = req.body as { events?: webhook.Event[] };
    const events = body.events || [];

    for (const event of events) {
      if (event.type === 'message') {
        const messageEvent = event as webhook.MessageEvent;
        const message = messageEvent.message;

        // 只處理文字訊息
        if (message.type !== 'text') {
          continue;
        }

        const textMessage = message as webhook.TextMessageContent;
        const source = messageEvent.source;
        const userId = source && 'userId' in source ? (source as { userId?: string }).userId : undefined;

        if (!userId) {
          console.warn('[index] 收到無 userId 的訊息事件，跳過');
          continue;
        }

        const replyToken = messageEvent.replyToken;
        if (!replyToken) {
          console.warn('[index] 收到無 replyToken 的訊息事件，跳過');
          continue;
        }

        const text = textMessage.text;
        console.log(`[index] 收到訊息: userId=${userId}, text="${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

        // 不 await，讓 HTTP 回應先送出
        handleTextMessage(replyToken, userId, text).catch((err) => {
          console.error('[index] handleTextMessage 未預期錯誤:', err);
        });
      }
    }
  });
}

// ============================================
// 啟動流程
// ============================================

async function main(): Promise<void> {
  try {
    console.log('[index] MyClaw LINE AI Assistant 啟動中...');

    // 1. 載入設定
    const config = loadConfig();
    console.log(`[index] 設定已載入 — port: ${config.port}, env: ${config.nodeEnv}, provider: ${config.llm.provider}`);

    // 2. 初始化 LINE Client
    lineClient = new messagingApi.MessagingApiClient({
      channelAccessToken: config.line.channelAccessToken,
    });
    console.log('[index] LINE Client 已初始化');

    // 3. 初始化 DB
    initDB();
    console.log('[index] 資料庫已初始化');

    // 4. 初始化 LLM
    initLLM(config);
    console.log('[index] LLM Provider 已初始化');

    // 5. 設定路由
    setupRoutes(config);

    // 6. 初始化排程
    initScheduler(config);
    console.log('[index] 排程系統已初始化');

    // 7. 啟動 Express 伺服器
    app.listen(config.port, () => {
      const info = getProviderInfo();
      console.log('='.repeat(50));
      console.log('[index] MyClaw 已啟動!');
      console.log(`[index] Port: ${config.port}`);
      console.log(`[index] Provider: ${info.provider}`);
      console.log(`[index] Model: ${info.model}`);
      console.log(`[index] Environment: ${config.nodeEnv}`);
      console.log(`[index] Webhook URL: http://localhost:${config.port}/webhook`);
      console.log('='.repeat(50));
    });
  } catch (error) {
    console.error('[index] 啟動失敗:', error);
    process.exit(1);
  }
}

// 啟動
main();
