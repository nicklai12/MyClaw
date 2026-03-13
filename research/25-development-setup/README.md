# 開發環境設定架構

本文檔說明 MyClaw 專案中三個容器設定檔的分工與關係。

## 三個設定檔的比較

| 檔案 | 主要用途 | 管轄範圍 | 使用時機 |
|------|---------|---------|---------|
| **devcontainer.json** | VS Code / GitHub Codespaces 的開發容器設定 | IDE 整合、擴充套件、端口轉發、post-create 指令 | 在 Codespaces 或 VS Code Dev Containers 中開發 |
| **Dockerfile** | 定義容器映像檔的建置步驟 | 作業系統、套件安裝、環境變數、使用者權限 | 建構生產環境映像檔或本地 Docker 運行 |
| **docker-compose.yml** | 定義多容器服務的編排 | 多個容器如何連線、網路、Volume 掛載、環境變數注入 | 本地開發或生產部署需要多服務協作時 |

## 詳細職責

### devcontainer.json

負責開發體驗的設定：

- **基底映像檔**：使用 `mcr.microsoft.com/devcontainers/typescript-node:20`（官方 TypeScript 開發映像檔）
- **功能擴充**：啟用 `docker-in-docker`，讓開發容器內可以執行 Docker 命令
- **端口轉發**：自動將容器內的 3000 port 轉發到本地
- **VS Code 整合**：預裝 ESLint、Prettier、Docker 等擴充套件
- **Post-create 指令**：容器建立後自動執行 `npm install`

**使用場景**：GitHub Codespaces、VS Code Remote Development

### Dockerfile

負責應用程式容器的建置：

- **多階段建構**：編譯階段與執行階段分離，減少映像檔體積
- **安全性**：使用非 root 使用者（`appuser`）運行應用程式
- **健康檢查**：每 30 秒檢查 `/health` 端點
- **資源限制**：設定 CPU 與記憶體限制

**使用場景**：生產環境部署、本地 Docker 運行

### docker-compose.yml

負責多服務編排：

- **服務定義**：定義 app 服務的建置方式、環境變數、Volume 掛載
- **自動重啟**：設定除手動停止外自動重啟
- **日誌輪替**：設定單檔 10MB，保留 3 個歷史檔案
- **Volume 掛載**：掛載 `./data` 到容器內的 `/app/data`，確保 SQLite 資料庫持久化

**使用場景**：本地開發需要持久化資料、生產環境部署（如 Render）

## 關係圖

```
開發環境層級
├── devcontainer.json（Codespaces/VS Code 開發環境）
│       └── 使用官方 TypeScript 開發映像檔
│       └── 啟用 docker-in-docker 功能
│               └── 可在容器內執行 docker compose
│
├── Dockerfile（應用程式映像檔定義）
│       └── 定義如何建置 MyClaw 應用容器
│       └── 多階段建構、非 root 使用者、健康檢查
│
└── docker-compose.yml（多服務編排）
        └── 使用 Dockerfile 建置 app 服務
        └── 設定 Volume、網路、重啟策略
```

## 使用方式對照

### 情境一：GitHub Codespaces 開發

```bash
# 在 Codespaces 中，devcontainer 已自動建立
# 直接啟動開發伺服器即可
npm run dev
```

**不需要執行 `docker compose up`**，因為 devcontainer 本身已經提供完整的 Node.js 開發環境。

### 情境二：本地開發（使用 Docker）

```bash
# 使用 docker compose 啟動完整環境
docker compose up -d --build

# 查看日誌
docker compose logs -f app

# 停止服務
docker compose down
```

### 情境三：生產部署（如 Render）

使用 `docker-compose.yml` 中的設定，透過 Render 的 Docker 部署功能直接部署。

## 常見問題

### Q: devcontainer rebuild 成功後，才能使用 docker compose 嗎？

**A:** 不完全正確。兩者是獨立的：

- **devcontainer rebuild** 建立的是**開發環境容器**（基於 `mcr.microsoft.com/devcontainers/typescript-node:20`）
- **docker compose up** 建立的是**應用程式容器**（基於專案的 `Dockerfile`）

因為 devcontainer 啟用了 `docker-in-docker` 功能，所以你可以在 devcontainer **內部**執行 `docker compose` 命令。但這通常是多餘的，因為 devcontainer 本身已經可以直接運行 `npm run dev`。

### Q: 為什麼需要三個不同的設定檔？

**A:** 三個檔案服務於不同的目的：

1. **devcontainer.json** 專注於**開發體驗**（IDE 整合、工具安裝）
2. **Dockerfile** 專注於**應用程式建置**（最小化映像檔、安全性）
3. **docker-compose.yml** 專注於**服務編排**（多容器、Volume、網路）

### Q: 可以直接修改 devcontainer.json 使用專案的 Dockerfile 嗎？

**A:** 可以，但通常不建議。專案的 Dockerfile 是為生產環境優化的（多階段建構、非 root 使用者），而 devcontainer 使用官方開發映像檔是為了提供完整的開發工具鏈（如 git、zsh、common utilities）。

如果確實需要修改，可以將 `devcontainer.json` 中的 `image` 改為 `build.dockerfile`：

```json
{
  "build": {
    "dockerfile": "Dockerfile"
  }
}
```

但這會失去官方開發映像檔預裝的許多開發工具。
