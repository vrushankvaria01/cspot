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

export interface Collaboration {
  id: number;
  name: string;
  type: string; // "brand" | "creator"
  platform: string; // youtube | instagram | tiktok | web | ""
  category: string;
  location: string;
  relevance: number; // 0-100
  why: string;
  email: string;
  website: string;
  contact_url: string;
  email_verified: number; // 0 | 1
  source: string; // "youtube_api" | "ai"
  subscribers: number | null;
  outreach_message: string;
  status: CollabStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}
