import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import {
  CalendarEvent,
  Collaboration,
  CollabStatus,
  EventType,
  Idea,
  IdeaStatus,
  VALID_COLLAB_STATUSES,
  VALID_EVENT_TYPES,
  VALID_STATUSES,
} from "./types";

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

    CREATE TABLE IF NOT EXISTS research_reports (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      report        TEXT NOT NULL,
      reddit_count  INTEGER NOT NULL DEFAULT 0,
      youtube_count INTEGER NOT NULL DEFAULT 0,
      trends_count  INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS collaborations (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
      dedupe_key       TEXT NOT NULL UNIQUE,
      type             TEXT NOT NULL DEFAULT 'brand',
      platform         TEXT NOT NULL DEFAULT '',
      category         TEXT NOT NULL DEFAULT '',
      location         TEXT NOT NULL DEFAULT '',
      relevance        INTEGER NOT NULL DEFAULT 50,
      why              TEXT NOT NULL DEFAULT '',
      email            TEXT NOT NULL DEFAULT '',
      website          TEXT NOT NULL DEFAULT '',
      contact_url      TEXT NOT NULL DEFAULT '',
      email_verified   INTEGER NOT NULL DEFAULT 0,
      source           TEXT NOT NULL DEFAULT 'ai',
      subscribers      INTEGER,
      outreach_message TEXT NOT NULL DEFAULT '',
      status           TEXT NOT NULL DEFAULT 'todo',
      notes            TEXT NOT NULL DEFAULT '',
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      type        TEXT NOT NULL DEFAULT 'personal',
      date        TEXT NOT NULL,
      start_time  TEXT,
      end_time    TEXT,
      all_day     INTEGER NOT NULL DEFAULT 0,
      location    TEXT NOT NULL DEFAULT '',
      notes       TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
  `);
  return db;
}

export interface IdeaInput {
  title: string;
  status?: IdeaStatus;
  notes?: string;
  inspiration_url?: string;
  record_date?: string | null;
  edit_date?: string | null;
  post_date?: string | null;
}

const DATE_FIELDS = new Set(["record_date", "edit_date", "post_date"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    "record_date",
    "edit_date",
    "post_date",
  ];
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };

  for (const key of allowed) {
    const value = fields[key];
    if (value === undefined) continue;
    if (key === "status" && !VALID_STATUSES.includes(value as IdeaStatus)) {
      continue;
    }
    if (DATE_FIELDS.has(key)) {
      // Empty string or null clears the date; otherwise require YYYY-MM-DD.
      if (value === null || value === "") {
        sets.push(`${key} = NULL`);
        continue;
      }
      if (typeof value !== "string" || !DATE_RE.test(value)) continue;
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

// ---------- Research reports ----------

export interface ResearchReport {
  id: number;
  report: string;
  reddit_count: number;
  youtube_count: number;
  trends_count: number;
  created_at: string;
}

export interface ResearchReportInput {
  report: string;
  reddit_count?: number;
  youtube_count?: number;
  trends_count?: number;
}

export function createResearchReport(
  input: ResearchReportInput,
): ResearchReport {
  const info = getDb()
    .prepare(
      `INSERT INTO research_reports
         (report, reddit_count, youtube_count, trends_count)
       VALUES (@report, @reddit_count, @youtube_count, @trends_count)`,
    )
    .run({
      report: input.report,
      reddit_count: input.reddit_count ?? 0,
      youtube_count: input.youtube_count ?? 0,
      trends_count: input.trends_count ?? 0,
    });
  return getDb()
    .prepare("SELECT * FROM research_reports WHERE id = ?")
    .get(Number(info.lastInsertRowid)) as ResearchReport;
}

export function getLatestResearchReport(): ResearchReport | undefined {
  return getDb()
    .prepare("SELECT * FROM research_reports ORDER BY id DESC LIMIT 1")
    .get() as ResearchReport | undefined;
}

// ---------- Collaborations ----------

export interface CollaborationInput {
  name: string;
  type?: string;
  platform?: string;
  category?: string;
  location?: string;
  relevance?: number;
  why?: string;
  email?: string;
  website?: string;
  contact_url?: string;
  email_verified?: boolean | number;
  source?: string;
  subscribers?: number | null;
  outreach_message?: string;
}

function dedupeKey(name: string): string {
  return name.trim().toLowerCase();
}

export function getCollaborations(): Collaboration[] {
  return getDb()
    .prepare(
      "SELECT * FROM collaborations ORDER BY relevance DESC, id DESC",
    )
    .all() as Collaboration[];
}

export function getCollaborationNames(): string[] {
  const rows = getDb()
    .prepare("SELECT name FROM collaborations")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

// Insert a batch of leads, skipping any whose name already exists.
// Returns the rows that were actually inserted.
export function bulkCreateCollaborations(
  leads: CollaborationInput[],
): Collaboration[] {
  const database = getDb();
  const insert = database.prepare(
    `INSERT OR IGNORE INTO collaborations
       (name, dedupe_key, type, platform, category, location, relevance, why,
        email, website, contact_url, email_verified, source, subscribers,
        outreach_message)
     VALUES
       (@name, @dedupe_key, @type, @platform, @category, @location, @relevance,
        @why, @email, @website, @contact_url, @email_verified, @source,
        @subscribers, @outreach_message)`,
  );

  const insertedIds: number[] = [];
  const seen = new Set<string>();
  const tx = database.transaction((items: CollaborationInput[]) => {
    for (const lead of items) {
      const name = (lead.name ?? "").trim();
      if (!name) continue;
      const key = dedupeKey(name);
      if (seen.has(key)) continue; // dedupe within the same batch
      seen.add(key);
      const info = insert.run({
        name,
        dedupe_key: key,
        type: lead.type ?? "brand",
        platform: lead.platform ?? "",
        category: lead.category ?? "",
        location: lead.location ?? "",
        relevance: Number.isFinite(lead.relevance) ? lead.relevance : 50,
        why: lead.why ?? "",
        email: lead.email ?? "",
        website: lead.website ?? "",
        contact_url: lead.contact_url ?? "",
        email_verified: lead.email_verified ? 1 : 0,
        source: lead.source ?? "ai",
        subscribers:
          typeof lead.subscribers === "number" ? lead.subscribers : null,
        outreach_message: lead.outreach_message ?? "",
      });
      if (info.changes > 0) insertedIds.push(Number(info.lastInsertRowid));
    }
  });
  tx(leads);

  if (insertedIds.length === 0) return [];
  const placeholders = insertedIds.map(() => "?").join(",");
  return database
    .prepare(
      `SELECT * FROM collaborations WHERE id IN (${placeholders}) ORDER BY relevance DESC, id DESC`,
    )
    .all(...insertedIds) as Collaboration[];
}

export function updateCollaboration(
  id: number,
  fields: { status?: CollabStatus; notes?: string },
): Collaboration | undefined {
  const existing = getDb()
    .prepare("SELECT * FROM collaborations WHERE id = ?")
    .get(id) as Collaboration | undefined;
  if (!existing) return undefined;

  const sets: string[] = [];
  const params: Record<string, unknown> = { id };

  if (
    fields.status !== undefined &&
    VALID_COLLAB_STATUSES.includes(fields.status)
  ) {
    sets.push("status = @status");
    params.status = fields.status;
  }
  if (typeof fields.notes === "string") {
    sets.push("notes = @notes");
    params.notes = fields.notes;
  }

  if (sets.length === 0) return existing;

  sets.push("updated_at = datetime('now')");
  getDb()
    .prepare(`UPDATE collaborations SET ${sets.join(", ")} WHERE id = @id`)
    .run(params);
  return getDb()
    .prepare("SELECT * FROM collaborations WHERE id = ?")
    .get(id) as Collaboration;
}

export function deleteCollaboration(id: number): boolean {
  const info = getDb()
    .prepare("DELETE FROM collaborations WHERE id = ?")
    .run(id);
  return info.changes > 0;
}

// ---------- Calendar events ----------

export interface EventInput {
  title: string;
  type?: EventType;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  all_day?: boolean | number;
  location?: string;
  notes?: string;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeType(type: unknown): EventType {
  return typeof type === "string" && VALID_EVENT_TYPES.includes(type as EventType)
    ? (type as EventType)
    : "personal";
}

function normalizeTime(value: unknown): string | null {
  return typeof value === "string" && TIME_RE.test(value) ? value : null;
}

export function getEvent(id: number): CalendarEvent | undefined {
  return getDb().prepare("SELECT * FROM events WHERE id = ?").get(id) as
    | CalendarEvent
    | undefined;
}

// Events for a single day, or a date range (inclusive). Ordered so that
// timed events come before all-day, then by start time.
export function getEvents(opts: { date?: string; from?: string; to?: string }):
  CalendarEvent[] {
  const db = getDb();
  if (opts.date && DATE_ONLY_RE.test(opts.date)) {
    return db
      .prepare(
        `SELECT * FROM events WHERE date = ?
         ORDER BY all_day ASC, start_time IS NULL, start_time ASC, id ASC`,
      )
      .all(opts.date) as CalendarEvent[];
  }
  if (
    opts.from &&
    opts.to &&
    DATE_ONLY_RE.test(opts.from) &&
    DATE_ONLY_RE.test(opts.to)
  ) {
    return db
      .prepare(
        `SELECT * FROM events WHERE date >= ? AND date <= ?
         ORDER BY date ASC, all_day ASC, start_time IS NULL, start_time ASC, id ASC`,
      )
      .all(opts.from, opts.to) as CalendarEvent[];
  }
  return db
    .prepare(
      `SELECT * FROM events
       ORDER BY date ASC, all_day ASC, start_time IS NULL, start_time ASC, id ASC`,
    )
    .all() as CalendarEvent[];
}

export function createEvent(input: EventInput): CalendarEvent {
  const allDay = input.all_day ? 1 : 0;
  const info = getDb()
    .prepare(
      `INSERT INTO events
         (title, type, date, start_time, end_time, all_day, location, notes)
       VALUES
         (@title, @type, @date, @start_time, @end_time, @all_day, @location, @notes)`,
    )
    .run({
      title: input.title.trim(),
      type: normalizeType(input.type),
      date: input.date,
      start_time: allDay ? null : normalizeTime(input.start_time),
      end_time: allDay ? null : normalizeTime(input.end_time),
      all_day: allDay,
      location: input.location ?? "",
      notes: input.notes ?? "",
    });
  return getEvent(Number(info.lastInsertRowid))!;
}

export function updateEvent(
  id: number,
  fields: Partial<EventInput>,
): CalendarEvent | undefined {
  const existing = getEvent(id);
  if (!existing) return undefined;

  const sets: string[] = [];
  const params: Record<string, unknown> = { id };

  if (typeof fields.title === "string" && fields.title.trim()) {
    sets.push("title = @title");
    params.title = fields.title.trim();
  }
  if (fields.type !== undefined) {
    sets.push("type = @type");
    params.type = normalizeType(fields.type);
  }
  if (typeof fields.date === "string" && DATE_ONLY_RE.test(fields.date)) {
    sets.push("date = @date");
    params.date = fields.date;
  }
  if (fields.all_day !== undefined) {
    sets.push("all_day = @all_day");
    params.all_day = fields.all_day ? 1 : 0;
  }
  if (fields.start_time !== undefined) {
    sets.push("start_time = @start_time");
    params.start_time = normalizeTime(fields.start_time);
  }
  if (fields.end_time !== undefined) {
    sets.push("end_time = @end_time");
    params.end_time = normalizeTime(fields.end_time);
  }
  if (typeof fields.location === "string") {
    sets.push("location = @location");
    params.location = fields.location;
  }
  if (typeof fields.notes === "string") {
    sets.push("notes = @notes");
    params.notes = fields.notes;
  }

  if (sets.length === 0) return existing;

  sets.push("updated_at = datetime('now')");
  getDb()
    .prepare(`UPDATE events SET ${sets.join(", ")} WHERE id = @id`)
    .run(params);
  return getEvent(id);
}

export function deleteEvent(id: number): boolean {
  const info = getDb().prepare("DELETE FROM events WHERE id = ?").run(id);
  return info.changes > 0;
}
