# 一鍵安裝方案研究

## 1. 研究目標

評估讓使用者透過 `curl`、`npm install`、或雲端按鈕一鍵安裝 LINE AI 助理的可行性。

## 2. 安裝方法比較

### 總覽

| 方法 | 易用度 | 技術門檻 | 部署時間 | 跨平台 | 需要終端機？ |
|------|--------|---------|---------|--------|------------|
| `npx create-line-assistant` | ⭐⭐⭐⭐ | 中 (需 Node.js) | 5 分鐘 | ✅ | ✅ |
| `curl \| sh` | ⭐⭐⭐ | 中 (需終端) | 5 分鐘 | macOS/Linux | ✅ |
| Railway Deploy Button | ⭐⭐⭐⭐⭐ | 低 | 3 分鐘 | ✅ (瀏覽器) | ❌ |
| GitHub Template + Codespace | ⭐⭐⭐⭐⭐ | 低 | 3 分鐘 | ✅ (瀏覽器) | ❌ |
| Docker Compose | ⭐⭐⭐ | 中 (需 Docker) | 5 分鐘 | ✅ | ✅ |
| 手動 git clone | ⭐⭐ | 高 | 10 分鐘 | ✅ | ✅ |

## 3. 方案詳細分析

### 3.1 `npx create-line-assistant` (推薦給開發者)

#### 概念
類似 `npx create-next-app`，一行指令完成所有設定。

#### 使用者體驗
```bash
npx create-line-assistant my-bot

# 互動式設定:
✨ 歡迎使用 LINE AI 助理設定精靈！

? 你的助理叫什麼名字？ (小助手)
> 阿寶

? LINE Channel Access Token:
> ****

? LINE Channel Secret:
> ****

? Groq API Key: (免費取得: https://console.groq.com)
> ****

? 部署方式:
  ❯ Docker (推薦)
    本地開發
    部署到 Railway

📦 建立專案 my-bot/...
📥 安裝依賴...
⚙️  產生設定...
✅ 完成！

下一步:
  cd my-bot
  npm run dev      # 本地開發
  # 或
  npm run deploy   # 部署到雲端
```

#### 技術實現
```
create-line-assistant/
├── package.json          # bin: "create-line-assistant"
├── src/
│   ├── index.ts          # 主程式
│   ├── prompts.ts        # 互動式問題 (用 inquirer)
│   ├── scaffold.ts       # 複製模板檔案
│   └── templates/        # 專案模板
│       ├── package.json
│       ├── src/
│       ├── Dockerfile
│       ├── docker-compose.yml
│       └── .env.example
```

#### 優缺點
- ✅ 開發者熟悉的模式 (create-react-app)
- ✅ 互動式引導填入 API keys
- ✅ 自動產生所有檔案
- ✅ 可以選擇部署方式
- ❌ 需要已安裝 Node.js
- ❌ 需要使用終端機

### 3.2 `curl | sh` 安裝腳本

#### 使用者體驗
```bash
curl -fsSL https://raw.githubusercontent.com/你的帳號/line-assistant/main/install.sh | sh
```

#### 腳本內容
```bash
#!/bin/bash
set -e

echo "🤖 LINE AI 助理安裝程式"
echo "========================"

# 檢查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 需要 Node.js 20+. 請先安裝: https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 版本太舊 (需要 20+，你的是 v$NODE_VERSION)"
    exit 1
fi

# 下載專案
echo "📥 下載專案..."
git clone https://github.com/你的帳號/line-assistant.git
cd line-assistant

# 安裝依賴
echo "📦 安裝依賴..."
npm install

# 互動式設定
echo ""
echo "⚙️  設定 API Keys"
read -p "LINE Channel Access Token: " LINE_TOKEN
read -p "LINE Channel Secret: " LINE_SECRET
read -p "Groq API Key: " GROQ_KEY

cat > .env << EOF
LINE_CHANNEL_ACCESS_TOKEN=$LINE_TOKEN
LINE_CHANNEL_SECRET=$LINE_SECRET
GROQ_API_KEY=$GROQ_KEY
EOF

echo ""
echo "✅ 安裝完成！"
echo ""
echo "啟動方式:"
echo "  cd line-assistant"
echo "  npm run dev"
```

#### 優缺點
- ✅ 一行指令
- ✅ 自動檢查環境
- ✅ 知名模式 (Homebrew, Rust 都這樣安裝)
- ❌ 安全疑慮 (curl | sh 被認為有風險)
- ❌ 不支援 Windows (需 WSL)
- ❌ 需要 Node.js、git 預先安裝

### 3.3 Railway Deploy Button (推薦給非技術使用者)

#### 使用者體驗

README 中放置按鈕:
```markdown
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/xxx)
```

使用者流程:
1. 點擊按鈕
2. 用 GitHub 登入 Railway
3. 填入 3 個環境變數
4. 點擊 Deploy
5. 等待 ~2 分鐘
6. 複製生成的公開 URL
7. 貼到 LINE Developer Console
8. **完成！**

