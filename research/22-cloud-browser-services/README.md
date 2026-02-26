# 雲端瀏覽器服務研究：Browserless vs BrowserBase

> 研究日期：2026-02-26
> 目的：為 MyClaw 選擇適合的雲端瀏覽器服務，取代 Render 上無法安裝本地 Chromium 的問題

## 背景

MyClaw 目前使用 Playwright MCP Server 以 stdio 方式啟動本地 Chromium 瀏覽器抓取網頁內容：

```env
MCP_SERVERS=[{"name":"browser","transport":{"type":"stdio","command":"npx","args":["@playwright/mcp@latest","--headless","--isolated"]}}]
```

在 Render 部署環境中無法安裝瀏覽器，需改為透過 CDP (Chrome DevTools Protocol) 連接遠端雲端瀏覽器。Playwright MCP 原生支援 `--cdp-endpoint` 參數來連接遠端瀏覽器。

---

## 1. Browserless (browserless.io)

### 免費方案

| 項目 | 內容 |
|------|------|
| **月費** | $0 |
| **月額度** | 1,000 units |
| **Unit 定義** | 每 30 秒的瀏覽器連線 = 1 unit（98% 的操作在 30 秒內完成，即 1 unit） |
| **併發數** | 最多 10 個併發瀏覽器 |
| **功能** | 全部 API endpoint、BQL 編輯器、住宅代理、自動驗證碼解決 |
| **信用卡** | 不需要 |

**實際額度估算**：1,000 units/月 = 每天約 33 次網頁操作（每次 1 unit）。MyClaw 個人使用場景每天 5-10 次網頁抓取，免費額度充足。

### 付費方案

| 方案 | 月費 | Units |
|------|------|-------|
| Starter | $50 | 更多 units |
| Scale | $200 | 更多 units + 進階功能 |

### CDP Endpoint 格式

**直接 WebSocket 連線，無需先建立 Session**：

```
wss://production-sfo.browserless.io?token=YOUR_API_TOKEN
```

認證方式：API Token 作為 URL query parameter。

### Playwright 連線範例

```typescript
import { chromium } from "playwright-core";

const browser = await chromium.connectOverCDP(
  `wss://production-sfo.browserless.io?token=${TOKEN}`
);
```

### 與 Playwright MCP 整合

**直接相容**，只需修改 `--cdp-endpoint` 參數：

```
npx @playwright/mcp@latest --cdp-endpoint wss://production-sfo.browserless.io?token=YOUR_TOKEN
```

或使用環境變數：
```env
PLAYWRIGHT_MCP_CDP_ENDPOINT=wss://production-sfo.browserless.io?token=YOUR_TOKEN
```

---

## 2. BrowserBase (browserbase.com)

### 免費方案

| 項目 | 內容 |
|------|------|
| **月費** | $0 |
| **月額度** | 1 browser hour（= 60 分鐘） |
| **併發數** | 1 個併發瀏覽器 |
| **Session 時限** | 15 分鐘 |
| **資料保留** | 7 天 |
| **專案數** | 1 個 |
| **其他** | Function deployments、Email support |

**實際額度估算**：1 小時/月 = 每天約 2 分鐘瀏覽器時間。以每次操作 30 秒計算，每天僅能執行約 4 次。個人使用偏緊。

### 付費方案

| 方案 | 月費 | Browser Hours | 併發數 |
|------|------|---------------|--------|
| Developer | $20 | 100 小時（超出 $0.12/hr） | 25 |
| Startup | $99 | 500 小時（超出 $0.10/hr） | 100 |
| Scale | 自訂 | 用量計費 | 250+ |

### CDP Endpoint 格式

**需先透過 API 建立 Session，再取得 WebSocket URL**：

```typescript
import Browserbase from "@browserbasehq/sdk";

const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
const session = await bb.sessions.create({
  projectId: process.env.BROWSERBASE_PROJECT_ID
});

// session.connectUrl 格式：wss://connect.browserbase.com?apiKey=xxx&sessionId=xxx
const browser = await chromium.connectOverCDP(session.connectUrl);
```

連線 URL 格式：`wss://connect.browserbase.com?apiKey=xxx`

### 與 Playwright MCP 整合

**無法直接使用 `--cdp-endpoint`**，因為 BrowserBase 需要先透過 REST API 建立 Session 才能取得 CDP URL。這代表：

1. 每次瀏覽器操作前需要呼叫 BrowserBase Sessions API
2. 需要額外安裝 `@browserbasehq/sdk`
3. 需要修改 `mcp-client.ts` 或寫包裝腳本來管理 Session 生命週期
4. 需要兩個環境變數（`BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID`）

---

## 3. 核心比較

| 比較項目 | Browserless | BrowserBase |
|----------|-------------|-------------|
| **免費額度** | 1,000 units/月（~33 次/天） | 1 小時/月（~4 次/天） |
| **連線方式** | 直接 WebSocket（stateless） | 需先建立 Session（stateful） |
| **CDP 格式** | `wss://production-sfo.browserless.io?token=xxx` | `wss://connect.browserbase.com?apiKey=xxx&sessionId=xxx` |
| **Playwright MCP 相容** | 原生支援 `--cdp-endpoint` | 需額外 SDK + Session 管理 |
| **額外依賴** | 無（只改設定） | `@browserbasehq/sdk` |
| **環境變數** | 1 個（`BROWSERLESS_TOKEN`） | 2 個（API_KEY + PROJECT_ID） |
| **認證方式** | Token in URL query | API Key + Session API |
| **程式碼改動** | 零改動（只改 MCP_SERVERS 設定） | 需修改 mcp-client.ts 或寫 wrapper |
| **併發數（免費）** | 10 | 1 |
| **Session 時限** | 無限制（按 30s unit 計費） | 15 分鐘 |
| **Stealth/反爬** | 免費含 CAPTCHA solving | 免費不含 Stealth Mode |
| **額外功能** | BQL 查詢語言、住宅代理 | Session replay、可觀察性 |

