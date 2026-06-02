"use client";

import { useState } from "react";

import type { Idea, IdeaStatus } from "@/lib/types";
import InstagramEmbed, { isInstagramUrl } from "./InstagramEmbed";

const STATUS_OPTIONS: { value: IdeaStatus; label: string }[] = [
  { value: "to_start", label: "To Start" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete", label: "Complete" },
];

interface Props {
  idea?: Idea | null;
  onClose: () => void;
  onSaved: (idea: Idea) => void;
}

export default function IdeaForm({ idea, onClose, onSaved }: Props) {
  const isEdit = Boolean(idea);
  const [title, setTitle] = useState(idea?.title ?? "");
  const [status, setStatus] = useState<IdeaStatus>(idea?.status ?? "to_start");
  const [notes, setNotes] = useState(idea?.notes ?? "");
  const [inspirationUrl, setInspirationUrl] = useState(
    idea?.inspiration_url ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setSaving(true);
    setError("");

    const payload = {
      title: title.trim(),
      status,
      notes,
      inspiration_url: inspirationUrl.trim(),
    };

    try {
      const res = await fetch(
        isEdit ? `/api/ideas/${idea!.id}` : "/api/ideas",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) throw new Error("Save failed");
      const saved: Idea = await res.json();
      onSaved(saved);
    } catch {
      setError("Could not save. Please try again.");
      setSaving(false);
    }
  }

  const showPreview = inspirationUrl.trim() && isInstagramUrl(inspirationUrl);

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">
          {isEdit ? "Edit idea" : "New idea"}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              placeholder="e.g. Why Sinner's aura is breaking the tour"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-lime-400/60"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as IdeaStatus)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-lime-400/60"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Notes — what you need to execute this
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Script angle, B-roll to grab, stats to pull, hook ideas…"
              className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-lime-400/60"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">
              Inspiration link (Instagram reel, etc.)
            </label>
            <input
              type="url"
              value={inspirationUrl}
              onChange={(e) => setInspirationUrl(e.target.value)}
              placeholder="https://www.instagram.com/reel/…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-lime-400/60"
            />
            {showPreview && (
              <div className="mt-3 overflow-hidden rounded-lg border border-zinc-800 bg-white">
                <InstagramEmbed url={inspirationUrl.trim()} />
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="mt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-lime-300 disabled:opacity-50"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create idea"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
