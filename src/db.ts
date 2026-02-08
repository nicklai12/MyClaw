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

  console.log('[db] 資料表已就緒 (users, skills, messages, scheduled_tasks)');
}

// ============================================
// Users CRUD
// ============================================

export function getOrCreateUser(lineUserId: string, displayName?: string): User {
  const existing = db.prepare(
    'SELECT * FROM users WHERE line_user_id = ?'
  ).get(lineUserId) as User | undefined;

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

  const result = db.prepare(
    'INSERT INTO users (line_user_id, display_name) VALUES (?, ?)'
  ).run(lineUserId, displayName || '');

  const newUser = db.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).get(result.lastInsertRowid) as User;

  console.log(`[db] 新使用者已建立: ${lineUserId} (id=${newUser.id})`);
  return newUser;
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

  const result = db.prepare(`
    INSERT INTO skills (user_id, name, description, trigger_type, trigger_value, prompt, tools, source_type, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    skill.name,
    skill.description,
    skill.trigger.type,
    skill.trigger.value,
    skill.prompt,
    toolsJson,
    sourceType,
    sourceUrl
  );

  const newSkill = db.prepare(
    'SELECT * FROM skills WHERE id = ?'
  ).get(result.lastInsertRowid) as Skill;

  console.log(`[db] 技能已建立: "${skill.name}" (id=${newSkill.id}, user=${userId})`);
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
