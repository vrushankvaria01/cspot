"use client";

import { useState } from "react";

import type { Idea } from "@/lib/types";

interface Props {
  idea: Idea;
  onClose: () => void;
  onSaved: (idea: Idea) => void;
}

type MilestoneKey = "record" | "edit" | "post";

const FIELDS: { key: MilestoneKey; label: string; hint: string; dot: string }[] = [
  { key: "record", label: "Record", hint: "Film the footage", dot: "bg-amber-400" },
  { key: "edit", label: "Edit", hint: "Cut it together", dot: "bg-sky-400" },
  { key: "post", label: "Post", hint: "Publish it", dot: "bg-lime-400" },
];

type FormState = Record<
  MilestoneKey,
  { date: string; start: string; end: string }
>;

export default function ScheduleModal({ idea, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>({
    record: {
      date: idea.record_date ?? "",
      start: idea.record_start_time ?? "",
      end: idea.record_end_time ?? "",
    },
    edit: {
      date: idea.edit_date ?? "",
      start: idea.edit_start_time ?? "",
      end: idea.edit_end_time ?? "",
    },
    post: {
      date: idea.post_date ?? "",
      start: idea.post_start_time ?? "",
      end: idea.post_end_time ?? "",
    },
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setField(
    key: MilestoneKey,
    sub: "date" | "start" | "end",
    value: string,
  ) {
    setForm((prev) => ({ ...prev, [key]: { ...prev[key], [sub]: value } }));
  }

  function clearMilestone(key: MilestoneKey) {
    setForm((prev) => ({ ...prev, [key]: { date: "", start: "", end: "" } }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    // Empty strings clear the field server-side. Times only apply if a date is set.
    const payload: Record<string, string | null> = {};
    for (const f of FIELDS) {
      const cell = form[f.key];
      const date = cell.date || null;
      payload[`${f.key}_date`] = date;
      payload[`${f.key}_start_time`] = date ? cell.start || null : null;
      payload[`${f.key}_end_time`] = date ? cell.end || null : null;
    }

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

  const inputClass =
    "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-lime-400/60 [color-scheme:dark]";

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
          {FIELDS.map((f) => {
            const cell = form[f.key];
            const hasDate = !!cell.date;
            return (
              <div key={f.key}>
                <label className="mb-1 flex items-center gap-2 text-xs font-medium text-zinc-400">
                  <span className={`h-2 w-2 rounded-full ${f.dot}`} />
                  {f.label}
                  <span className="font-normal text-zinc-600">— {f.hint}</span>
                  {hasDate && (
                    <button
                      type="button"
                      onClick={() => clearMilestone(f.key)}
                      className="ml-auto text-[10px] uppercase tracking-wide text-zinc-500 transition-colors hover:text-zinc-200"
                    >
                      Clear
                    </button>
                  )}
                </label>
                <input
                  type="date"
                  value={cell.date}
                  onChange={(e) => setField(f.key, "date", e.target.value)}
                  className={inputClass}
                />
                {hasDate && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1">
                      <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-zinc-500">
                        Start
                      </label>
                      <input
                        type="time"
                        value={cell.start}
                        onChange={(e) =>
                          setField(f.key, "start", e.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-0.5 block text-[10px] uppercase tracking-wide text-zinc-500">
                        End <span className="lowercase text-zinc-600">(optional)</span>
                      </label>
                      <input
                        type="time"
                        value={cell.end}
                        onChange={(e) =>
                          setField(f.key, "end", e.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

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
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
