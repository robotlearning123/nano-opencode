import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { Session, Message } from './types.js';

const DATA_DIR = join(homedir(), '.config', 'nano-opencode');
const DB_PATH = join(DATA_DIR, 'sessions.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }

    db = new Database(DB_PATH);

    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_calls TEXT,
        tool_results TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
    `);
  }

  return db;
}

export function createSession(title?: string): Session {
  const database = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO sessions (id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(id, title || 'New Session', now, now);

  return {
    id,
    title: title || 'New Session',
    messages: [],
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

export function getSession(id: string): Session | null {
  const database = getDb();

  const row = database.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
  } | undefined;

  if (!row) return null;

  const messages = database
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY id')
    .all(id) as Array<{
    role: string;
    content: string;
    tool_calls: string | null;
    tool_results: string | null;
  }>;

  return {
    id: row.id,
    title: row.title,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    messages: messages.map((m) => ({
      role: m.role as Message['role'],
      content: m.content,
      toolCalls: m.tool_calls ? JSON.parse(m.tool_calls) : undefined,
      toolResults: m.tool_results ? JSON.parse(m.tool_results) : undefined,
    })),
  };
}

export function listSessions(limit = 20): Session[] {
  const database = getDb();

  const rows = database
    .prepare('SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?')
    .all(limit) as Array<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    messages: [],
  }));
}

export function addMessage(sessionId: string, message: Message): void {
  const database = getDb();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO messages (session_id, role, content, tool_calls, tool_results, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    message.role,
    message.content,
    message.toolCalls ? JSON.stringify(message.toolCalls) : null,
    message.toolResults ? JSON.stringify(message.toolResults) : null,
    now
  );

  database.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);
}

export function updateSessionTitle(sessionId: string, title: string): void {
  const database = getDb();
  database.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, sessionId);
}

export function deleteSession(sessionId: string): void {
  const database = getDb();
  database.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
  database.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
