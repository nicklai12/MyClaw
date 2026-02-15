// ============================================
// Express 伺服器 + 多平台 Webhook 處理
// ============================================

import 'dotenv/config';
import express from 'express';
import { loadConfig, AppConfig, ChatMessage, RECENT_MESSAGES_COUNT, PlatformType } from './config';
import { initLLM, chat, getProviderInfo } from './llm';
import { initDB, getOrCreateUser, saveMessage, getRecentMessages, getEnabledSkills, getUserSkills, createSkill, findSkillBySourceUrl, updateSkill } from './db';
import { getUserMemory, updateMemory, buildMemoryUpdatePrompt } from './memory';
import { isSkillManagementIntent, handleSkillManagement } from './skill-manager';
import { findMatchingSkill, executeSkill } from './skill-executor';
import { isSkillImportIntent, importSkillFromURL } from './skill-importer';
import { initScheduler } from './scheduler';
import type { MessageChannel, IncomingMessage } from './channel';
import { LineChannel } from './line-channel';
import { TelegramChannel } from './telegram-channel';

// ============================================
// 模組狀態
// ============================================

const channels: MessageChannel[] = [];

// ============================================
// Express 伺服器設定
// ============================================

const app = express();

// ============================================
// 取得平台對應的 channel
// ============================================

function getChannel(platform: PlatformType): MessageChannel | undefined {
  return channels.find((ch) => ch.platform === platform);
}

// ============================================
// 訊息處理主流程
// ============================================

/**
 * 處理收到的訊息（跨平台統一入口）
 * 依序判斷：技能匯入 → 技能管理 → 技能匹配 → 一般對話
 */
async function handleIncomingMessage(incoming: IncomingMessage): Promise<void> {
  const channel = getChannel(incoming.platform);
  if (!channel) {
    console.error(`[index] 找不到平台 ${incoming.platform} 的 channel`);
    return;
  }

  const replyFn = async (text: string) => {
    await channel.reply(incoming, text);
  };

  try {
    // 1. 取得或建立用戶
    const user = getOrCreateUser(incoming.platformUserId, incoming.platform, incoming.displayName);

    // 2. 儲存用戶訊息
    saveMessage(user.id, 'user', incoming.text);

    // 3. 技能匯入意圖判斷
    const importCheck = isSkillImportIntent(incoming.text);
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
        await replyFn(reply);
        saveMessage(user.id, 'assistant', reply);
        return;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[index] 技能匯入失敗:', errMsg);
        const reply = `技能匯入失敗: ${errMsg}`;
        await replyFn(reply);
        saveMessage(user.id, 'assistant', reply);
        return;
      }
    }

    // 4. 技能管理意圖判斷
    if (isSkillManagementIntent(incoming.text)) {
      try {
        const result = await handleSkillManagement(user.id, incoming.text);
        await replyFn(result);
        saveMessage(user.id, 'assistant', result);
        return;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[index] 技能管理失敗:', errMsg);
        const reply = `技能管理失敗: ${errMsg}`;
        await replyFn(reply);
        saveMessage(user.id, 'assistant', reply);
        return;
      }
    }

    // 5. 技能匹配 → 執行
    const enabledSkills = getEnabledSkills(user.id);
    const matchedSkill = findMatchingSkill(incoming.text, enabledSkills);
    if (matchedSkill) {
      try {
        // Telegram：先發「思考中...」再編輯為最終結果
        let thinkingMsgId: string | number | undefined;
        if (incoming.platform === 'telegram' && channel.sendAndGetId) {
          thinkingMsgId = await channel.sendAndGetId(incoming.platformUserId, '思考中...');
        }

        const skillResult = await executeSkill(matchedSkill, user.id, incoming.text);

        if (thinkingMsgId && channel.editMessage) {
          await channel.editMessage(incoming.platformUserId, thinkingMsgId, skillResult);
        } else {
          await replyFn(skillResult);
        }
        saveMessage(user.id, 'assistant', skillResult);
        return;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[index] 技能執行失敗:', errMsg);
        const reply = `技能執行失敗: ${errMsg}`;
        await replyFn(reply);
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
    if (
      chatHistory.length === 0 ||
      chatHistory[chatHistory.length - 1].content !== incoming.text
    ) {
      chatHistory.push({ role: 'user', content: incoming.text });
    }

    const userSkills = getUserSkills(user.id);
    const systemPrompt = buildSystemPrompt(memory, user.display_name, userSkills, incoming.platform);

    const response = await chat({
      messages: chatHistory,
      systemPrompt,
    });

    const aiReply = response.content || '(AI 無回應)';

    // 回覆用戶
    await replyFn(aiReply);

    // 7. 儲存 AI 回覆
    saveMessage(user.id, 'assistant', aiReply);

    // 8. 非同步記憶更新（不阻塞回覆）
    triggerMemoryUpdate(user.id, incoming.text, aiReply, memory).catch((err) => {
      console.error('[index] 記憶更新失敗:', err);
    });
  } catch (error) {
    console.error('[index] 處理訊息時發生錯誤:', error);
    try {
      await replyFn('抱歉，處理訊息時發生錯誤，請稍後再試。');
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
function buildSystemPrompt(memory: string, displayName: string, skills: import('./config').Skill[] = [], platform: PlatformType = 'line'): string {
  const platformName = platform === 'telegram' ? 'Telegram' : 'LINE';
  let prompt = `你是一個友善、聰明的 ${platformName} 個人 AI 助理「MyClaw」。
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

  // 注入 LLM 模型身份資訊
  const providerInfo = getProviderInfo();
  prompt += `\n\n## 你的 AI 模型身份
你目前使用的 LLM 是：${providerInfo.provider} 模式，模型為 ${providerInfo.model}。
當使用者詢問你是什麼模型、用什麼 LLM 時，請如實告知上述資訊。`;

  prompt += `\n\n## 注意事項
- 回覆保持簡潔，不要過度冗長
- 使用繁體中文
- 當使用者詢問你是哪個模型或大語言模型時，如實回答你的 AI 模型身份
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
      platforms: channels.map((ch) => ch.platform),
      uptime: process.uptime(),
    });
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      provider: providerInfo.provider,
      model: providerInfo.model,
      platforms: channels.map((ch) => ch.platform),
      uptime: process.uptime(),
    });
  });

  // 訊息回呼（各平台 webhook router 共用）
  const onMessage = (incoming: IncomingMessage) => {
    handleIncomingMessage(incoming).catch((err) => {
      console.error('[index] handleIncomingMessage 未預期錯誤:', err);
    });
  };

  // LINE Webhook
  if (config.line) {
    const lineChannel = new LineChannel(config.line.channelAccessToken);
    channels.push(lineChannel);

    const lineRouter = lineChannel.createWebhookRouter(config.line.channelSecret, onMessage);
    app.use('/webhook/line', lineRouter);
    // 向後相容：舊 /webhook 路徑指向 LINE
    app.use('/webhook', lineRouter);
    console.log('[index] LINE Webhook 已掛載: /webhook/line, /webhook');
  }

  // Telegram Webhook
  if (config.telegram) {
    const telegramChannel = new TelegramChannel(config.telegram.botToken);
    channels.push(telegramChannel);

    // Telegram webhook 需要 JSON body parser
    const telegramRouter = telegramChannel.createWebhookRouter(onMessage);
    app.use('/webhook/telegram', express.json(), telegramRouter);
    console.log('[index] Telegram Webhook 已掛載: /webhook/telegram');

    // 自動設定 Telegram webhook URL
    if (config.webhookBaseUrl) {
      const webhookUrl = `${config.webhookBaseUrl}/webhook/telegram`;
      telegramChannel.setWebhook(webhookUrl).catch((err) => {
        console.error('[index] Telegram webhook 自動設定失敗:', err);
      });
    }
  }
}

