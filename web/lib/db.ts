import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import { Idea, IdeaStatus, VALID_STATUSES } from "./types";

// The database file. Defaults to web/data/cspot.db, but can be overridden via
// CSPOT_DB_PATH so the Python scripts can later share the same database.
const DB_PATH =
  process.env.CSPOT_DB_PATH || path.join(process.cwd(), "data", "cspot.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS ideas (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'to_start',
      notes           TEXT NOT NULL DEFAULT '',
      inspiration_url TEXT NOT NULL DEFAULT '',
      record_date     TEXT,
      edit_date       TEXT,
      post_date       TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

export interface IdeaInput {
  title: string;
  status?: IdeaStatus;
  notes?: string;
  inspiration_url?: string;
}

export function getIdeas(): Idea[] {
  return getDb()
    .prepare("SELECT * FROM ideas ORDER BY created_at DESC, id DESC")
    .all() as Idea[];
}

export function getIdea(id: number): Idea | undefined {
  return getDb().prepare("SELECT * FROM ideas WHERE id = ?").get(id) as
    | Idea
    | undefined;
}

export function createIdea(input: IdeaInput): Idea {
  const status =
    input.status && VALID_STATUSES.includes(input.status)
      ? input.status
      : "to_start";
  const info = getDb()
    .prepare(
      `INSERT INTO ideas (title, status, notes, inspiration_url)
       VALUES (@title, @status, @notes, @inspiration_url)`,
    )
    .run({
      title: input.title,
      status,
      notes: input.notes ?? "",
      inspiration_url: input.inspiration_url ?? "",
    });
  return getIdea(Number(info.lastInsertRowid))!;
}

export function updateIdea(
  id: number,
  fields: Partial<IdeaInput>,
): Idea | undefined {
  const existing = getIdea(id);
  if (!existing) return undefined;

  const allowed: (keyof IdeaInput)[] = [
    "title",
    "status",
    "notes",
    "inspiration_url",
  ];
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };

  for (const key of allowed) {
    const value = fields[key];
    if (value === undefined) continue;
    if (key === "status" && !VALID_STATUSES.includes(value as IdeaStatus)) {
      continue;
    }
    sets.push(`${key} = @${key}`);
    params[key] = value;
  }

  if (sets.length === 0) return existing;

  sets.push("updated_at = datetime('now')");
  getDb()
    .prepare(`UPDATE ideas SET ${sets.join(", ")} WHERE id = @id`)
    .run(params);
  return getIdea(id);
}

export function deleteIdea(id: number): boolean {
  const info = getDb().prepare("DELETE FROM ideas WHERE id = ?").run(id);
  return info.changes > 0;
}
