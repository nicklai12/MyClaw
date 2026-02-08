# GitHub Codespaces + Docker 測試環境研究

## 1. 研究目標

評估能否使用 GitHub Codespaces 進行 MVP 測試，以及 Docker 容器化是否能簡化部署流程。

## 2. GitHub Codespaces 免費方案

### 2.1 免費額度

| 項目 | 免費額度 |
|------|---------|
| 計算時間 | **120 core-hours/月** |
| 儲存空間 | **15 GB/月** |
| 換算 (2-core) | **60 小時/月** (每天 ~2 小時) |
| 換算 (4-core) | 30 小時/月 |
| 超出費用 | $0.18/hr (2-core) |

### 2.2 規格

| 項目 | 詳情 |
|------|------|
| CPU | 2-core ~ 32-core 可選 |
| RAM | 8 GB (2-core) |
| 儲存 | 32 GB SSD (預設) |
| OS | Ubuntu Linux |
| Docker | ✅ 支持 |
| Node.js | ✅ 預裝 |

### 2.3 Port Forwarding（關鍵功能）

**LINE Webhook 測試的核心問題**: 能否從外部存取 Codespace 中的伺服器？

| 可見性 | 說明 | 適合 Webhook? |
|--------|------|-------------|
| Private | 只有你能存取（需登入 GitHub） | ❌ LINE 無法存取 |
| Organization | 組織成員可存取 | ❌ LINE 無法存取 |
| **Public** | **任何人可存取，有公開 HTTPS URL** | ✅ **LINE Webhook 可用!** |

**設定方式**:
1. Codespace 中啟動 Express 伺服器 (port 3000)
2. 在 Ports 面板中找到 3000 port
3. 右鍵 → Port Visibility → **Public**
4. 取得公開 URL: `https://{codespace-name}-3000.app.github.dev`
5. 將此 URL 設為 LINE Webhook URL

### 2.4 資料持久化

| 情況 | 資料保留？ |
|------|-----------|
| Codespace 執行中 | ✅ 完全保留 |
| Codespace 停止 (Stop) | ✅ 保留（儲存在磁碟中） |
| Codespace 刪除 (Delete) | ❌ 所有資料遺失 |
| 超過 30 天未使用 | ⚠️ 自動刪除（可設定） |

**SQLite 資料**: 在 Codespace 停止/重啟之間會保留，只要不刪除 Codespace 即可。

### 2.5 Codespace 適合 MVP 測試嗎？ ✅ YES

**優點**:
- 免費 60 小時/月，足夠 MVP 開發和測試
- 公開 Port Forwarding → LINE Webhook 可直接存取
- 自動 HTTPS（LINE 要求 HTTPS）
- 預裝 Node.js、Docker、git
- 環境一致（Ubuntu Linux）
- 停止後資料保留

**缺點**:
- 不是 24/7 運行（閒置會自動停止）
- 只適合開發和測試，不適合生產
- 60 小時/月限制（每天約 2 小時）
- 公開 URL 每次啟動會變

**結論**: **非常適合 MVP 開發和測試**。搭配公開 Port Forwarding，可以直接測試 LINE Webhook。

## 3. Docker 容器化分析

### 3.1 最小 Dockerfile

```dockerfile
FROM node:22-slim

WORKDIR /app

# 安裝依賴
COPY package*.json ./
RUN npm ci --production

# 複製源碼
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

# 持久化目錄
VOLUME ["/app/data", "/app/users"]

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### 3.2 Docker Compose

```yaml
version: '3.8'
services:
  bot:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - bot-data:/app/data      # SQLite + 狀態
      - bot-users:/app/users    # 使用者記憶
    environment:
      - LINE_CHANNEL_ACCESS_TOKEN=${LINE_CHANNEL_ACCESS_TOKEN}
      - LINE_CHANNEL_SECRET=${LINE_CHANNEL_SECRET}
      - GROQ_API_KEY=${GROQ_API_KEY}
    restart: unless-stopped

volumes:
  bot-data:
  bot-users:
