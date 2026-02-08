# 免費部署平台可行性研究：Vercel vs Render

## 1. 研究目標

評估不需要容器層的 LINE AI 助理能否部署在 Vercel 或 Render 的免費方案上。

### 應用需求
- Express.js HTTP 伺服器 (LINE Webhook)
- SQLite 持久化資料儲存
- node-cron 排程任務 (定時技能)
- 使用者記憶檔案管理
- LLM API 呼叫 (可能需要 10-30 秒等待)

---

## 2. Vercel 免費方案 (Hobby Plan)

### 2.1 核心規格

| 項目 | 免費方案限制 |
|------|------------|
| Function 執行時間 | 預設 300 秒 (Fluid Compute) |
| 記憶體 | 2 GB / 1 vCPU |
| Function 調用次數 | 包含在免費額度內 |
| 頻寬 | 100 GB/月 |
| 請求 Body 大小 | 4.5 MB |
| Bundle 大小 | 250 MB |
| 檔案描述符 | 1,024 (共享) |
| 費用計算 | Active CPU time + Provisioned memory time |

### 2.2 架構適配分析

#### ❌ SQLite 持久化
- Vercel 是 **Serverless** 架構，檔案系統是 **唯讀的**
- SQLite (`better-sqlite3`) **無法使用**
- 每次 Function 調用都是全新環境，本地檔案不會保留

**替代方案**:
| 替代 | 免費額度 | 適合度 |
|------|---------|--------|
| Vercel Postgres | ❌ 已停用 (Sunset) |  |
| Neon Postgres | 免費 0.5GB | ⚠️ 需改寫 SQLite → Postgres |
| Turso (SQLite-over-HTTP) | 免費 500 DB, 9GB | ✅ 保持 SQLite 語法 |
| Upstash Redis | 免費 10K commands/日 | ⚠️ 不適合關係型資料 |