---

## 4. MyClaw 專案改動評估

### 方案 A：Browserless（推薦）

**改動範圍：零程式碼修改，僅改環境變數**

```env
# 舊設定（本地 Chromium）
MCP_SERVERS=[{"name":"browser","transport":{"type":"stdio","command":"npx","args":["@playwright/mcp@latest","--headless","--isolated"]}}]

# 新設定（Browserless 雲端瀏覽器）
MCP_SERVERS=[{"name":"browser","transport":{"type":"stdio","command":"npx","args":["@playwright/mcp@latest","--cdp-endpoint","wss://production-sfo.browserless.io?token=YOUR_TOKEN"]}}]
```

**需要新增的環境變數：**

| 變數 | 說明 | 範例 |
|------|------|------|
| `BROWSERLESS_TOKEN` | Browserless API Token | `br_xxx...`（從 Dashboard 取得） |

**注意**：Token 直接內嵌在 `MCP_SERVERS` JSON 的 args 中，不需要獨立的環境變數。但建議在 `.env` 中定義 `BROWSERLESS_TOKEN`，在啟動腳本中動態組合：

```env
BROWSERLESS_TOKEN=br_xxx...
MCP_SERVERS=[{"name":"browser","transport":{"type":"stdio","command":"npx","args":["@playwright/mcp@latest","--cdp-endpoint","wss://production-sfo.browserless.io?token=${BROWSERLESS_TOKEN}"]}}]
```

**不需要修改的檔案：**
- `mcp-client.ts` — 仍然是 stdio transport，Playwright MCP 內部處理 CDP 連線
- `config.ts` — 無型別變更
- `skill-executor.ts` — 無變更
- `index.ts` — 無變更

### 方案 B：BrowserBase

**改動範圍：需修改程式碼 + 新增依賴**

1. `npm install @browserbasehq/sdk`
2. 修改 `mcp-client.ts` 或新增 `browserbase-wrapper.ts`
3. 在每次啟動 Playwright MCP 前，先呼叫 BrowserBase API 建立 Session
4. 將 `session.connectUrl` 傳給 Playwright MCP 的 `--cdp-endpoint`
5. Session 有 15 分鐘限制，需處理 Session 過期和重建邏輯

**需要新增的環境變數：**

| 變數 | 說明 |
|------|------|
| `BROWSERBASE_API_KEY` | API Key |
| `BROWSERBASE_PROJECT_ID` | 專案 ID |

---

## 5. 結論與建議

### 推薦：Browserless

**Browserless 是 MyClaw 的最佳選擇，理由如下：**

1. **零程式碼改動**：只需修改 `MCP_SERVERS` 環境變數，將 `--headless --isolated` 改為 `--cdp-endpoint wss://...`
2. **免費額度充足**：1,000 units/月，個人使用（每天 5-10 次網頁操作）完全足夠
3. **原生 Playwright MCP 相容**：`--cdp-endpoint` 參數直接支援 Browserless 的 WebSocket URL
4. **Stateless 連線**：無需管理 Session 生命週期，每次操作直接連線
5. **無額外依賴**：不需要安裝任何新的 npm package
6. **免費含 CAPTCHA solving**：BrowserBase 免費方案不含此功能

### 不推薦 BrowserBase 的理由

1. **免費額度太少**：僅 1 小時/月，每天約 4 次操作，不夠個人使用
2. **Session 管理複雜**：需先建立 Session 再連線，增加程式碼複雜度
3. **需修改程式碼**：無法僅靠環境變數切換，需要新增 SDK 依賴和 Session 管理邏輯
4. **15 分鐘 Session 限制**：需處理 Session 過期重建
5. **併發數僅 1**：免費方案只能同時一個瀏覽器

### 成本效益分析

| 場景 | Browserless | BrowserBase |
|------|-------------|-------------|
| 免費（個人使用） | 1,000 units/月 (~33 次/天) | 1 小時/月 (~4 次/天) |
| 輕度付費 | $50/月（Starter） | $20/月（Developer, 100 hr） |
| 中度付費 | $200/月（Scale） | $99/月（Startup, 500 hr） |

**個人使用結論**：Browserless 免費方案足夠，不需要付費。BrowserBase 免費方案太少，大概率需要付費到 $20/月。

### 實施步驟（Browserless）

1. 到 [browserless.io](https://www.browserless.io) 註冊帳號（免費，不需信用卡）
2. 從 Dashboard 取得 API Token
3. 修改 Render 的 `MCP_SERVERS` 環境變數：

```env
MCP_SERVERS=[{"name":"browser","transport":{"type":"stdio","command":"npx","args":["@playwright/mcp@latest","--cdp-endpoint","wss://production-sfo.browserless.io?token=YOUR_TOKEN"]}}]
```

4. 重新部署，完成

---

## 參考資料

- [Browserless Pricing](https://www.browserless.io/pricing)
- [Browserless Connection URLs](https://docs.browserless.io/overview/connection-urls)
- [Browserless Playwright Connection](https://docs.browserless.io/baas/connect-playwright)
- [BrowserBase Pricing](https://www.browserbase.com/pricing)
- [BrowserBase Playwright Integration](https://docs.browserbase.com/introduction/playwright)
- [Playwright MCP GitHub](https://github.com/microsoft/playwright-mcp)
- [Playwright MCP npm](https://www.npmjs.com/package/@playwright/mcp)
