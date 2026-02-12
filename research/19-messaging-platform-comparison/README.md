# LINE vs Telegram vs Discord: AI 思考模型場景平台比較

> 調查日期：2026-02-12
> 目的：評估 LINE、Telegram、Discord 三大即時通訊平台對 MyClaw AI 助理（含 5-30 秒延遲回應場景）的適用性

---

## 1. 平台 Bot API 機制概覽

### 1.1 LINE Messaging API

| 項目 | 規格 |
|------|------|
| **Webhook 回應要求** | 收到 webhook 後須在 **1-2 秒內**回傳 HTTP 200，否則視為 timeout 並重試 |
| **Reply Token 有效期** | 約 **30 秒**（官方文件記載「一定時間後失效」，社群測試約 30 秒，部分來源稱最新已延至數分鐘；但不應依賴超過 30 秒） |
| **Reply Token 限制** | 每個 token 只能使用 **1 次** |
| **Push Message** | 不需 token，可隨時主動發送，但**計入訊息配額** |
| **Loading Indicator** | 2024 年新增 `/v2/bot/chat/loading/start` API，可顯示 5-60 秒打字動畫 |
| **訊息編輯** | **不支援** — 送出的訊息不可修改或刪除 |
| **串流回覆** | **不支援** — 無法逐字更新已送出的訊息 |

### 1.2 Telegram Bot API

| 項目 | 規格 |
|------|------|
| **Webhook 回應** | 無嚴格秒數限制，但 Telegram 會等待回應後才送同一 chat 的下一條更新；建議盡快回應 |
| **回應時限** | **無 token 限制** — Bot 隨時可主動發訊息給已互動過的使用者 |
| **Typing Indicator** | `sendChatAction("typing")` 顯示 **5 秒**，需重複呼叫維持 |
| **訊息編輯** | **支援** — `editMessageText` 可修改已送出的訊息 |
| **串流回覆** | **可模擬** — 透過重複 `editMessageText` 實現漸進式更新（需節流，約每 500ms-1s 一次） |
| **Inline Keyboard** | 支援按鈕、callback query、訊息內互動 |
| **訊息費用** | **完全免費** — 無訊息配額限制 |

### 1.3 Discord Interactions API

| 項目 | 規格 |
|------|------|
| **初始回應時限** | 收到 interaction 後必須在 **3 秒內**回應（ACK 或 deferred） |
| **Deferred Reply** | 呼叫 `deferReply()` 顯示「Bot is thinking...」動畫，token 延長至 **15 分鐘** |
| **Follow-up / Edit** | 在 15 分鐘內可用 `editReply()` 更新回覆或發送 follow-up 訊息 |
| **訊息編輯** | **支援** — 可編輯已送出的訊息 |
| **串流回覆** | **可模擬** — 透過重複 `editReply()` 實現（rate limit: 5 msg/5s/channel） |
| **Rich Embed** | 支援 Embed 物件（標題、描述、欄位、顏色、圖片） |
| **訊息費用** | **完全免費** — Discord API 無任何使用費 |

---

## 2. 延遲回應處理方式比較表

| 特性 | LINE | Telegram | Discord |
|------|------|----------|---------|
| **「思考中」指示** | Loading Indicator API (5-60秒動畫) | `sendChatAction("typing")` (每5秒需重發) | `deferReply()` 自動顯示 "thinking..." |
| **思考中→真正結果** | Loading → Push Message (新訊息) | Typing → `editMessageText` (原地更新) | Thinking → `editReply()` (原地更新) |
| **UX 體驗** | 使用者看到兩則訊息（動畫消失+新訊息出現） | 使用者看到同一則訊息從空到有內容（最自然） | 使用者看到「thinking...」變成真正回覆（很自然） |
| **中間狀態回饋** | 只能送新訊息（產生訊息轟炸） | 可多次 edit 同一訊息（顯示進度） | 可多次 editReply（顯示進度） |
| **最大等待時間** | Loading 60秒 + Push 無限 | 無限（持續 typing + 最後送/改訊息） | 15 分鐘（deferred token 有效期） |
| **串流輸出** | 不可能 | 可行（editMessageText 模擬） | 可行（editReply 模擬） |
| **免費成本** | Loading 免費，Push 計費 | 完全免費 | 完全免費 |

