# Supabase 適用性評估報告

## 執行摘要

本報告評估 Supabase 是否適用於 MyClaw 專案，分析目前 SQLite 架構的問題、Supabase 提供的價值、以及成本效益。

**結論**：對於目前的 MyClaw 專案規模，**維持 SQLite + 定期備份策略為最佳選擇**。Supabase 的價值在於 PostgreSQL 持久化和 Auth，但 500MB 限制和遷移成本使其不適合現階段。

---

## 1. 目前 SQLite 架構分析

### 1.1 技術選型

| 元件 | 選擇 | 用途 |
|------|------|------|
| 資料庫 | better-sqlite3 | 本地 SQLite 檔案 |
| 儲存位置 | `./data/myclaw.db` | 本地檔案系統 |
| 部署平台 | Render Free Tier | 免費託管 |

### 1.2 資料表結構

目前資料庫包含以下表格：

- `users` - 使用者資料（含 credentials JSON）
- `skills` - 技能設定（含 api_config JSON）
- `messages` - 對話紀錄
- `scheduled_tasks` - 排程任務
- `code_snippets` - 代碼片段

### 1.3 SQLite 優點

| 優點 | 說明 |
|------|------|
| **零配置** | 無需資料庫伺服器設定 |
| **單一檔案** | 備份只需複製一個 .db 檔案 |
| **高效讀取** | better-sqlite3 提供極速查詢 |
| **WAL 模式** | 支援併發讀寫 |
| **無網路延遲** | 本地檔案存取 |
| **免費** | 無額外成本 |

### 1.4 SQLite 缺點

| 缺點 | 說明 |
|------|------|
| **Render Free Tier 不持久** | 每次部署/重啟資料重置 |
| **無水平擴展** | 單機限制 |
| **無內建複製** | 需手動備份 |
| **無即時訂閱** | 需輪詢實現即時功能 |

---

## 2. Render Free Tier 資料遺失問題分析

### 2.1 問題根源