#### ❌ Cron 排程任務
- Vercel 有 [Vercel Cron](https://vercel.com/docs/cron-jobs)
- 免費方案: 每日 1 次 cron 執行
- Pro 方案: 每小時 1 次
- **完全不夠**：我們需要每分鐘檢查排程任務

#### ⚠️ LINE Webhook 處理
- Function 最大 300 秒執行時間 → 足夠等待 LLM 回應
- 但 Serverless **冷啟動** 可能需要 1-3 秒
- LINE Reply Token 有效期足夠（以分鐘計）

#### ❌ 使用者記憶檔案
- 唯讀檔案系統，無法寫入 memory.md
- 需要改用資料庫儲存記憶內容

#### ❌ Always-On 程序
- Vercel 是 request-driven，不支持持續運行的程序
- 沒有 WebSocket、沒有背景程序

### 2.3 Vercel 可行性判定: ❌ 不推薦

| 需求 | 支援 | 備註 |
|------|------|------|
| LINE Webhook | ⚠️ 可用 | 冷啟動有延遲 |
| SQLite | ❌ | 需改用 Turso/Neon |
| Cron 排程 | ❌ | 免費方案每日只能 1 次 |
| 檔案記憶 | ❌ | 唯讀檔案系統 |
| Always-On | ❌ | Serverless 架構不支持 |

**核心問題**: Vercel 的 Serverless 架構從根本上不適合這類需要持續運行、有狀態的聊天機器人。需要大幅改寫架構（SQLite → 雲端 DB、檔案 → DB、cron → 外部排程服務），失去了「少代碼、簡易」的目標。

---

## 3. Render 免費方案

### 3.1 核心規格

| 項目 | 免費方案限制 |
|------|------------|
| 服務類型 | Web Service (Node.js, Python 等) |
| 休眠機制 | **15 分鐘無流量自動休眠** |
| 喚醒時間 | 最多 ~1 分鐘 |
| 每月實例時間 | 750 小時 (≈31 天持續運行) |
| 持久磁碟 | ❌ 免費方案不支持 |
| HTTPS | ✅ 自動提供 |
| 自訂域名 | ✅ |
| Postgres | ✅ 免費 1 個 (但 **30 天後過期刪除**) |
| Redis/KV | ✅ 免費 1 個 (重啟後資料遺失) |
| 自動部署 | ✅ 從 GitHub 自動部署 |

### 3.2 架構適配分析

#### ❌ SQLite 持久化
- 免費方案 **無持久磁碟**
- 每次重啟、重新部署或休眠喚醒後，**檔案系統全部重置**
- SQLite 資料庫會 **遺失所有資料**

**替代方案**:
| 替代 | 免費額度 | 問題 |
|------|---------|------|
| Render Postgres | 免費 1 個 | ⚠️ **30 天後自動刪除！** |
| Turso (外部) | 免費 500 DB | ✅ 持久化 + SQLite 語法 |
| Neon Postgres | 免費 0.5GB | ✅ 持久化 |
| Supabase | 免費 500MB | ✅ 持久化 |

#### ⚠️ 休眠問題
- **15 分鐘無流量 → 自動休眠**
- 休眠後收到 Webhook → 需要 **30-60 秒** 喚醒
- LINE Webhook 在這段時間內可能超時 (LINE 等待回應超時通常是 1 分鐘)

**緩解方案**:
1. 外部 UptimeRobot 每 5 分鐘 ping → 保持喚醒
2. 先回覆「處理中...」→ 之後用 Push Message 發送結果
3. Cron-job.org 每 10 分鐘定時請求

#### ⚠️ Cron 排程
- 作為 Always-On 程序（不休眠時），`node-cron` **可以正常運作**
- 但如果服務休眠了，cron 就停了
- 需要外部 cron 服務配合 (如 cron-job.org)

#### ❌ 使用者記憶檔案
- 無持久磁碟 = 檔案在重啟後遺失
- 必須改用資料庫存記憶

#### ⚠️ Postgres 30 天限制
- Render 免費 Postgres **30 天後自動刪除**
- 有 14 天寬限期
- 可以每 30 天重新建立，但使用者資料會遺失
- **不適合生產使用**

### 3.3 Render 可行性判定: ⚠️ 有條件可行

| 需求 | 支援 | 備註 |
|------|------|------|
| LINE Webhook | ⚠️ | 休眠喚醒延遲是問題 |
| SQLite | ❌ | 需改用外部 DB |
| Cron 排程 | ⚠️ | 不休眠時可用，需外部保活 |
| 檔案記憶 | ❌ | 需改用 DB |
| Always-On | ⚠️ | 需要保活策略 |

---

## 4. 正面對決：Vercel vs Render

| 項目 | Vercel (免費) | Render (免費) |
|------|-------------|--------------|
| **架構** | Serverless (無狀態) | Always-On (有狀態，會休眠) |
| **SQLite** | ❌ 完全不行 | ❌ 無持久磁碟 |
| **Express.js** | ⚠️ 需要 adapter | ✅ 原生支持 |
| **Cron** | ❌ 免費僅 1次/天 | ⚠️ 需保活 |
| **Webhook 可靠性** | ⚠️ 冷啟動 1-3 秒 | ⚠️ 休眠喚醒 30-60 秒 |
| **持久儲存** | ❌ 需外部 DB | ❌ 需外部 DB |
| **LLM 等待** | ✅ 300 秒超時 | ✅ 無限制 |
| **適合度** | ❌ 不適合 | ⚠️ 勉強可以 |

### 判定結果

**Vercel: ❌ 不推薦** — Serverless 架構根本不適合有狀態的聊天機器人。

**Render: ⚠️ 勉強可行但有重大妥協** — 休眠問題、無持久磁碟、Postgres 30 天過期。

---

## 5. 更好的免費/超低成本替代方案

### 5.1 Railway (推薦 #1)

| 項目 | 詳情 |
|------|------|
| 免費額度 | $5/月 credit (Trial) |
| 休眠 | ❌ 不休眠 |
| SQLite | ✅ 支持 Volume 持久化 |
| Cron | ✅ 進程持續運行 |
| 部署 | ✅ 一鍵 Deploy Button |
| 限制 | Trial 結束後需付費 ($5/月起) |

### 5.2 Fly.io (推薦 #2)

| 項目 | 詳情 |
|------|------|
| 免費額度 | 3 shared-cpu VMs, 256MB RAM |
| 休眠 | 可配置自動停機 |
| SQLite | ✅ LiteFS 分散式 SQLite |
| Cron | ✅ 進程持續運行 |
| 部署 | Docker 或 Buildpacks |
| 限制 | 免費方案規格較小 |

### 5.3 Deno Deploy (替代方案)

| 項目 | 詳情 |
|------|------|
| 免費額度 | 1M requests/月, 100 GiB 傳輸 |
| 休眠 | Serverless (類似 Vercel) |
| SQLite | ❌ (可用 Deno KV) |
| 適合度 | ⚠️ 需要改用 Deno 生態 |

### 5.4 Zeabur (台灣友善)

| 項目 | 詳情 |
|------|------|
| 免費額度 | 有免費方案 |
| 休眠 | 依方案 |
| 地區 | 有亞洲節點 |
| 適合度 | ⚠️ 較新的平台 |

## 6. 如果堅持用 Render 的方案

如果一定要用 Render 免費方案，需要以下調整：

### 6.1 架構調整

```
原始設計:
Express + SQLite(本地) + node-cron + 本地檔案
    ↓
Render 版本:
Express + Turso(外部SQLite) + 外部Cron保活 + DB存記憶
```

### 6.2 必要改動

1. **SQLite → Turso**: 使用 [Turso](https://turso.tech) 提供的 SQLite-over-HTTP
   - 免費: 500 databases, 9GB storage
   - API 幾乎和 `better-sqlite3` 一樣

2. **檔案記憶 → DB**: `memory.md` 內容存到 DB 的 text 欄位

3. **保活策略**: 用免費的 [UptimeRobot](https://uptimerobot.com/) 每 5 分鐘 ping

4. **Webhook 處理**: 收到 webhook 先立即回 200，異步處理再用 Push Message 回覆

### 6.3 代碼量影響

| 方案 | 預估代碼量 | 額外複雜度 |
|------|-----------|-----------|
| 原始設計 (Railway) | ~800 行 | 低 |
| Render 調整版 | ~1,000 行 | 中 (外部 DB 連線, 保活邏輯) |
| Vercel 調整版 | ~1,200 行 | 高 (全面重構) |

## 7. 最終推薦

### 最佳方案 (推薦): Railway

```
成本: $0-5/月
優點: SQLite 直接用、不休眠、一鍵部署
缺點: Trial 期結束後需 $5/月
```

### 純免費方案: Render + Turso + UptimeRobot

```
成本: $0/月
優點: 完全免費
缺點: 需要外部 DB (Turso)、需要保活、休眠喚醒有延遲
```

### 不推薦: Vercel

```
原因: Serverless 架構不適合、需要大幅重構、Cron 限制嚴格
```

## 8. 結論

| 問題 | 回答 |
|------|------|
| Vercel 免費能用嗎？ | ❌ **不推薦**。Serverless 架構不適合有狀態聊天機器人。 |
| Render 免費能用嗎？ | ⚠️ **勉強可以**，但需要外部 DB + 保活策略 + 接受休眠延遲。 |
| 有更好的選擇嗎？ | ✅ **Railway** ($0-5/月) 是最佳平衡點。 |
| 完全免費可能嗎？ | ✅ **Render + Turso + UptimeRobot** 可以做到 $0，但有妥協。 |

## 9. 參考來源

- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations)
- [Vercel Limits](https://vercel.com/docs/limits)
- [Render Free Tier](https://render.com/docs/free)
- [Render Persistent Disks](https://render.com/docs/disks)
- [Turso Pricing](https://turso.tech/pricing)
- [Railway Pricing](https://railway.app/pricing)
- [Fly.io Pricing](https://fly.io/docs/about/pricing/)