```

### 3.3 Docker vs Bare Metal 比較

| 方面 | Bare Metal (npm) | Docker |
|------|-----------------|--------|
| **安裝步驟** | `git clone` + `npm install` | `docker compose up` |
| **依賴管理** | 需要 Node.js 20+, npm | 只需要 Docker |
| **環境一致性** | ⚠️ 依賴系統環境 | ✅ 完全一致 |
| **SQLite 持久化** | ✅ 本地檔案 | ✅ Docker Volume |
| **Port 管理** | 直接使用 | 需要 port mapping |
| **啟動命令** | `npm start` | `docker compose up -d` |
| **更新** | `git pull && npm install` | `docker compose pull && up -d` |
| **隔離性** | ❌ 共享系統環境 | ✅ 完全隔離 |
| **跨平台** | ⚠️ 可能有差異 | ✅ 到處都一樣 |
| **資源佔用** | 低 | 中（Docker overhead） |

### 3.4 Docker 簡化了什麼？

**簡化**:
- ✅ 不需要管 Node.js 版本
- ✅ `docker compose up` 一鍵啟動
- ✅ 環境完全一致，不會有「我電腦上可以跑」的問題
- ✅ Volume 自動處理資料持久化
- ✅ `restart: unless-stopped` 自動重啟

**沒有簡化**:
- ❌ 仍然需要設定環境變數（API keys）
- ❌ 仍然需要公開 HTTPS URL
- ❌ Docker 本身需要安裝
- ❌ 非技術使用者可能不會用 Docker

## 4. Codespace + Docker 組合

### 4.1 devcontainer.json

```json
{
  "name": "LINE AI Assistant",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:22",
  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {}
  },
  "forwardPorts": [3000],
  "postCreateCommand": "npm install",
  "customizations": {
    "vscode": {
      "extensions": ["dbaeumer.vscode-eslint"]
    }
  }
}
```

### 4.2 開發工作流

```
1. 使用者點擊 "Open in Codespace" 按鈕
   ↓
2. GitHub 自動建立 Codespace (2 分鐘)
   ↓
3. devcontainer 自動安裝依賴
   ↓
4. 使用者填入 .env (3 個變數)
   ↓
5. npm run dev 或 docker compose up
   ↓
6. Port 3000 設為 Public
   ↓
7. 複製公開 URL 到 LINE Webhook 設定
   ↓
8. 開始測試！
```

### 4.3 Codespace 內是否該用 Docker?

| 場景 | 建議 | 原因 |
|------|------|------|
| MVP 開發 | ❌ 不用 Docker | Codespace 就是 Linux，直接 `npm run dev` 更簡單 |
| 測試 Docker 部署 | ✅ 用 Docker | 確認 Docker 配置正確 |
| 多服務 (DB + App) | ✅ 用 Docker Compose | 方便管理多服務 |

**推薦**: MVP 階段在 Codespace 內直接用 `npm run dev`，Docker 留給部署階段。

## 5. 完整比較表

| 方面 | Bare Metal | Docker | Codespace | Codespace + Docker |
|------|-----------|--------|-----------|-------------------|
| **安裝時間** | 5-10 分鐘 | 3-5 分鐘 | 2-3 分鐘 | 3-5 分鐘 |
| **需要安裝** | Node.js, npm, git | Docker | 無（瀏覽器即可） | 無 |
| **資料持久化** | ✅ 本地 | ✅ Volume | ✅ Codespace 存活期間 | ✅ 同左 |
| **Webhook 測試** | 需要 ngrok | 需要 ngrok | ✅ **公開 URL 內建** | ✅ 同左 |
| **免費** | ✅ | ✅ | ✅ (60hr/月) | ✅ (60hr/月) |
| **跨平台** | ⚠️ | ✅ | ✅ (瀏覽器) | ✅ |
| **適合分享** | ❌ | ⚠️ | ✅ Template 按鈕 | ✅ |
| **適合生產** | ⚠️ | ✅ | ❌ | ❌ |

## 6. 推薦方案

### MVP 開發測試: Codespace (直接 npm)

```
GitHub Template Repo → "Open in Codespace" → npm install → 填 .env → npm run dev → 公開 Port → LINE Webhook 設定完成
```

- 零安裝（純瀏覽器）
- 內建公開 HTTPS URL
- 免費 60 小時/月

### 正式部署: Docker + Railway/Render

```
docker compose up → 設定環境變數 → 公開 URL → LINE Webhook
```

- 環境一致
- 持久化資料
- 24/7 運行

## 7. 結論

| 問題 | 回答 |
|------|------|
| Codespace 能用來測試 MVP 嗎？ | ✅ **非常適合**。公開 Port Forwarding 解決 Webhook 問題。 |
| Docker 容器化比較簡單嗎？ | ✅ **是的**。`docker compose up` 比手動安裝 Node.js 簡單。 |
| MVP 階段建議用哪個？ | **Codespace** (開發) + **Docker** (部署) |
| 使用者體驗最好的方案？ | GitHub Template → "Open in Codespace" → 3 分鐘開始測試 |

## 8. 參考來源

- [GitHub Codespaces 計費](https://docs.github.com/billing/managing-billing-for-github-codespaces/about-billing-for-github-codespaces)
- [Codespaces Port Forwarding](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace)
- [GitHub Codespaces 功能頁](https://github.com/features/codespaces)
- [devcontainers 規格](https://containers.dev/)
