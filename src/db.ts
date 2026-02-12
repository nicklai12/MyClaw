import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import type {
  User,
  Skill,
  Message,
  ScheduledTask,
  SkillCreateRequest,
  SourceType,
} from './config.js';

// ============================================
// 模組狀態
// ============================================

let db: Database.Database;

// ============================================
// 初始化
// ============================================

export function initDB(dbPath: string = './data/myclaw.db'): void {
  // 確保目錄存在
  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);

  // 開啟 WAL 模式（更好的併發讀寫效能）
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();

  console.log(`[db] SQLite 資料庫已初始化: ${dbPath}`);
  console.log('[db] WAL 模式已啟用');
}

// ============================================
// Schema 建立
// ============================================

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line_user_id TEXT UNIQUE NOT NULL,
      display_name TEXT DEFAULT '',
      memory_md TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      trigger_type TEXT NOT NULL,
      trigger_value TEXT DEFAULT '',
      prompt TEXT NOT NULL,
      tools TEXT DEFAULT '[]',
      enabled INTEGER DEFAULT 1,
      source_type TEXT DEFAULT 'user_created',
      source_url TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      cron_expression TEXT NOT NULL,
      next_run TEXT DEFAULT '',
      last_run TEXT DEFAULT '',
      enabled INTEGER DEFAULT 1,
      FOREIGN KEY (skill_id) REFERENCES skills(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // 為已存在的 users 表新增 credentials 欄位（SQLite 不支援 IF NOT EXISTS for columns）
  try {
    db.exec(`ALTER TABLE users ADD COLUMN credentials TEXT DEFAULT '{}'`);
    console.log('[db] 已新增 users.credentials 欄位');
  } catch {
    // 欄位已存在，忽略
  }

  // 為已存在的 skills 表新增 api_config 欄位（動態 API 設定）
  try {
    db.exec(`ALTER TABLE skills ADD COLUMN api_config TEXT DEFAULT ''`);
    console.log('[db] 已新增 skills.api_config 欄位');
  } catch {
    // 欄位已存在，忽略
  }

  // 多平台支援：新增 platform 和 platform_user_id 欄位
  try {
    db.exec(`ALTER TABLE users ADD COLUMN platform TEXT DEFAULT 'line'`);
    console.log('[db] 已新增 users.platform 欄位');
  } catch {
    // 欄位已存在，忽略
  }

  try {
    db.exec(`ALTER TABLE users ADD COLUMN platform_user_id TEXT DEFAULT ''`);
    console.log('[db] 已新增 users.platform_user_id 欄位');
  } catch {
    // 欄位已存在，忽略
  }

  // Backfill：將現有 LINE 使用者的 platform_user_id 設為 line_user_id
  db.exec(`UPDATE users SET platform_user_id = line_user_id WHERE platform_user_id = ''`);

  console.log('[db] 資料表已就緒 (users, skills, messages, scheduled_tasks)');
}

// ============================================
// Users CRUD
// ============================================

export function getOrCreateUser(platformUserId: string, platform: string = 'line', displayName?: string): User {
  // 先用 platform + platform_user_id 查詢
  let existing = db.prepare(
    'SELECT * FROM users WHERE platform = ? AND platform_user_id = ?'
  ).get(platform, platformUserId) as User | undefined;

  // LINE 向後相容：也查 line_user_id
  if (!existing && platform === 'line') {
    existing = db.prepare(
      'SELECT * FROM users WHERE line_user_id = ?'
    ).get(platformUserId) as User | undefined;
  }

  if (existing) {
    // 若有提供新的 displayName 且與現有不同，更新之
    if (displayName && displayName !== existing.display_name) {
      db.prepare(
        "UPDATE users SET display_name = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(displayName, existing.id);
      existing.display_name = displayName;
    }
    return existing;
  }

  const lineUserId = platform === 'line' ? platformUserId : '';
  const result = db.prepare(
    'INSERT INTO users (line_user_id, display_name, platform, platform_user_id) VALUES (?, ?, ?, ?)'
  ).run(lineUserId, displayName || '', platform, platformUserId);

  const newUser = db.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).get(result.lastInsertRowid) as User;

  console.log(`[db] 新使用者已建立: ${platform}:${platformUserId} (id=${newUser.id})`);
  return newUser;
}

/**
 * 根據平台和平台使用者 ID 查詢使用者（供 scheduler 使用）
 */
export function getUserByPlatformId(platform: string, platformUserId: string): User | undefined {
  return db.prepare(
    'SELECT * FROM users WHERE platform = ? AND platform_user_id = ?'
  ).get(platform, platformUserId) as User | undefined;
}

export function getUserById(userId: number): User | undefined {
  return db.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).get(userId) as User | undefined;
}

