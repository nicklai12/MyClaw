// ============================================
// 訊息平台抽象介面
// ============================================
// 定義跨平台（LINE / Telegram）的統一訊息處理介面

import type { PlatformType } from './config';

// ============================================
// 訊息型別
// ============================================

export interface IncomingMessage {
  platform: PlatformType;
  platformUserId: string;
  displayName?: string;
  text: string;
  /** 平台特定的回覆上下文（LINE: replyToken） */
  replyContext?: unknown;
}

// ============================================
// 頻道介面
// ============================================

export interface MessageChannel {
  readonly platform: PlatformType;
  readonly maxTextLength: number;

  /** 回覆收到的訊息 */
  reply(message: IncomingMessage, text: string): Promise<void>;

  /** 主動推送訊息給使用者 */
  push(platformUserId: string, text: string): Promise<void>;

  /** 傳送打字中指示（選用） */
  sendTypingIndicator?(platformUserId: string): Promise<void>;

  /** 編輯已傳送的訊息（選用，Telegram 支援） */
  editMessage?(platformUserId: string, messageId: string | number, newText: string): Promise<void>;

  /** 傳送訊息並取得訊息 ID（選用，Telegram 支援） */
  sendAndGetId?(platformUserId: string, text: string): Promise<string | number>;
}