---

## 3. AI 思考模型場景的 UX 深度分析

### 3.1 MyClaw 典型流程

```
使用者發送訊息
  → LLM 判斷意圖 (1-3秒)
  → 觸發技能 + 工具呼叫 (2-10秒)
  → API 呼叫外部服務 (1-5秒)
  → LLM 整理回覆 (1-3秒)
  → 回覆使用者

總延遲：5-30 秒（含多輪工具呼叫可能更久）
```

### 3.2 各平台最佳實踐

#### LINE 的做法（現行架構）

```
1. Webhook 收到 → 立即回 HTTP 200
2. 呼叫 Loading Indicator API (loadingSeconds: 60)
3. 背景處理 LLM + 工具呼叫
4. 處理完成 → Push Message 送出結果
```

**優點**：
- Loading Indicator 是原生功能，UX 清楚
- 2024 年新增的 API 大幅改善了延遲回應的體驗

**缺點**：
- Push Message 計入配額（免費方案僅 200 則/月）
- 無法顯示中間進度（如「正在查詢 ERP...」「正在分析數據...」）
- 訊息不可編輯，每個步驟都得發新訊息
- 多輪工具呼叫場景會產生大量 Push Message
- Reply Token 可能過期，必須用 Push（付費）

#### Telegram 的做法（最靈活）

```
1. 收到訊息 → sendChatAction("typing")
2. 發送初始訊息「正在處理您的請求...」
3. 工具呼叫進行中 → editMessageText「正在查詢 ERP 系統...」
4. API 回傳 → editMessageText「正在分析數據...」
5. LLM 完成 → editMessageText「最終完整回覆」
```

**優點**：
- 完全免費，無訊息配額限制
- 可原地編輯訊息，使用者只看到一則訊息從「處理中」變成最終結果
- 可顯示每個工具呼叫步驟的進度
- 可模擬串流輸出（逐字顯示）
- 無 token 過期問題，Bot 隨時可主動聯繫使用者
- Inline Keyboard 支援豐富的互動按鈕

**缺點**：
- Typing indicator 每 5 秒需重發（需要 setInterval 邏輯）
- editMessageText 有速率限制（每秒每 chat 約 1 次）
- Markdown 解析可能在串流中途出錯（需 try-catch）

#### Discord 的做法（最正式）

```
1. 收到 Slash Command → deferReply()（顯示 "thinking..."）
2. 背景處理 → 可用 editReply() 顯示進度
3. 完成 → editReply() 送出最終 Embed 格式結果
```

**優點**：
- Deferred Reply 是原生設計，專為長時間處理打造
- 15 分鐘的 token 有效期足夠任何 AI 處理
- 完全免費
- Rich Embed 格式適合結構化資料展示
- 可 edit reply 顯示進度

**缺點**：
- 僅支援 Slash Command 觸發（非自然語言對話）
- 3 秒初始回應限制較嚴格（但 defer 可解決）
- 使用者需要輸入 `/command` 而非自然語言
- Discord 主要是社群平台，非個人助理場景
- 普通訊息（非 interaction）無 deferred 機制

### 3.3 多輪工具呼叫的中間狀態回饋

| 平台 | 能力 | 實現方式 |
|------|------|----------|
| **LINE** | 差 | 只能發新訊息，每個步驟一則 Push（計費且訊息轟炸） |
| **Telegram** | 優 | editMessageText 原地更新，一則訊息顯示所有狀態變化 |
| **Discord** | 良 | editReply 原地更新，但僅限 interaction context |

---

## 4. 成本比較

### 4.1 訊息費用