export function updateUserMemory(userId: number, memoryMd: string): void {
  db.prepare(
    "UPDATE users SET memory_md = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(memoryMd, userId);
}

// ============================================
// Skills CRUD
// ============================================

export function createSkill(
  userId: number,
  skill: SkillCreateRequest,
  sourceType: SourceType = 'user_created',
  sourceUrl: string = ''
): Skill {
  const toolsJson = JSON.stringify(skill.tools || []);
  const apiConfigJson = skill.api_config ? JSON.stringify(skill.api_config) : '';

  const result = db.prepare(`
    INSERT INTO skills (user_id, name, description, trigger_type, trigger_value, prompt, tools, api_config, source_type, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    skill.name,
    skill.description,
    skill.trigger.type,
    skill.trigger.value,
    skill.prompt,
    toolsJson,
    apiConfigJson,
    sourceType,
    sourceUrl
  );

  const newSkill = db.prepare(
    'SELECT * FROM skills WHERE id = ?'
  ).get(result.lastInsertRowid) as Skill;

  console.log(`[db] 技能已建立: "${skill.name}" (id=${newSkill.id}, user=${userId}, hasApiConfig=${!!apiConfigJson})`);
  return newSkill;
}

export function getUserSkills(userId: number): Skill[] {
  return db.prepare(
    'SELECT * FROM skills WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId) as Skill[];
}

export function getEnabledSkills(userId: number): Skill[] {
  return db.prepare(
    'SELECT * FROM skills WHERE user_id = ? AND enabled = 1 ORDER BY created_at DESC'
  ).all(userId) as Skill[];
}

export function toggleSkill(skillId: number, enabled: boolean): void {
  db.prepare(
    'UPDATE skills SET enabled = ? WHERE id = ?'
  ).run(enabled ? 1 : 0, skillId);
}

export function deleteSkill(skillId: number): void {
  // 一併刪除關聯的排程任務
  db.prepare('DELETE FROM scheduled_tasks WHERE skill_id = ?').run(skillId);
  db.prepare('DELETE FROM skills WHERE id = ?').run(skillId);
  console.log(`[db] 技能已刪除: id=${skillId}`);
}

/**
 * 根據 source_url 查詢使用者的技能（用於重複匯入偵測）
 */
export function findSkillBySourceUrl(userId: number, sourceUrl: string): Skill | null {
  if (!sourceUrl) return null;
  const row = db.prepare(
    'SELECT * FROM skills WHERE user_id = ? AND source_url = ?'
  ).get(userId, sourceUrl) as Skill | undefined;
  return row || null;
}

/**
 * 更新已存在的技能（用於重複匯入時覆蓋舊版本）
 */
export function updateSkill(
  skillId: number,
  skill: SkillCreateRequest
): Skill {
  const toolsJson = JSON.stringify(skill.tools || []);
  const apiConfigJson = skill.api_config ? JSON.stringify(skill.api_config) : '';

  db.prepare(`
    UPDATE skills SET
      name = ?, description = ?, trigger_type = ?, trigger_value = ?,
      prompt = ?, tools = ?, api_config = ?
    WHERE id = ?
  `).run(
    skill.name,
    skill.description,
    skill.trigger.type,
    skill.trigger.value,
    skill.prompt,
    toolsJson,
    apiConfigJson,
    skillId
  );

  const updated = db.prepare(
    'SELECT * FROM skills WHERE id = ?'
  ).get(skillId) as Skill;

  console.log(`[db] 技能已更新: "${skill.name}" (id=${skillId}, hasApiConfig=${!!apiConfigJson})`);
  return updated;
}

// ============================================
// Messages CRUD
// ============================================

export function saveMessage(userId: number, role: 'user' | 'assistant', content: string): void {
  db.prepare(
    'INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)'
  ).run(userId, role, content);
}

export function getRecentMessages(userId: number, limit: number = 10): Message[] {
  // 取最近的 N 筆訊息，以時間正序排列（舊→新）
  return db.prepare(`
    SELECT * FROM (
      SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
    ) sub ORDER BY created_at ASC
  `).all(userId, limit) as Message[];
}

// ============================================
// Scheduled Tasks CRUD
// ============================================

export function createScheduledTask(
  skillId: number,
  userId: number,
  cronExpression: string
): ScheduledTask {
  const result = db.prepare(
    'INSERT INTO scheduled_tasks (skill_id, user_id, cron_expression) VALUES (?, ?, ?)'
  ).run(skillId, userId, cronExpression);

  const task = db.prepare(
    'SELECT * FROM scheduled_tasks WHERE id = ?'
  ).get(result.lastInsertRowid) as ScheduledTask;

  console.log(`[db] 排程任務已建立: id=${task.id}, cron="${cronExpression}", skill=${skillId}`);
  return task;
}

export function getActiveScheduledTasks(): ScheduledTask[] {
  return db.prepare(
    'SELECT * FROM scheduled_tasks WHERE enabled = 1'
  ).all() as ScheduledTask[];
}

export function updateLastRun(taskId: number): void {
  db.prepare(
    "UPDATE scheduled_tasks SET last_run = datetime('now') WHERE id = ?"
  ).run(taskId);
}

// ============================================
// Credentials CRUD
// ============================================

/**
 * 取得使用者的某個服務憑證
 * credentials JSON 格式：{"erp": {"username": "xxx", "password": "yyy"}, ...}
 */
export function getUserCredentials(userId: number, service: string): Record<string, string> | null {
  const row = db.prepare(
    'SELECT credentials FROM users WHERE id = ?'
  ).get(userId) as { credentials: string } | undefined;

  if (!row) return null;

  try {
    const allCreds = JSON.parse(row.credentials || '{}') as Record<string, Record<string, string>>;
    return allCreds[service] || null;
  } catch {
    return null;
  }
}

/**
 * 儲存使用者的某個服務憑證
 */
export function saveUserCredentials(userId: number, service: string, creds: Record<string, string>): void {
  const row = db.prepare(
    'SELECT credentials FROM users WHERE id = ?'
  ).get(userId) as { credentials: string } | undefined;

  let allCreds: Record<string, Record<string, string>> = {};
  if (row) {
    try {
      allCreds = JSON.parse(row.credentials || '{}') as Record<string, Record<string, string>>;
    } catch {
      allCreds = {};
    }
  }

  allCreds[service] = creds;

  db.prepare(
    "UPDATE users SET credentials = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(allCreds), userId);

  console.log(`[db] 使用者 ${userId} 的 ${service} 憑證已儲存`);
}
