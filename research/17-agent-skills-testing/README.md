# Round 8 研究：Agent Skills 功能測試與架構可行性分析

> 日期：2026-02-08
> 測試團隊：skill-tester / debug-analyst / arch-evaluator

---

## 一、技能匯入/刪除功能測試

### 匯入流程 — 基本正常

| 環節 | 狀態 | 說明 |
|------|------|------|
| GitHub URL 偵測 | OK | `isSkillImportIntent()` 支援 URL + 安裝關鍵字，或 URL 路徑含 "skill" |
| URL 解析 + SKILL.md 抓取 | OK | `parseGitHubUrl()` + `fetchSkillContent()` 支援多候選檔案 |
| AI 格式轉換 | OK | `CONVERT_SKILL_TOOL` schema 提取 name/description/trigger/api_config |
| api_config 提取 | OK | 有條件檢查 base_url + auth，純文字技能不需要 api_config |
| 安全檢查 | 有問題 | 17 種危險模式掃描，但 safe=false 時不阻擋匯入，只顯示 warnings |
| DB 儲存 | OK | `createSkill()` 正確序列化 api_config 為 JSON |

### 匯入問題清單

| # | 優先級 | 問題 | 說明 |
|---|--------|------|------|
| P6 | **高** | 缺少技能更新功能 | 沒有 `updateSkill()`，使用者只能「刪除→重建」 |
| P7 | **高** | 重複匯入無防護 | 同一 URL 可重複建立同名技能，無唯一性檢查 |
| P3 | **中** | 匯入無預覽確認 | PLAN.md 規劃的「使用者確認後儲存」未實作 |
| P2 | **中** | 安全檢查未阻擋 | `safe=false` 仍允許匯入 |
| P1 | **低** | URL 偵測保守 | 不含 "skill" 的 URL 不觸發匯入 |

### 刪除功能 — 正常

- `deleteSkill()` 正確先刪 `scheduled_tasks` 再刪 skill
- `extractSkillName()` 能正確提取技能名稱
- 缺少二次確認步驟（直接刪除）

### 更新功能 — 完全缺失

- 整個 codebase 沒有 `updateSkill()` 函式
- 使用者只能刪除後重新匯入

### api_config 鏈路 — 端到端完整

匯入提取 → DB 儲存 → 查詢 → 解析 → 執行，全部正確串接。

---

## 二、AI 造假資料根因分析

### tool_choice 傳遞路徑 — 正確

- `config.ts:109` — `ChatOptions.toolChoice` 定義
- `skill-executor.ts:121` — 第一次呼叫 `toolChoice: 'any'`
- `llm.ts:183-187` — Claude: `tool_choice: {type: 'any'}`
- `llm.ts:398-402` — Groq: `tool_choice: 'required'`

### 五個根本原因

| 排名 | 根因 | 影響範圍 | 嚴重度 |
|------|------|----------|--------|
| 1 | **A: 無 api_config 的技能完全沒有工具** | 所有用戶自建技能 | **致命** |
| 2 | **C: System prompt 禁止造假指示僅在 hasTools=true 時出現** | 所有技能 | **高** |
| 3 | B: parseApiConfig 靜默失敗，畸形 JSON 降級為無工具 | 匯入的技能 | **中** |
| 4 | D: Groq tool_choice='required' 不可靠 (Qwen3 ~90-95%) | Groq 模式 | **中** |
| 5 | E: API 錯誤後 AI 可能在後續輪次編造回覆 | 有工具的技能 | **低** |

### 根因 A 詳解（最重要）

```
技能沒有 api_config → parseApiConfig 回傳 null
→ toolDefs 為空陣列 → hasTools = false
→ chat() 完全沒有 tools 也沒有 toolChoice
→ AI 無法呼叫 API → 只能用想像力編造資料
→ 而且 system prompt 中的「不要造假」指示也不會出現（只在 hasTools=true 時才加入）
```

**關鍵問題**：用戶自建的技能不會有 api_config（只有 GitHub 匯入的技能才有），所以「用戶透過 LINE 對話建立的技能」幾乎都是「無工具技能」→ 100% 會造假。

