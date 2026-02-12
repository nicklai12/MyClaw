// ============================================
// Telegram 平台實作（原生 fetch，無額外依賴）
// ============================================

import { Router } from 'express';
import type { MessageChannel, IncomingMessage } from './channel';

// ============================================
// 常數
// ============================================

const TELEGRAM_TEXT_MAX_LENGTH = 4096;

// ============================================
// Telegram API 型別
// ============================================

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
  };
}

interface TelegramApiResponse {
  ok: boolean;
  result?: { message_id: number };
  description?: string;
}

// ============================================
// TelegramChannel 類別
// ============================================

export class TelegramChannel implements MessageChannel {
  readonly platform = 'telegram' as const;
  readonly maxTextLength = TELEGRAM_TEXT_MAX_LENGTH;

  private baseUrl: string;

  constructor(botToken: string) {
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  async reply(message: IncomingMessage, text: string): Promise<void> {
    await this.push(message.platformUserId, text);
  }

  async push(platformUserId: string, text: string): Promise<void> {
    const truncated = this.truncateText(text);
    try {
      await this.callApi('sendMessage', {
        chat_id: platformUserId,
        text: truncated,
      });
    } catch (error) {
      console.error('[telegram-channel] sendMessage 失敗:', error);
    }
  }

  async sendTypingIndicator(platformUserId: string): Promise<void> {
    try {
      await this.callApi('sendChatAction', {
        chat_id: platformUserId,
        action: 'typing',
      });
    } catch (error) {
      console.error('[telegram-channel] sendChatAction 失敗:', error);
    }
  }

  async editMessage(
    platformUserId: string,
    messageId: string | number,
    newText: string
  ): Promise<void> {
    const truncated = this.truncateText(newText);
    try {
      await this.callApi('editMessageText', {
        chat_id: platformUserId,
        message_id: messageId,
        text: truncated,
      });
    } catch (error) {
      console.error('[telegram-channel] editMessageText 失敗:', error);
    }
  }

  async sendAndGetId(platformUserId: string, text: string): Promise<number> {
    const truncated = this.truncateText(text);
    const response = await this.callApi('sendMessage', {
      chat_id: platformUserId,
      text: truncated,
    });
    return response.result?.message_id || 0;
  }

  /**
   * 建立 Telegram Webhook Express Router
   */
  createWebhookRouter(
    onMessage: (incoming: IncomingMessage) => void
  ): Router {
    const router = Router();

    router.post('/', (req, res) => {
      // Telegram Webhook 永遠回傳 200
      res.status(200).json({ ok: true });

      const update = req.body as TelegramUpdate;
      const msg = update.message;
      if (!msg?.text) return;

      const userId = String(msg.chat.id);
      const text = msg.text;

      const displayName = [msg.from?.first_name, msg.from?.last_name]
        .filter(Boolean)
        .join(' ') || msg.from?.username || '';

      console.log(`[telegram-channel] 收到訊息: chatId=${userId}, text="${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

      onMessage({
        platform: 'telegram',
        platformUserId: userId,
        displayName,
        text,
      });
    });

    return router;
  }

  /**
   * 設定 Telegram Webhook URL
   */
  async setWebhook(webhookUrl: string): Promise<void> {
    try {
      const response = await this.callApi('setWebhook', { url: webhookUrl });
      if (response.ok) {
        console.log(`[telegram-channel] Webhook 已設定: ${webhookUrl}`);
      } else {
        console.error(`[telegram-channel] Webhook 設定失敗: ${response.description}`);
      }
    } catch (error) {
      console.error('[telegram-channel] Webhook 設定失敗:', error);
    }
  }

  // ============================================
  // 內部工具
  // ============================================

  private async callApi(method: string, params: Record<string, unknown>): Promise<TelegramApiResponse> {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Telegram API ${method} failed: ${response.status} ${text}`);
    }

    return response.json() as Promise<TelegramApiResponse>;
  }

  private truncateText(text: string): string {
    if (text.length <= TELEGRAM_TEXT_MAX_LENGTH) return text;
    return text.substring(0, TELEGRAM_TEXT_MAX_LENGTH - 20) + '\n...(訊息已截斷)';
  }
}
