"use client";

import { useState } from "react";

import type { Idea } from "@/lib/types";

interface Props {
  idea: Idea;
  onClose: () => void;
  onSaved: (idea: Idea) => void;
}

const FIELDS: {
  key: "record_date" | "edit_date" | "post_date";
  label: string;
  hint: string;
  dot: string;
}[] = [
  { key: "record_date", label: "Record", hint: "Film the footage", dot: "bg-amber-400" },
  { key: "edit_date", label: "Edit", hint: "Cut it together", dot: "bg-sky-400" },
  { key: "post_date", label: "Post", hint: "Publish it", dot: "bg-lime-400" },
];

export default function ScheduleModal({ idea, onClose, onSaved }: Props) {
  const [dates, setDates] = useState({
    record_date: idea.record_date ?? "",
    edit_date: idea.edit_date ?? "",
    post_date: idea.post_date ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setField(key: keyof typeof dates, value: string) {
    setDates((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    // Empty strings clear the date server-side.
    const payload = {
      record_date: dates.record_date || null,
      edit_date: dates.edit_date || null,
      post_date: dates.post_date || null,
    };

    try {
      const res = await fetch(`/api/ideas/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      const saved: Idea = await res.json();
      onSaved(saved);
    } catch {
      setError("Could not save. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-zinc-100">Schedule</h2>
        <p className="mb-4 mt-0.5 line-clamp-1 text-sm text-zinc-500">
          {idea.title}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="mb-1 flex items-center gap-2 text-xs font-medium text-zinc-400">
                <span className={`h-2 w-2 rounded-full ${f.dot}`} />
                {f.label}
                <span className="font-normal text-zinc-600">— {f.hint}</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dates[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-lime-400/60 [color-scheme:dark]"
                />
                {dates[f.key] && (
                  <button
                    type="button"
                    onClick={() => setField(f.key, "")}
                    className="shrink-0 rounded-lg px-2 py-2 text-xs text-zinc-500 transition-colors hover:text-zinc-200"
                    title="Clear"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          ))}

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
              {saving ? "Saving…" : "Save dates"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
