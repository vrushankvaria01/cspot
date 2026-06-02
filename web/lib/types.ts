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