| 項目 | LINE | Telegram | Discord |
|------|------|----------|---------|
| **免費訊息額度** | 200 則/月（Light 方案） | **無限** | **無限** |
| **Reply 訊息** | 免費（不計配額） | 免費 | 免費 |
| **主動訊息** | 計配額，超額 ~NT$0.2-1/則 | 免費 | 免費 |
| **Loading Indicator** | 免費（不計配額） | N/A（sendChatAction 免費） | N/A（deferReply 免費） |
| **升級方案** | Light: 免費/200則, Standard: ~NT$800/月/6000則 | 無需升級 | 無需升級 |

### 4.2 AI 助理場景的成本估算

假設一個活躍使用者每天觸發 10 次技能呼叫：

| 平台 | 每月訊息量 | 月成本 |
|------|-----------|--------|
| **LINE** | ~300 Push Messages + 回覆 | 200 則免費 + 超額約 NT$20-100/月 |
| **Telegram** | ~300 Messages + edits | **NT$0**（完全免費） |
| **Discord** | ~300 Messages + edits | **NT$0**（完全免費） |

### 4.3 Bot 建立門檻

| 項目 | LINE | Telegram | Discord |
|------|------|----------|---------|
| **註冊要求** | LINE Official Account（需審核） | @BotFather 即時建立 | Developer Portal 註冊 |
| **建立速度** | 數小時~數天（含審核） | **即時**（1分鐘內） | 數分鐘 |
| **文件品質** | 良好（有中文） | 優秀（英文為主，簡潔清晰） | 優秀（英文為主，非常詳細） |

---

## 5. 台灣市場適用性

### 5.1 使用者基數（台灣）

| 平台 | 台灣 MAU | 滲透率 | 主要使用者 |
|------|---------|--------|-----------|
| **LINE** | **~2,200 萬** | **~94%** | 全年齡層，幾乎人人使用 |
| **Telegram** | 估計 50-100 萬 | ~2-4% | 科技圈、加密貨幣社群、年輕族群 |
| **Discord** | 估計 100-200 萬 | ~4-8% | 遊戲玩家、學生、科技社群 |

### 5.2 使用場景分析

| 平台 | 個人助理適用性 | 原因 |
|------|----------------|------|
| **LINE** | **高** | 使用者本就在 LINE 上，無需額外安裝，符合日常習慣 |
| **Telegram** | 中 | 需要使用者額外安裝，但功能強大；科技圈接受度高 |
| **Discord** | 低 | 社群導向，非個人助理場景；一般使用者不熟悉 |

---

## 6. 綜合評分

| 評估維度 | LINE | Telegram | Discord |
|---------|------|----------|---------|
| 延遲回應 UX | 6/10 | **9/10** | 8/10 |
| 中間狀態回饋 | 3/10 | **9/10** | 7/10 |
| 串流輸出能力 | 1/10 | **8/10** | 7/10 |
| 訊息成本 | 4/10 | **10/10** | **10/10** |
| 台灣市場觸及 | **10/10** | 3/10 | 2/10 |
| 個人助理 UX | **8/10** | 7/10 | 4/10 |
| 互動元件 | 7/10 | **8/10** | **8/10** |
| 開發靈活性 | 5/10 | **9/10** | 7/10 |
| **總分** | **44/80** | **63/80** | **53/80** |

---

## 7. 推薦結論

### 技術最佳選擇：Telegram

從純技術角度，**Telegram 是 AI 思考模型場景的最佳平台**：
- 訊息可編輯 → 「思考中 → 最終結果」原地更新，UX 最自然
- 完全免費 → 無訊息配額壓力，可自由發送工具呼叫進度
- 串流模擬 → editMessageText 可實現逐字輸出效果
- 無 token 過期 → Bot 隨時可主動聯繫使用者
- API 設計簡潔 → 開發效率高

### 市場最佳選擇：LINE

從台灣市場角度，**LINE 仍然是觸及使用者的最佳選擇**：
- 94% 滲透率 → 不需要使用者改變習慣
- Loading Indicator API → 2024 年新增的功能大幅改善了延遲回應 UX
- 本地化完善 → 繁體中文支援完整

