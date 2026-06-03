// Shared types — safe to import from both server and client code
// (no server-only dependencies here).

export type IdeaStatus = "to_start" | "in_progress" | "complete";

export interface Idea {
  id: number;
  title: string;
  status: IdeaStatus;
  notes: string;
  inspiration_url: string;
  record_date: string | null;
  edit_date: string | null;
  post_date: string | null;
  created_at: string;
  updated_at: string;
}

export const VALID_STATUSES: IdeaStatus[] = [
  "to_start",
  "in_progress",
  "complete",
];

// ---------- Collaborations ----------

export type CollabStatus = "todo" | "in_progress" | "done";

export const VALID_COLLAB_STATUSES: CollabStatus[] = [
  "todo",
  "in_progress",
  "done",
];

// ---------- Calendar events ----------

export type EventType = "meeting" | "tennis" | "task" | "personal";

export const VALID_EVENT_TYPES: EventType[] = [
  "meeting",
  "tennis",
  "task",
  "personal",
];

export interface CalendarEvent {
  id: number;
  title: string;
  type: EventType;
  date: string; // YYYY-MM-DD (local)
  start_time: string | null; // "HH:MM" 24h, or null for all-day
  end_time: string | null; // "HH:MM" 24h, or null
  all_day: number; // 0 | 1
  location: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type OutreachChannel =
  | "email"
  | "instagram_dm"
  | "tiktok_dm"
  | "contact_form"
  | "linkedin"
  | "";

export interface Collaboration {
  id: number;
  name: string;
  type: string; // "brand" | "product" | "service" | "creator"
  platform: string; // youtube | instagram | tiktok | web | ""
  category: string;
  location: string;
  relevance: number; // 0-100
  why: string;
  email: string;
  website: string;
  contact_url: string;
  email_verified: number; // 0 | 1
  source: string; // "youtube_api" | "ai" | "creator_sponsor" | "onbrand"
  subscribers: number | null;
  outreach_message: string;
  outreach_channel: OutreachChannel;
  status: CollabStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}
