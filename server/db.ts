import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type {
  AnswerEvaluation,
  AnswerMetrics,
  AuthUser,
  FeedbackData,
  InterviewConfig,
  InterviewDetail,
  InterviewMode,
  InterviewSummary,
  JobRole,
  Message,
} from "@shared/schema";
import { config } from "./config";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS interviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  mode TEXT NOT NULL,
  interview_type TEXT NOT NULL,
  config_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  overall_score REAL,
  report_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_interviews_user ON interviews(user_id, started_at DESC);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_interview ON messages(interview_id, seq);
CREATE TABLE IF NOT EXISTS turns (
  interview_id TEXT NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  evaluation_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  PRIMARY KEY (interview_id, idx)
);
`;

let instance: Database.Database | undefined;

export function getDb(): Database.Database {
  if (instance) return instance;
  if (config.DATABASE_PATH !== ":memory:") fs.mkdirSync(path.dirname(config.DATABASE_PATH), { recursive: true });
  instance = new Database(config.DATABASE_PATH);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.exec(SCHEMA);
  return instance;
}

export function closeDb(): void {
  instance?.close();
  instance = undefined;
}

// ---------- users and auth sessions ----------
export type UserRow = AuthUser & { passwordHash: string; salt: string };

export const users = {
  create(user: UserRow): void {
    getDb()
      .prepare("INSERT INTO users (id, name, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(user.id, user.name, user.email, user.passwordHash, user.salt, new Date().toISOString());
  },
  byEmail(email: string): UserRow | undefined {
    const r = getDb().prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    return r && { id: r.id, name: r.name, email: r.email, passwordHash: r.password_hash, salt: r.salt };
  },
  byToken(tokenHash: string): AuthUser | undefined {
    return getDb()
      .prepare(
        `SELECT u.id, u.name, u.email FROM auth_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(tokenHash, Date.now()) as AuthUser | undefined;
  },
};

export const authSessions = {
  create(tokenHash: string, userId: string, expiresAt: number): void {
    getDb().prepare("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(tokenHash, userId, expiresAt);
  },
  delete(tokenHash: string): void {
    getDb().prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(tokenHash);
  },
};

// ---------- interviews ----------
type InterviewRow = {
  id: string; user_id: string; role: JobRole; mode: InterviewMode; interview_type: InterviewSummary["interviewType"];
  config_json: string; status: InterviewSummary["status"]; started_at: string; ended_at: string | null;
  overall_score: number | null; report_json: string | null; answers?: number;
};

function toSummary(r: InterviewRow): InterviewSummary {
  const end = r.ended_at ? new Date(r.ended_at).getTime() : Date.now();
  return {
    id: r.id,
    role: r.role,
    mode: r.mode,
    interviewType: r.interview_type,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSeconds: Math.max(0, Math.round((end - new Date(r.started_at).getTime()) / 1000)),
    answers: r.answers ?? 0,
    overallScore: r.overall_score,
  };
}

const LIST_SQL = `SELECT i.*, (SELECT COUNT(*) FROM turns t WHERE t.interview_id = i.id) AS answers FROM interviews i`;

export const interviews = {
  create(i: { id: string; userId: string; role: JobRole; mode: InterviewMode; config: InterviewConfig }): void {
    getDb()
      .prepare("INSERT INTO interviews (id, user_id, role, mode, interview_type, config_json, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(i.id, i.userId, i.role, i.mode, i.config.interviewType, JSON.stringify(i.config), new Date().toISOString());
  },

  setRole(id: string, role: JobRole): void {
    getDb().prepare("UPDATE interviews SET role = ? WHERE id = ?").run(role, id);
  },

  complete(id: string, report: FeedbackData): void {
    const score = report.note ? null : report.overallScore;
    getDb()
      .prepare("UPDATE interviews SET status = 'completed', ended_at = ?, overall_score = ?, report_json = ? WHERE id = ?")
      .run(new Date().toISOString(), score, JSON.stringify(report), id);
  },

  saveReport(id: string, report: FeedbackData): void {
    getDb().prepare("UPDATE interviews SET report_json = ?, overall_score = ? WHERE id = ?").run(JSON.stringify(report), report.note ? null : report.overallScore, id);
  },

  abandonStale(userId: string, exceptId?: string): void {
    getDb()
      .prepare("UPDATE interviews SET status = 'abandoned', ended_at = ? WHERE user_id = ? AND status = 'active' AND id != ?")
      .run(new Date().toISOString(), userId, exceptId ?? "");
  },

  list(userId: string, limit = 100): InterviewSummary[] {
    const rows = getDb().prepare(`${LIST_SQL} WHERE i.user_id = ? ORDER BY i.started_at DESC LIMIT ?`).all(userId, limit) as InterviewRow[];
    return rows.map(toSummary);
  },

  get(userId: string, id: string): InterviewDetail | undefined {
    const row = getDb().prepare(`${LIST_SQL} WHERE i.id = ? AND i.user_id = ?`).get(id, userId) as InterviewRow | undefined;
    if (!row) return undefined;
    return {
      ...toSummary(row),
      config: JSON.parse(row.config_json),
      messages: messages.list(id),
      report: row.report_json ? JSON.parse(row.report_json) : null,
    };
  },

  remove(userId: string, id: string): boolean {
    return getDb().prepare("DELETE FROM interviews WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
  },

  /** Reports of completed, scored interviews, newest first. Used for the dashboard and focus areas. */
  reports(userId: string, limit = 50): { id: string; date: string; report: FeedbackData }[] {
    const rows = getDb()
      .prepare("SELECT id, ended_at, report_json FROM interviews WHERE user_id = ? AND status = 'completed' AND overall_score IS NOT NULL ORDER BY ended_at DESC LIMIT ?")
      .all(userId, limit) as { id: string; ended_at: string; report_json: string }[];
    return rows.map((r) => ({ id: r.id, date: r.ended_at, report: JSON.parse(r.report_json) }));
  },
};

// ---------- messages and turns ----------
export const messages = {
  add(interviewId: string, m: Message): void {
    const seq = (getDb().prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM messages WHERE interview_id = ?").get(interviewId) as { n: number }).n;
    getDb()
      .prepare("INSERT INTO messages (id, interview_id, seq, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(m.id, interviewId, seq, m.role, m.content, new Date(m.timestamp).toISOString());
  },
  list(interviewId: string): Message[] {
    const rows = getDb().prepare("SELECT id, role, content, created_at FROM messages WHERE interview_id = ? ORDER BY seq").all(interviewId) as any[];
    return rows.map((r) => ({ id: r.id, role: r.role, content: r.content, timestamp: r.created_at }));
  },
};

export type TurnRow = { question: string; answer: string; evaluation: AnswerEvaluation; metrics: AnswerMetrics };

export const turns = {
  add(interviewId: string, idx: number, t: TurnRow): void {
    getDb()
      .prepare("INSERT OR REPLACE INTO turns (interview_id, idx, question, answer, evaluation_json, metrics_json) VALUES (?, ?, ?, ?, ?, ?)")
      .run(interviewId, idx, t.question, t.answer, JSON.stringify(t.evaluation), JSON.stringify(t.metrics));
  },
  list(interviewId: string): TurnRow[] {
    const rows = getDb().prepare("SELECT * FROM turns WHERE interview_id = ? ORDER BY idx").all(interviewId) as any[];
    return rows.map((r) => ({ question: r.question, answer: r.answer, evaluation: JSON.parse(r.evaluation_json), metrics: JSON.parse(r.metrics_json) }));
  },
};