### Discord 的定位

Discord 不適合作為個人 AI 助理平台：
- 社群導向設計，Slash Command 非自然語言互動
- 台灣一般使用者不熟悉
- 但如果目標是技術社群/遊戲社群，Discord 的 deferred reply 機制設計精良

---

## 8. 對 MyClaw 的具體建議

### 短期策略：優化 LINE 體驗

LINE 的市場優勢無可取代，建議：

1. **善用 Loading Indicator API**：收到訊息後立即呼叫 `/v2/bot/chat/loading/start`，設定 `loadingSeconds: 60`
2. **Reply 優先策略**：盡量在 Reply Token 有效期內（~30 秒）回覆，使用免費的 Reply Message
3. **Push Message 節制**：超過 token 有效期才改用 Push Message；合併多個工具呼叫結果為一則訊息
4. **非同步處理**：Webhook 立即回 200，所有處理在背景執行

### 中期策略：新增 Telegram 作為進階選項

```
MyClaw 架構擴充：
├── LINE Channel   → 大眾使用者（簡單互動、觸及率優先）
└── Telegram Channel → 進階使用者（串流輸出、進度回饋、無成本限制）
```

具體好處：
- **開發測試更方便**：Telegram Bot 即時建立，免費無限制，適合開發階段
- **進階 UX**：Telegram 的 editMessageText 可展示完整的工具呼叫過程
- **成本控制**：將高頻使用者引導至 Telegram，減少 LINE Push Message 費用
- **Multi-channel 架構**：抽象化訊息接口，未來易於擴充其他平台

### 架構建議

```typescript
// 抽象化的 Channel 接口
interface MessageChannel {
  // 顯示「思考中」狀態
  showThinking(userId: string): Promise<void>;
  // 更新進度（Telegram: edit, LINE: 新訊息或忽略）
  updateProgress(userId: string, messageId: string, text: string): Promise<void>;
  // 送出最終回覆
  sendFinalReply(userId: string, messageId: string, text: string): Promise<void>;
}
```

### 不建議的方案

- **放棄 LINE 改用 Telegram** → 會失去 94% 台灣使用者觸及率
- **以 Discord 為主平台** → 不適合個人助理場景
- **同時維護三個平台** → 初期開發成本過高，建議先 LINE + Telegram 雙平台

---

## 參考資料

### LINE
- [LINE Messaging API Reference](https://developers.line.biz/en/reference/messaging-api/)
- [Display a Loading Animation](https://developers.line.biz/en/docs/messaging-api/use-loading-indicator/)
- [Send Messages](https://developers.line.biz/en/docs/messaging-api/sending-messages/)
- [Messaging API Pricing](https://developers.line.biz/en/docs/messaging-api/pricing/)
- [Receive Messages (Webhook)](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)

### Telegram
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegram Bots FAQ](https://core.telegram.org/bots/faq)
- [Telegram Webhook Guide](https://core.telegram.org/bots/webhooks)
- [Telegram Limits](https://limits.tginfo.me/en)

### Discord
- [Discord Interactions: Receiving and Responding](https://discord.com/developers/docs/interactions/receiving-and-responding)
- [discord.js Command Response Methods](https://discordjs.guide/slash-commands/response-methods)
- [Discord.Net 3-second Timeout Discussion](https://github.com/discord-net/Discord.Net/discussions/2732)
- [Discord API Pricing](https://friendify.net/blog/discord-api-pricing-and-rate-limits.html)

### 市場數據
- [LINE Users by Country](https://worldpopulationreview.com/country-rankings/line-users-by-country)
- [LINE Revenue and Usage Statistics (2026)](https://www.businessofapps.com/data/line-statistics/)
- [Telegram Statistics (2026)](https://www.demandsage.com/telegram-statistics/)
- [Discord Users by Country 2026](https://worldpopulationreview.com/country-rankings/discord-users-by-country)