#### 配置檔 (railway.json)
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

#### 優缺點
- ✅ **不需要終端機、不需要 Node.js、不需要 git**
- ✅ 純瀏覽器操作
- ✅ 自動 HTTPS
- ✅ 24/7 運行
- ✅ 最簡單的方式
- ❌ Railway 免費額度有限 ($5/月)
- ❌ 需要 GitHub 帳號

### 3.4 GitHub Template + Codespace (推薦給想嘗試的使用者)

#### 使用者體驗

README 中放置按鈕:
```markdown
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/你的帳號/line-assistant)
```

使用者流程:
1. 點擊按鈕
2. GitHub 建立 Codespace (~2 分鐘)
3. 自動執行 `npm install`
4. 填入 `.env`
5. `npm run dev`
6. Port 設為 Public
7. 複製 URL 到 LINE Webhook
8. **開始測試！**

#### 優缺點
- ✅ 不需要本地安裝任何東西
- ✅ 瀏覽器即可操作
- ✅ 免費 60 小時/月
- ✅ 內建公開 HTTPS URL
- ❌ 不適合生產（閒置會停止）
- ❌ 需要 GitHub 帳號

## 4. 使用者必須手動完成的步驟

**無論哪種安裝方式，以下步驟都無法自動化：**

### 4.1 建立 LINE Official Account (必須)
1. 前往 [LINE Developer Console](https://developers.line.biz/)
2. 建立 Provider
3. 建立 Messaging API Channel
4. 取得 Channel Secret 和 Channel Access Token
5. 設定 Webhook URL
6. 關閉自動回覆和問候語

**預估時間**: 5-10 分鐘（已有 LINE 帳號的情況下）

### 4.2 取得 Groq API Key (必須)
1. 前往 [Groq Console](https://console.groq.com)
2. 註冊帳號
3. 產生 API Key

**預估時間**: 2 分鐘

### 4.3 設定 Webhook URL (必須)
1. 部署完成後取得公開 URL
2. 貼到 LINE Developer Console

**預估時間**: 1 分鐘

**總手動時間: 約 8-13 分鐘**（這是任何自動化都無法避免的最低門檻）

## 5. 推薦安裝策略

### 5.1 分層策略

```
Level 1: 非技術使用者 (最簡單)
→ Railway Deploy Button
→ 純瀏覽器操作
→ 3 分鐘部署 + 10 分鐘 LINE 設定

Level 2: 想嘗試的使用者 (免費測試)
→ GitHub Template → Codespace
→ 瀏覽器操作，可以看到代碼
→ 免費 60 小時/月

Level 3: 開發者 (最靈活)
→ npx create-line-assistant my-bot
→ 或 git clone + npm install
→ 本地開發，自由修改

Level 4: 進階使用者 (Docker 部署)
→ docker compose up
→ 適合自有伺服器
→ 最穩定
```

### 5.2 README 按鈕排列

```markdown
## 快速開始

### 一鍵部署 (推薦)
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/xxx)

### 免費測試
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/xxx)

### 命令列安裝
\```bash
npx create-line-assistant my-bot
\```

### Docker
\```bash
git clone https://github.com/xxx/line-assistant.git
cd line-assistant
docker compose up
\```
```

## 6. `npm install` 全域安裝可行嗎？

```bash
npm install -g line-assistant
line-assistant start
```

**分析**:
- ⚠️ 全域安裝 = 在使用者機器上運行伺服器
- ⚠️ 需要 Node.js 預先安裝
- ⚠️ 需要處理 HTTPS (ngrok 或類似工具)
- ⚠️ 使用者電腦關機就停止

**結論**: 不推薦。全域安裝適合 CLI 工具，不適合需要 24/7 運行的伺服器。

## 7. 結論

| 問題 | 回答 |
|------|------|
| curl 安裝可行嗎？ | ✅ 可行，但限 macOS/Linux，且需預裝 Node.js |
| npx create 可行嗎？ | ✅ **推薦給開發者**。互動式設定體驗好 |
| npm install 可行嗎？ | ⚠️ 不推薦。伺服器不適合全域安裝 |
| 最簡安裝是什麼？ | ✅ **Railway Deploy Button**。純瀏覽器，3 分鐘 |
| 免費測試最好方式？ | ✅ **GitHub Codespace**。零安裝，免費 |

### 最終推薦

**提供多種安裝方式，讓不同技術水平的使用者都能上手：**

1. **Railway Button** — 非技術使用者（純瀏覽器）
2. **Codespace Button** — 想試用的使用者（免費）
3. **`npx create-line-assistant`** — 開發者
4. **Docker Compose** — 進階使用者

## 8. 參考來源

- [npm create 文件](https://docs.npmjs.com/cli/v10/commands/npm-init)
- [Railway Deploy Button](https://docs.railway.app/guides/deploy-button)
- [GitHub Template Repos](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository)
- [GitHub Codespaces](https://github.com/features/codespaces)
- [devcontainers](https://containers.dev/)