// ============================================
// 啟動流程
// ============================================

async function main(): Promise<void> {
  try {
    console.log('[index] MyClaw AI Assistant 啟動中...');

    // 1. 載入設定
    const config = loadConfig();
    console.log(`[index] 設定已載入 — port: ${config.port}, env: ${config.nodeEnv}, provider: ${config.llm.provider}`);

    // 2. 初始化 DB
    initDB();
    console.log('[index] 資料庫已初始化');

    // 3. 初始化 LLM
    initLLM(config);
    console.log('[index] LLM Provider 已初始化');

    // 4. 設定路由（內部初始化各平台 channel）
    setupRoutes(config);

    // 5. 初始化排程
    initScheduler(config, channels);
    console.log('[index] 排程系統已初始化');

    // 6. 啟動 Express 伺服器
    app.listen(config.port, () => {
      const info = getProviderInfo();
      const platformList = channels.map((ch) => ch.platform).join(', ');
      console.log('='.repeat(50));
      console.log('[index] MyClaw 已啟動!');
      console.log(`[index] Port: ${config.port}`);
      console.log(`[index] Provider: ${info.provider}`);
      console.log(`[index] Model: ${info.model}`);
      console.log(`[index] Platforms: ${platformList}`);
      console.log(`[index] Environment: ${config.nodeEnv}`);
      if (config.line) {
        console.log(`[index] LINE Webhook: http://localhost:${config.port}/webhook/line`);
      }
      if (config.telegram) {
        console.log(`[index] Telegram Webhook: http://localhost:${config.port}/webhook/telegram`);
      }
      console.log('='.repeat(50));
    });
  } catch (error) {
    console.error('[index] 啟動失敗:', error);
    process.exit(1);
  }
}

// 啟動
main();
