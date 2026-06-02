"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { Idea } from "@/lib/types";
import ScheduleModal from "./ScheduleModal";

type MilestoneField = "record_date" | "edit_date" | "post_date";

interface Milestone {
  field: MilestoneField;
  label: string;
  dot: string;
  chip: string;
}

const MILESTONES: Milestone[] = [
  {
    field: "record_date",
    label: "Record",
    dot: "bg-amber-400",
    chip: "border-amber-400/30 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20",
  },
  {
    field: "edit_date",
    label: "Edit",
    dot: "bg-sky-400",
    chip: "border-sky-400/30 bg-sky-400/10 text-sky-300 hover:bg-sky-400/20",
  },
  {
    field: "post_date",
    label: "Post",
    dot: "bg-lime-400",
    chip: "border-lime-400/30 bg-lime-400/10 text-lime-300 hover:bg-lime-400/20",
  },
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Format a Date as a local YYYY-MM-DD string (no UTC conversion, so the day
// never shifts across timezones).
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface DayEvent {
  idea: Idea;
  milestone: Milestone;
}

export default function Calendar() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState<Idea | null>(null);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ideas");
      setIdeas(await res.json());
    } catch {
      // Non-fatal; grid just renders empty.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 6-week (42-cell) grid starting on the Sunday on/before the 1st.
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const offset = first.getDay();
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) {
      out.push(new Date(cursor.year, cursor.month, 1 - offset + i));
    }
    return out;
  }, [cursor]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, DayEvent[]>();
    for (const idea of ideas) {
      for (const milestone of MILESTONES) {
        const value = idea[milestone.field];
        if (!value) continue;
        const key = value.slice(0, 10);
        const list = map.get(key) ?? [];
        list.push({ idea, milestone });
        map.set(key, list);
      }
    }
    return map;
  }, [ideas]);

  const unscheduled = useMemo(
    () =>
      ideas.filter(
        (i) => !i.record_date && !i.edit_date && !i.post_date,
      ),
    [ideas],
  );

  const todayKey = ymd(new Date());

  function handleSaved(saved: Idea) {
    setIdeas((prev) => prev.map((i) => (i.id === saved.id ? saved : i)));
    setScheduling(null);
  }

  function goToToday() {
    const now = new Date();
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
  }

  function shiftMonth(delta: number) {
    setCursor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Content Calendar
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Schedule each idea’s record, edit, and post dates and see the month
            at a glance.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {MILESTONES.map((m) => (
            <span
              key={m.field}
              className="flex items-center gap-1.5 text-xs text-zinc-400"
            >
              <span className={`h-2 w-2 rounded-full ${m.dot}`} />
              {m.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium text-zinc-100">
          {MONTH_NAMES[cursor.month]} {cursor.year}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="rounded-md px-2.5 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Previous month"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="rounded-md px-2.5 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-zinc-600">Loading…</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-900/40">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-zinc-500"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((date, i) => {
                const key = ymd(date);
                const inMonth = date.getMonth() === cursor.month;
                const isToday = key === todayKey;
                const events = eventsByDate.get(key) ?? [];
                return (
                  <div
                    key={i}
                    className={`min-h-[104px] border-b border-r border-zinc-800/70 p-1.5 ${
                      i % 7 === 6 ? "border-r-0" : ""
                    } ${inMonth ? "bg-zinc-950" : "bg-zinc-900/30"}`}
                  >
                    <div className="mb-1 flex justify-end px-1">
                      <span
                        className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] ${
                          isToday
                            ? "bg-lime-400 font-semibold text-zinc-950"
                            : inMonth
                              ? "text-zinc-400"
                              : "text-zinc-600"
                        }`}
                      >
                        {date.getDate()}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {events.map((ev, j) => (
                        <button
                          key={j}
                          type="button"
                          onClick={() => setScheduling(ev.idea)}
                          title={`${ev.milestone.label}: ${ev.idea.title}`}
                          className={`flex w-full items-center gap-1 truncate rounded border px-1.5 py-0.5 text-left text-[11px] transition-colors ${ev.milestone.chip}`}
                        >
                          <span className="truncate">{ev.idea.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-8">
            <h3 className="mb-3 text-sm font-medium text-zinc-300">
              Unscheduled ideas
              <span className="ml-2 text-xs font-normal text-zinc-600">
                {unscheduled.length}
              </span>
            </h3>
            {unscheduled.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-800 py-8 text-center text-sm text-zinc-600">
                Everything’s scheduled. 🎬
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {unscheduled.map((idea) => (
                  <button
                    key={idea.id}
                    type="button"
                    onClick={() => setScheduling(idea)}
                    className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:border-lime-400/40 hover:text-zinc-100"
                  >
                    <span className="line-clamp-1 max-w-[220px]">
                      {idea.title}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {scheduling && (
        <ScheduleModal
          idea={scheduling}
          onClose={() => setScheduling(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
