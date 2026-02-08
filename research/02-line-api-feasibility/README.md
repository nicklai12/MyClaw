# LINE Messaging API 可行性研究

## 1. LINE Messaging API 概覽

### 1.1 架構
```
使用者 (LINE App)
    ↓ LINE Platform
LINE Webhook → 你的伺服器 (HTTPS POST)
    ↓
處理訊息 → 呼叫 Reply/Push API
    ↓
LINE Platform → 使用者 (LINE App)
```

與 NanoClaw 的 WhatsApp Baileys (非官方, polling) 相比：
- LINE 有 **官方 SDK** (`@line/bot-sdk` for Node.js)
- 使用 **Webhook** (推送模式)，不需要 polling
- 有 **官方文件和支援**
- 更穩定、不會被封號

### 1.2 核心能力

| 功能 | LINE 支援 | 備註 |
|------|-----------|------|
| 文字訊息 | ✅ | 基本功能 |
| 圖片/影片 | ✅ | 可接收和發送 |
| Rich Menu | ✅ | 底部選單，可觸發技能 |
| Flex Message | ✅ | 卡片式 UI 回應 |
| 群組訊息 | ✅ | Bot 可加入群組 |
| 1:1 私聊 | ✅ | 最適合個人助理 |
| Webhook | ✅ | 即時推送，不需 polling |
| Quick Reply | ✅ | 快速回覆按鈕 |
| Loading Animation | ✅ | 類似 typing 狀態 |

### 1.3 Node.js SDK

```javascript
// 安裝
npm install @line/bot-sdk

// 基本使用
import { Client, middleware } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

// Webhook handler
app.post('/webhook', middleware(config), (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'AI 回應...',
      });
    }
  }
});
```

## 2. 費用結構

### LINE Official Account 方案 (台灣)

| 方案 | 月費 | 免費訊息數 | 超出費用 |
|------|------|-----------|---------|
| 免費 | NT$0 | 500 則/月 | 不可加購 |
| 輕用量 | NT$800 | 4,000 則/月 | 不可加購 |
| 中用量 | NT$4,000 | 25,000 則/月 | NT$0.2/則 |
| 高用量 | NT$10,000 | 100,000 則/月 | NT$0.15/則 |

**重要**:
- 「訊息數」只計算 **Push Message**（主動發送）
- **Reply Message**（回覆使用者訊息）**不計入額度**
- 所以對話式助理基本上可以無限回覆，只要是在回覆使用者的訊息

### Claude API 費用
- Sonnet 4: $3/M input, $15/M output tokens
- Haiku 3.5: $0.80/M input, $4/M output tokens
- 個人使用預估: 每月 $5-20 USD

## 3. 技術可行性評估

### 3.1 優勢 (相較 WhatsApp)

| 項目 | WhatsApp (Baileys) | LINE |
|------|-------------------|------|
| API 穩定性 | ⚠️ 非官方，可能被封 | ✅ 官方 SDK |
| 認證方式 | QR Code 掃描 | Channel Token (一次設定) |
| 訊息接收 | Polling (每 2 秒) | Webhook (即時) |
| 部署需求 | 可本地運行 | 需要公開 HTTPS URL |
| 台灣使用率 | 低 | 極高 (2100萬+ 用戶) |
| Rich UI | 僅文字 | Flex Message + Rich Menu |

### 3.2 挑戰

1. **需要公開 HTTPS URL**: LINE Webhook 需要可公開存取的 HTTPS endpoint
   - 解決方案: ngrok (開發), Railway/Render/Vercel (部署)

2. **Reply Token 有效期**: LINE Reply Token 只有 1 分鐘有效
   - 解決方案: 用 Push Message 取代 (但會計入訊息額度)
   - 或: 先快速回覆「處理中...」，等 AI 回應後用 Push 發送

3. **無法讀取歷史訊息**: LINE Bot 無法主動讀取過去的聊天記錄
   - 解決方案: 在 SQLite 中自行儲存所有收到的訊息

### 3.3 使用者身份隔離

LINE 的每個使用者都有唯一的 `userId`：
```
userId: "U1234567890abcdef..."
```

- 1:1 聊天: 每個用戶天然隔離
- 群組: 有 `groupId`，可以實現類似 NanoClaw 的群組隔離
- 使用者的 `userId` 在不同 Bot 間不同（隱私保護）

**隔離方案**:
```
users/
  {userId}/
    memory.md      # 使用者記憶
    skills/        # 自訂技能
    conversations/ # 對話歷史
```

## 4. LINE 特有功能可利用

### 4.1 Rich Menu (底部選單)
可以建立固定選單讓使用者快速觸發功能：
- 「我的技能」→ 列出已建立的技能
- 「新增技能」→ 進入技能建立流程
- 「排程任務」→ 管理排程
- 「設定」→ 個人化設定

### 4.2 Flex Message (卡片式 UI)
可以用來展示：
- 技能清單 (帶按鈕)
- 任務執行結果 (帶格式)
- 確認對話框 (是/否)

### 4.3 Quick Reply (快速回覆)
對話中提供選項按鈕，適合技能建立的引導流程。

## 5. 結論

### 可行性: ✅ 高度可行

LINE Messaging API 完全適合打造個人化 AI 助理：
- 官方 SDK 穩定可靠
- Webhook 模式比 polling 更高效
- Rich UI 支援比 WhatsApp 更好
- 免費方案的 Reply Message 不限量，適合個人使用
- 台灣使用者基數龐大

### 主要風險
1. Reply Token 1 分鐘限制 → AI 回應可能超時
2. 需要持續運行的伺服器 → 不能純本地
3. 免費方案 Push Message 有限 → 排程任務的主動推送受限

### 建議
- MVP 先用 Reply Message (免費)，超時才用 Push
- 部署在免費雲端平台 (Railway/Render)
- 先做 1:1 對話，不做群組