根據 [Render 官方文件](https://render.com/docs/free)，Free Web Services 具有**臨時檔案系統（Ephemeral Filesystem）**：

> "Any changes to your web service's filesystem (uploaded images, local SQLite databases, etc.) are lost every time the service redeploys, restarts, or spins down."

### 2.2 觸發資料遺失的情境

| 情境 | 頻率 | 影響 |
|------|------|------|
| 新部署（git push）| 每次 | 資料重置 |
| 手動重啟 | 偶發 | 資料重置 |
| 15分鐘無流量自動休眠 | 頻繁 | 資料重置 |
| 服務崩潰重啟 | 偶發 | 資料重置 |

### 2.3 目前影響評估

**MyClaw 資料特性**：

- 使用者建立的技能（JSON 設定）
- 使用者記憶（Markdown 格式）
- 對話歷史（可選保留）
- 代碼片段（可選保留）

**影響嚴重度**：**中等**
- 技能遺失 = 需要重新建立
- 使用者記憶遺失 = 個人化體驗重置
- 對話歷史遺失 = 上下文遺失

---

## 3. Supabase 功能價值分析

### 3.1 Supabase Free Tier 限制

根據 [Supabase 官方文件](https://supabase.com/docs/guides/functions/pricing)：

| 資源 | Free Tier 限制 |
|------|---------------|
| **資料庫大小** | 500 MB |
| **儲存空間** | 1 GB |
| **資料庫流量（Egress）** | 5 GB/月 |
| **Auth MAU** | 50,000 |
| **Edge Function 呼叫** | 500,000/月 |
| **即時訊息** | 200 萬/月 |
| **即時連線數** | 200 峰值 |
| **專案數** | 2 個 |
| **休眠政策** | 7 天無活動自動暫停 |

### 3.2 各功能對 MyClaw 的價值

#### PostgreSQL 資料庫

| 面向 | 評估 |
|------|------|
| **持久化** | 解決 Render 資料遺失問題 |
| **500MB 限制** | 對於個人 AI 助理足夠（估計可支援 1000+ 使用者）|
| **遷移成本** | 需重寫所有 SQL（SQLite → PostgreSQL 語法差異）|
| **連線延遲** | 增加網路延遲（相較本地 SQLite）|
| **價值評級** | ⭐⭐⭐⭐ 高 |

#### 即時訂閱（Realtime）

| 面向 | 評估 |
|------|------|
| **功能** | WebSocket 監聽資料庫變更 |
| **MyClaw 需求** | 目前無即時同步需求 |
| **可能應用** | 多裝置同步使用者記憶 |
| **價值評級** | ⭐⭐ 低（現階段不需要）|

#### Auth 認證

| 面向 | 評估 |
|------|------|
| **功能** | 使用者註冊/登入、JWT、OAuth |
| **MyClaw 架構** | 使用 LINE/Telegram 平台認證 |
| **需求匹配** | 低，已有平台整合 |
| **價值評級** | ⭐ 無需使用 |

#### Storage 檔案儲存

| 面向 | 評估 |
|------|------|
| **功能** | 檔案上傳/下載 |
| **MyClaw 需求** | 目前無檔案儲存需求 |
| **可能應用** | 儲存使用者上傳的圖片 |
| **價值評級** | ⭐⭐ 低（現階段不需要）|

#### Edge Functions

| 面向 | 評估 |
|------|------|
| **功能** | Deno 執行環境，類似 Cloudflare Workers |
| **MyClaw 架構** | 已使用 Express.js + node-cron |
| **需求匹配** | 低，現有架構已滿足 |
| **價值評級** | ⭐ 無需使用 |

### 3.3 功能價值總結

| 功能 | 對 MyClaw 價值 | 必要性 |
|------|---------------|--------|
| PostgreSQL | 高 | 解決資料持久化問題 |
| 即時訂閱 | 低 | 非必要 |
| Auth | 無 | 已有 LINE/Telegram 認證 |
| Storage | 低 | 非必要 |
| Edge Functions | 無 | 已有 Express 伺服器 |

---

## 4. 技能與代碼持久化必要性分析

### 4.1 資料分類

| 資料類型 | 重要性 | 遺失影響 | 持久化需求 |
|----------|--------|----------|-----------|
| **使用者技能** | 高 | 需重新建立技能 | 必須 |
| **使用者記憶** | 高 | 個人化體驗重置 | 必須 |
| **平台憑證** | 高 | 需重新設定 | 必須 |
| **代碼片段** | 中 | 需重新生成 | 建議 |
| **對話歷史** | 低 | 僅影響短期上下文 | 可選 |

### 4.2 使用者體驗影響

**資料遺失情境**：

```
使用者花了 30 分鐘建立 5 個技能
→ Render 自動休眠
→ 下次使用時所有技能消失
→ 使用者體驗極差，可能放棄使用
```

**結論**：技能和記憶的持久化對於產品可用性至關重要。

---

## 5. 解決方案比較

### 5.1 方案一：維持現狀 + 定期備份

**實作方式**：
- 使用 GitHub Actions 定期備份 SQLite 檔案
- 或手動下載備份

| 優點 | 缺點 |
|------|------|
| 免費 | 資料可能遺失（備份間隔期間）|
| 簡單 | 需要手動還原 |
| 無需改程式碼 | 不適合生產環境 |

**適用情境**：開發/測試階段

### 5.2 方案二：Supabase PostgreSQL

**實作方式**：
- 遷移至 Supabase PostgreSQL
- 重寫所有 SQL 查詢

| 優點 | 缺點 |
|------|------|
| 資料持久化 | 500MB 限制 |
| 自動備份（7天快照）| 7天無活動自動暫停 |
| 專業資料庫功能 | 需重寫程式碼 |
| 免費 | 網路延遲 |

**適用情境**：需要持久化的生產環境

### 5.3 方案三：Litestream + S3

**實作方式**：
- 使用 Litestream 持續複製 SQLite 到 S3
- 啟動時從 S3 還原

| 優點 | 缺點 |
|------|------|
| 保留 SQLite 簡單性 | 需要 AWS S3（有成本）|
| 即時備份 | 設定較複雜 |
| 低成本（S3 儲存便宜）| 啟動時需下載還原 |

**適用情境**：需要 SQLite 簡單性 + 持久化

### 5.4 方案四：Render Disk（付費）

**實作方式**：
- 升級至 Render Starter Plan（$7/月）
- 附加 Persistent Disk

| 優點 | 缺點 |
|------|------|
| 最小改動 | 需付費 |
| 保留 SQLite | 僅有 0.5GB 空間 |
| 資料持久化 | |

**適用情境**：願意付費保留現有架構

### 5.5 方案比較總結

| 方案 | 成本 | 持久化 | 開發成本 | 適用階段 |
|------|------|--------|----------|----------|
| 現狀 + 備份 | 免費 | 部分 | 低 | 開發/測試 |
| Supabase | 免費 | 完整 | 高 | 生產 |
| Litestream | 低 | 完整 | 中 | 生產 |
| Render Disk | $7/月 | 完整 | 低 | 生產 |

---

## 6. 成本效益分析

### 6.1 目前成本

| 項目 | 成本 |
|------|------|
| Render Free Tier | $0 |
| SQLite | $0 |
| **總計** | **$0/月** |

### 6.2 Supabase Free Tier 成本

| 項目 | 成本 |
|------|------|
| Supabase Free Tier | $0 |
| 限制 | 500MB, 7天暫停政策 |
| **總計** | **$0/月** |

### 6.3 付費方案比較

| 方案 | 月費 | 儲存 | 特點 |
|------|------|------|------|
| Supabase Pro | $25 | 8GB | 不停機、每日備份 |
| Render Starter + Disk | $7 | 0.5GB | 簡單、最小改動 |
| AWS S3 + Litestream | ~$1 | 無限 | 技術複雜 |

### 6.4 成本效益評估

**現階段（< 100 使用者）**：
- SQLite + 定期備份足夠
- 無需額外成本

**成長階段（100-1000 使用者）**：
- Supabase Free Tier 500MB 可能足夠
- 或 Render Disk $7/月

**規模化（> 1000 使用者）**：
- 需要 Supabase Pro 或自建資料庫

---

## 7. 風險評估

### 7.1 Supabase Free Tier 風險

| 風險 | 影響 | 機率 |
|------|------|------|
| 7天無活動暫停 | 服務中斷，需手動恢復 | 高（個人專案）|
| 500MB 滿了 | 無法寫入新資料 | 中（長期使用）|
| IPv4 不可用 | 部分網路環境無法連線 | 低 |

### 7.2 維持現狀風險

| 風險 | 影響 | 機率 |
|------|------|------|
| 資料遺失 | 使用者技能消失 | 高（Render 休眠）|
| 使用者流失 | 體驗差導致放棄 | 中 |

---

## 8. 建議

### 8.1 短期建議（現在）

**維持 SQLite + 實作備份策略**：

1. **GitHub Actions 自動備份**：每日將 SQLite 檔案上傳至 GitHub Artifacts
2. **技能匯出功能**：讓使用者可以匯出/匯入技能 JSON
3. **文件說明**：清楚告知使用者 Render Free Tier 的限制

### 8.2 中期建議（使用者成長後）

**遷移至 Supabase 或 Render Disk**：

- 當有活躍使用者時，升級至 Render Starter（$7/月）最簡單
- 或遷移至 Supabase Free Tier（需注意 7天暫停政策）

### 8.3 長期建議（規模化）

**Supabase Pro 或自建**：

- Supabase Pro（$25/月）提供 8GB 和不停機保證
- 或自建 PostgreSQL 在 VPS 上

---

## 9. 結論

### 9.1 Supabase 適用性評級

| 面向 | 評級 | 說明 |
|------|------|------|
| **功能匹配度** | 60% | 僅 PostgreSQL 有用，其他功能不需要 |
| **成本效益** | 高 | Free Tier 足夠初期使用 |
| **遷移成本** | 高 | 需重寫所有資料庫程式碼 |
| **風險** | 中 | 7天暫停政策對個人專案不利 |

### 9.2 最終建議

**現階段不建議遷移至 Supabase**，原因：

1. **遷移成本高**：需重寫所有 SQL 和資料庫邏輯
2. **功能重疊低**：Supabase 大部分功能（Auth、Storage、Edge Functions）MyClaw 不需要
3. **7天暫停風險**：個人專案可能因無流量被暫停
4. **目前規模小**：SQLite 足以應對

**建議路線圖**：

```
現在：SQLite + GitHub Actions 備份
      ↓
成長期：Render Starter ($7/月) + Persistent Disk
      ↓
規模化：Supabase Pro ($25/月) 或自建 PostgreSQL
```

---

## 參考資料

1. [Render Free Tier Documentation](https://render.com/docs/free)
2. [Supabase Pricing Documentation](https://supabase.com/docs/guides/functions/pricing)
3. [Supabase Realtime Pricing](https://supabase.com/docs/guides/realtime/pricing)
4. [Supabase Org-based Billing](https://supabase.com/docs/guides/platform/org-based-billing)
