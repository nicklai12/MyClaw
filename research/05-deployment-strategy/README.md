# 簡易安裝與部署方案設計

## 1. 目標

讓非技術使用者也能在 5 分鐘內部署自己的 LINE AI 助理。

## 2. 部署架構

### MVP 推薦架構

```
LINE Platform
    ↓ Webhook (HTTPS)
Railway / Render (免費方案)
    ├── Express.js 伺服器
    ├── SQLite (本地檔案)
    └── node-cron (排程)
    ↓ API 呼叫
Anthropic Claude API
```

### 為什麼選雲端而不是本地?

| 比較 | 本地運行 (NanoClaw 模式) | 雲端部署 |
|------|------------------------|---------|
| LINE Webhook | 需要 ngrok/tunnel | 直接有 HTTPS URL |
| 24/7 運行 | 需要電腦一直開著 | 自動 |
| 排程任務 | 電腦關機就停 | 持續運行 |
| 安裝門檻 | 需要 Node.js, 容器 | 點擊部署 |
| 適合對象 | 開發者 | 任何人 |

## 3. 雲端平台比較

### 3.1 Railway (推薦)

| 項目 | 詳情 |
|------|------|
| 免費方案 | $5 信用額度/月 (足夠小型應用) |
| 支援一鍵部署 | ✅ Deploy Button |
| 持久儲存 | ✅ Volume (SQLite 可用) |
| 自訂域名 | ✅ |
| Sleep 機制 | 無活動時不 sleep |
| 環境變數 | Dashboard 設定 |

```
優點: 不會 sleep, 有 volume, 一鍵部署
缺點: 免費額度有限 ($5/月)
```

### 3.2 Render

| 項目 | 詳情 |
|------|------|
| 免費方案 | 免費 Web Service |
| 支援一鍵部署 | ✅ Deploy to Render |
| 持久儲存 | ✅ Disk ($0.25/GB/月) |
| 自訂域名 | ✅ |
| Sleep 機制 | ⚠️ 15 分鐘無活動會 sleep |
| 環境變數 | Dashboard 設定 |

```
優點: 免費方案更大方
缺點: 會 sleep (LINE Webhook 喚醒需幾秒), 排程可能受影響
```

### 3.3 Vercel (不推薦)

```
原因: Serverless 架構不適合:
- 無法持久 SQLite
- 無法運行 cron
- Function 有 10 秒超時 (AI 回應可能更久)
```

### 3.4 Fly.io (進階選項)

```
適合需要更多控制的使用者
- Docker 部署
- 永久運行
- 免費方案有限
```

## 4. 一鍵部署設計

### Railway 一鍵部署

在 `README.md` 中放置按鈕：

```markdown
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/xxx)
```

使用者流程:
1. 點擊按鈕
2. 登入 Railway (GitHub 帳號)
3. 填入 3 個環境變數
4. 點擊 Deploy
5. 等待 ~2 分鐘
6. 複製生成的 URL
7. 貼到 LINE Developer Console 的 Webhook URL

### 環境變數清單 (只需要 3 個)

```env
# LINE 設定 (從 LINE Developer Console 取得)
LINE_CHANNEL_ACCESS_TOKEN=your_token
LINE_CHANNEL_SECRET=your_secret

# Claude AI (從 Anthropic Console 取得)
ANTHROPIC_API_KEY=your_key
```

## 5. LINE Bot 設定指南

### 5.1 建立 LINE Official Account

1. 前往 [LINE Developer Console](https://developers.line.biz/)
2. 建立 Provider
3. 建立 Messaging API Channel
4. 記下 Channel Secret
5. 產生 Channel Access Token (Long-lived)

### 5.2 設定 Webhook

1. 在 Messaging API 設定中
2. Webhook URL: `https://你的應用.railway.app/webhook`
3. 開啟 Use Webhook
4. 關閉 Auto-reply messages (自動回覆)
5. 關閉 Greeting messages (問候語)

### 5.3 加入好友

- 掃描 QR Code 或搜尋 LINE ID
- 開始對話

## 6. 設定輔助工具

### 互動式設定腳本

```bash
npm run setup
```

```
🤖 LINE AI Assistant 設定精靈

Step 1/3: LINE 設定
  你有 LINE Developer 帳號了嗎？ [Y/n]
  (如果沒有，開啟 https://developers.line.biz/ 建立)

  請貼上 Channel Access Token: ****
  請貼上 Channel Secret: ****

Step 2/3: Anthropic API
  你有 Anthropic API Key 了嗎？ [Y/n]
  (如果沒有，前往 https://console.anthropic.com/)

  請貼上 API Key: ****

Step 3/3: 個人化
  你想叫你的助理什麼名字？ [預設: 小助手]
  > 阿寶

✅ 設定完成！
  本地測試: npm run dev
  部署: npm run deploy
```

## 7. 部署後驗證

### 自動健康檢查

```
GET /health → { "status": "ok", "uptime": "...", "line": "connected" }
```

### 首次互動測試

```
使用者 (LINE): 你好
AI (LINE): 你好！我是阿寶，你的 AI 助理 🙂
            我可以幫你：
            - 回答問題
            - 建立自訂技能
            - 設定定時提醒

            試試跟我說「建立一個每天早上的天氣報告」
```

## 8. 資料備份

### SQLite 備份策略

```
選項 A: Railway Volume (自動持久化)
選項 B: 定期匯出到 GitHub Gist (排程任務)
選項 C: 使用者手動下載 (提供 /backup 指令)
```

## 9. 擴展路徑

MVP 之後的部署升級路線:

```
Level 0: Railway 免費方案 (個人使用)
    ↓
Level 1: Railway 付費 ($5/月, 更多資源)
    ↓
Level 2: VPS (DigitalOcean $4/月, 完全控制)
    ↓
Level 3: 自建伺服器 (NAS/Raspberry Pi)
```

## 10. 安全考量

| 風險 | 緩解措施 |
|------|---------|
| API Key 洩漏 | 環境變數，不存入代碼 |
| LINE Webhook 偽造 | 驗證 X-Line-Signature |
| 使用者資料隔離 | userId 為 key 的目錄隔離 |
| Claude API 費用暴增 | 設定月度上限 + 每日預算 |
| 服務中斷 | 健康檢查 + 告警通知 |

## 11. 總結

最簡安裝流程:

```
1. Fork GitHub repo          (1 分鐘)
2. 點擊 Deploy to Railway    (30 秒)
3. 填入 3 個環境變數         (2 分鐘)
4. 設定 LINE Webhook URL     (1 分鐘)
5. 開始對話                  (30 秒)
────────────────────────────
總計: 約 5 分鐘
```

**不需要**: Node.js 安裝、容器、CLI 工具、本地伺服器、編寫程式碼