### 根因 C 詳解

`buildSkillSystemPrompt()` 中：
```ts
if (hasTools) {
  parts.push('- 必須使用 api_call 工具呼叫真實 API...');
}
```
無工具時，AI 完全沒有「不要造假」的指示。

### 建議修復

1. **P0**：`buildSkillSystemPrompt` 中無論 hasTools 為何，都加入「不要編造虛構數據，如果無法取得真實資料，誠實告知用戶」
2. **P0**：無 api_config 且 prompt 提及 API 的技能，system prompt 明確告知 AI「你無法存取任何外部 API」
3. **P1**：API 呼叫失敗後加入更強指示「請如實回報錯誤，不要猜測或編造資料」
4. **P2**：parseApiConfig 失敗時加入更明顯的日誌/警告

---

## 三、Agent Skills 動態架構可行性評估

### 結論：有條件可行（Conditionally Feasible）

Phase 2 重構已完成，`tool-registry.ts` 和 `erp-client.ts` 已移除。目前架構已經是動態的：

```
SKILL.md 匯入 → AI 提取 api_config (base_url + auth)
             → SKILL.md 全文存為 skill.prompt
             → 執行時：AI 讀取 prompt → 自行決定 api_call(method, path, body)
             → http-executor 自動處理 base_url 拼接和認證
```

### 架構優勢

1. **極簡工具 schema** — `api_call` 只有 3 個參數 (method/path/body)，大幅降低出錯機率
2. **認證自動處理** — AI 不需理解認證流程，http-executor 自動處理
3. **base_url 鎖定** — 匯入時固定，執行時 AI 只能指定 path，安全性好
4. **SKILL.md 全文保留** — AI 有完整上下文做決策
5. **toolChoice: 'any' 防造假** — 首次呼叫強制使用工具

### LLM 能力比較

| LLM | Tool Calling 可靠性 | api_call 表現 |
|-----|--------------------|----|
| Claude Haiku 4.5 | ~99% | 精準填入 method/path/body |
| Claude Sonnet 4.5 | ~99% | 同上，複雜場景更好 |
| Groq Qwen3 32B | ~90-95% | 偶爾 JSON 格式問題 |
| Groq Kimi K2 | ~90-95% | Tool Call ID 偶有問題 |

### 可行的前提條件

1. SKILL.md 必須包含清晰的 API 文件（endpoint URL、method、parameters）
2. Claude 模式成功率極高；Groq 免費模型需接受 5-10% 失敗率
3. 適合 RESTful JSON API + 簡單認證，不適合 OAuth2 redirect、WebSocket
4. SKILL.md 來源需可信（GitHub 公開 repo）

### 需要改善的項目

| 優先 | 項目 | 工作量 |
|------|------|--------|
| P0 | API 回傳 response truncation (5000 字元) | ~10 行 |
| P0 | path 參數驗證（禁止 `/../`、絕對 URL） | ~15 行 |
| P1 | 無 api_config 技能的防造假 system prompt | ~10 行 |
| P1 | Tool calling 失敗的 graceful fallback | ~20 行 |
| P2 | 支援 Basic Auth | ~20 行 |
| P2 | Credential 加密儲存 | ~40 行 |

---

## 四、總結

### 回答使用者的三個問題

**Q1: 匯入/刪除技能功能是否正常？**
- 匯入：基本正常，但缺少預覽確認和重複防護
- 刪除：正常
- 更新：完全缺失（需新增）

**Q2: AI 是否確實調用技能並按真實數據回覆？**
- 有 api_config 的技能：toolChoice 機制有效，會強制呼叫 API
- 無 api_config 的技能（用戶自建）：**會造假**，因為根本沒有工具可用
- 根本修復：強化 system prompt + 區分「有 API」和「純 prompt」技能

**Q3: 完全透過 Agent Skills 動態呼叫 API 是否可行？**
- **可行**，Phase 2 架構已實現
- 匯入任何新 SKILL.md 不需要寫程式碼
- 前提：SKILL.md 品質好 + 使用 Claude 模型成功率高
- 需要改善：response truncation、path 驗證、防造假 prompt
