// ============================================
// LINE 平台實作
// ============================================

import { Router } from 'express';
import {
  middleware,
  MiddlewareConfig,
  messagingApi,
  webhook,
} from '@line/bot-sdk';
import type { MessageChannel, IncomingMessage } from './channel';

// ============================================
// 常數
// ============================================

const LINE_TEXT_MAX_LENGTH = 5000;

// ============================================
// LineChannel 類別
// ============================================

export class LineChannel implements MessageChannel {
  readonly platform = 'line' as const;
  readonly maxTextLength = LINE_TEXT_MAX_LENGTH;

  private client: messagingApi.MessagingApiClient;

  constructor(channelAccessToken: string) {
    this.client = new messagingApi.MessagingApiClient({ channelAccessToken });
  }

  async reply(message: IncomingMessage, text: string): Promise<void> {
    const replyToken = message.replyContext as string | undefined;
    const truncated = this.truncateText(text);
    const lineMsg: messagingApi.TextMessage = { type: 'text', text: truncated };

    if (replyToken) {
      try {
        await this.client.replyMessage({ replyToken, messages: [lineMsg] });
        return;
      } catch (replyError) {
        console.error('[line-channel] replyMessage 失敗，改用 pushMessage:', replyError);
      }
    }

    // fallback to push
    try {
      await this.client.pushMessage({ to: message.platformUserId, messages: [lineMsg] });
    } catch (pushError) {
      console.error('[line-channel] pushMessage 也失敗:', pushError);
    }
  }

  async push(platformUserId: string, text: string): Promise<void> {
    const truncated = this.truncateText(text);
    const lineMsg: messagingApi.TextMessage = { type: 'text', text: truncated };
    try {
      await this.client.pushMessage({ to: platformUserId, messages: [lineMsg] });
    } catch (error) {
      console.error('[line-channel] pushMessage 失敗:', error);
    }
  }

  /**
   * 建立 LINE Webhook Express Router
   */
  createWebhookRouter(
    channelSecret: string,
    onMessage: (incoming: IncomingMessage) => void
  ): Router {
    const router = Router();
    const middlewareConfig: MiddlewareConfig = { channelSecret };

    router.post('/', middleware(middlewareConfig), (req, res) => {
      // LINE Webhook 永遠回傳 200
      res.status(200).json({ status: 'ok' });

      const body = req.body as { events?: webhook.Event[] };
      const events = body.events || [];

      for (const event of events) {
        if (event.type !== 'message') continue;

        const messageEvent = event as webhook.MessageEvent;
        const message = messageEvent.message;
        if (message.type !== 'text') continue;

        const textMessage = message as webhook.TextMessageContent;
        const source = messageEvent.source;
        const userId = source && 'userId' in source
          ? (source as { userId?: string }).userId
          : undefined;

        if (!userId) {
          console.warn('[line-channel] 收到無 userId 的訊息事件，跳過');
          continue;
        }

        const replyToken = messageEvent.replyToken;
        if (!replyToken) {
          console.warn('[line-channel] 收到無 replyToken 的訊息事件，跳過');
          continue;
        }

        const text = textMessage.text;
        console.log(`[line-channel] 收到訊息: userId=${userId}, text="${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

        onMessage({
          platform: 'line',
          platformUserId: userId,
          text,
          replyContext: replyToken,
        });
      }
    });

    return router;
  }

  private truncateText(text: string): string {
    if (text.length <= LINE_TEXT_MAX_LENGTH) return text;
    return text.substring(0, LINE_TEXT_MAX_LENGTH - 20) + '\n...(訊息已截斷)';
  }
}
