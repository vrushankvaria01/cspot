"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CalendarEvent, EventType, Idea } from "@/lib/types";

export interface EventTypeMeta {
  value: EventType;
  label: string;
  dot: string;
  chip: string;
}

export const EVENT_TYPES: EventTypeMeta[] = [
  {
    value: "meeting",
    label: "Meeting",
    dot: "bg-violet-400",
    chip: "border-violet-400/30 bg-violet-400/10 text-violet-200 hover:bg-violet-400/20",
  },
  {
    value: "tennis",
    label: "Tennis / training",
    dot: "bg-orange-400",
    chip: "border-orange-400/30 bg-orange-400/10 text-orange-200 hover:bg-orange-400/20",
  },
  {
    value: "task",
    label: "Task / reminder",
    dot: "bg-cyan-400",
    chip: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20",
  },
  {
    value: "personal",
    label: "Personal / lifestyle",
    dot: "bg-pink-400",
    chip: "border-pink-400/30 bg-pink-400/10 text-pink-200 hover:bg-pink-400/20",
  },
];

export const EVENT_META: Record<EventType, EventTypeMeta> = Object.fromEntries(
  EVENT_TYPES.map((t) => [t.value, t]),
) as Record<EventType, EventTypeMeta>;

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DEFAULT_SCROLL_HOUR = 6;

function hourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function timeLabel(t: string | null): string {
  if (!t) return "";
  const [hStr, m] = t.split(":");
  const h = Number(hStr);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

function prettyDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

interface DayMilestone {
  idea: Idea;
  label: string;
  dot: string;
  chip: string;
  startTime: string | null; // "HH:MM" or null
  endTime: string | null;
}

interface Props {
  date: string;
  milestones: DayMilestone[];
  onClose: () => void;
  onEventsChanged: () => void;
  onMilestoneClick?: (idea: Idea) => void;
}

type EditTarget = "new" | CalendarEvent | null;

export default function DayView({
  date,
  milestones,
  onClose,
  onEventsChanged,
  onMilestoneClick,
}: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditTarget>(null);
  const [viewing, setViewing] = useState<CalendarEvent | null>(null);
  const [newStartHour, setNewStartHour] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hourRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/events?date=${date}`);
      setEvents(await res.json());
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  // Scroll the hourly grid to ~6am on first render.
  useEffect(() => {
    if (loading) return;
    const target = hourRefs.current[DEFAULT_SCROLL_HOUR];
    const container = scrollRef.current;
    if (target && container) {
      container.scrollTop = target.offsetTop - container.offsetTop;
    }
  }, [loading]);

  const allDay = events.filter((e) => e.all_day || !e.start_time);
  const timed = events.filter((e) => !e.all_day && e.start_time);
  const byHour = (h: number) =>
    timed.filter((e) => Number(e.start_time!.split(":")[0]) === h);

  const unscheduledMilestones = milestones.filter((m) => !m.startTime);
  const timedMilestones = milestones.filter((m) => !!m.startTime);
  const milestonesByHour = (h: number) =>
    timedMilestones.filter(
      (m) => Number(m.startTime!.split(":")[0]) === h,
    );

  function openNew(hour: number | null) {
    setNewStartHour(hour);
    setEditing("new");
  }

  function handleSaved() {
    setEditing(null);
    load();
    onEventsChanged();
  }

  async function handleDelete(ev: CalendarEvent) {
    setEvents((prev) => prev.filter((e) => e.id !== ev.id));
    try {
      await fetch(`/api/events/${ev.id}`, { method: "DELETE" });
      onEventsChanged();
    } catch {
      load();
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              {prettyDate(date)}
            </h2>
            <p className="text-xs text-zinc-500">
              {events.length} event{events.length === 1 ? "" : "s"}
              {milestones.length > 0 &&
                ` · ${milestones.length} content milestone${
                  milestones.length === 1 ? "" : "s"
                }`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openNew(null)}
              className="rounded-lg bg-lime-400 px-3 py-1.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-lime-300"
            >
              + Add event
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {loading ? (
          <p className="py-16 text-center text-sm text-zinc-600">Loading…</p>
        ) : (
          <>
            {(unscheduledMilestones.length > 0 || allDay.length > 0) && (
              <div className="flex flex-col gap-1.5 border-b border-zinc-800 bg-zinc-900/60 px-5 py-3">
                {unscheduledMilestones.map((m, i) => {
                  const inner = (
                    <>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${m.dot}`} />
                      <span className="font-medium">{m.label}</span>
                      <span className="truncate">{m.idea.title}</span>
                      {onMilestoneClick && (
                        <span className="ml-auto text-[10px] uppercase tracking-wide opacity-60">
                          Set time
                        </span>
                      )}
                    </>
                  );
                  if (onMilestoneClick) {
                    return (
                      <button
                        key={`ms-${i}`}
                        type="button"
                        onClick={() => onMilestoneClick(m.idea)}
                        className={`flex w-full items-center gap-2 rounded-md border px-2 py-1 text-left text-xs transition-colors ${m.chip}`}
                      >
                        {inner}
                      </button>
                    );
                  }
                  return (
                    <div
                      key={`ms-${i}`}
                      className="flex items-center gap-2 text-xs text-zinc-400"
                    >
                      {inner}
                    </div>
                  );
                })}
                {allDay.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setViewing(ev)}
                    className={`flex w-full items-center gap-2 rounded-md border px-2 py-1 text-left text-xs transition-colors ${
                      EVENT_META[ev.type].chip
                    }`}
                  >
                    <span className="rounded bg-black/20 px-1 py-0.5 text-[9px] uppercase tracking-wide">
                      All day
                    </span>
                    <span className="truncate">{ev.title}</span>
                  </button>
                ))}
              </div>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-1">
              {HOURS.map((h) => {
                const hourEvents = byHour(h);
                const hourMilestones = milestonesByHour(h);
                const total = hourEvents.length + hourMilestones.length;
                return (
                  <div
                    key={h}
                    ref={(el) => {
                      hourRefs.current[h] = el;
                    }}
                    className="group flex min-h-[52px] gap-3 border-b border-zinc-800/50 px-3 py-1.5 last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => openNew(h)}
                      className="w-14 shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-zinc-600 transition-colors hover:text-lime-400"
                      title="Add event at this hour"
                    >
                      {hourLabel(h)}
                    </button>
                    <div className="flex flex-1 flex-col gap-1">
                      {total === 0 ? (
                        <button
                          type="button"
                          onClick={() => openNew(h)}
                          className="h-full min-h-[40px] w-full rounded-md text-left text-[11px] text-transparent transition-colors hover:bg-zinc-800/40 hover:text-zinc-600"
                        >
                          + Add
                        </button>
                      ) : (
                        <>
                          {hourMilestones.map((m, i) => (
                            <button
                              key={`m-${m.idea.id}-${i}`}
                              type="button"
                              onClick={() => onMilestoneClick?.(m.idea)}
                              disabled={!onMilestoneClick}
                              className={`flex w-full flex-col rounded-md border px-2.5 py-1.5 text-left transition-colors ${m.chip}`}
                            >
                              <span className="flex items-center gap-2 text-xs font-medium">
                                <span
                                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.dot}`}
                                />
                                <span className="rounded bg-black/20 px-1 py-0.5 text-[9px] uppercase tracking-wide">
                                  {m.label}
                                </span>
                                <span className="truncate">{m.idea.title}</span>
                              </span>
                              <span className="text-[10px] opacity-75">
                                {timeLabel(m.startTime)}
                                {m.endTime ? ` – ${timeLabel(m.endTime)}` : ""}
                              </span>
                            </button>
                          ))}
                          {hourEvents.map((ev) => (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={() => setViewing(ev)}
                              className={`flex w-full flex-col rounded-md border px-2.5 py-1.5 text-left transition-colors ${
                                EVENT_META[ev.type].chip
                              }`}
                            >
                              <span className="flex items-center gap-2 text-xs font-medium">
                                <span className="truncate">{ev.title}</span>
                              </span>
                              <span className="text-[10px] opacity-75">
                                {timeLabel(ev.start_time)}
                                {ev.end_time ? ` – ${timeLabel(ev.end_time)}` : ""}
                                {ev.location ? ` · ${ev.location}` : ""}
                              </span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {editing !== null && (
        <EventForm
          date={date}
          event={editing === "new" ? null : editing}
          defaultStartHour={editing === "new" ? newStartHour : null}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onDelete={editing === "new" ? undefined : handleDelete}
        />
      )}

      {viewing && (
        <EventDetails
          event={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            const target = viewing;
            setViewing(null);
            setEditing(target);
          }}
          onDelete={() => {
            const target = viewing;
            setViewing(null);
            handleDelete(target);
          }}
        />
      )}
    </div>
  );
}

// ---------- Event details (read-only with Edit / Delete) ----------

function EventDetails({
  event,
  onClose,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = EVENT_META[event.type];
  const timeRange =
    event.all_day || !event.start_time
      ? "All day"
      : `${timeLabel(event.start_time)}${
          event.end_time ? ` – ${timeLabel(event.end_time)}` : ""
        }`;

  function handleDelete() {
    if (window.confirm(`Delete "${event.title}"?`)) onDelete();
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
              <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                {meta.label}
              </span>
            </div>
            <h2 className="break-words text-lg font-semibold text-zinc-100">
              {event.title}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md px-2.5 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
              title="Edit"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-zinc-400 transition-colors hover:text-zinc-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <dl className="flex flex-col gap-2 text-sm">
          <Row label="When">{timeRange}</Row>
          {event.location && <Row label="Where">{event.location}</Row>}
          {event.notes && (
            <Row label="Notes">
              <span className="whitespace-pre-wrap">{event.notes}</span>
            </Row>
          )}
        </dl>

        <div className="mt-2 flex items-center border-t border-zinc-800 pt-3 text-xs">
          <button
            type="button"
            onClick={handleDelete}
            className="text-red-400/80 transition-colors hover:text-red-400"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg px-3 py-1.5 text-zinc-400 transition-colors hover:text-zinc-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-14 shrink-0 text-[11px] uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-zinc-200">{children}</dd>
    </div>
  );
}

// ---------- Inline event create/edit form ----------

interface FormProps {
  date: string;
  event: CalendarEvent | null;
  defaultStartHour: number | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: (ev: CalendarEvent) => void;
}

function EventForm({
  date,
  event,
  defaultStartHour,
  onClose,
  onSaved,
  onDelete,
}: FormProps) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [type, setType] = useState<EventType>(event?.type ?? "personal");
  const [allDay, setAllDay] = useState(!!event?.all_day);
  const [start, setStart] = useState(
    event?.start_time ??
      (defaultStartHour != null
        ? `${String(defaultStartHour).padStart(2, "0")}:00`
        : "09:00"),
  );
  const [end, setEnd] = useState(event?.end_time ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give it a title.");
      return;
    }
    setSaving(true);
    setError("");

    const payload = {
      title: title.trim(),
      type,
      date,
      all_day: allDay,
      start_time: allDay ? null : start || null,
      end_time: allDay ? null : end || null,
      location: location.trim(),
      notes: notes.trim(),
    };

    try {
      const res = await fetch(
        event ? `/api/events/${event.id}` : "/api/events",
        {
          method: event ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) throw new Error();
      onSaved();
    } catch {
      setError("Could not save. Try again.");
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-lime-400/60 [color-scheme:dark]";

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-zinc-100">
          {event ? "Edit event" : "New event"}
        </h2>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Title
          </label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Hitting session, sponsor call, edit reel…"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Type
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {EVENT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  type === t.value
                    ? t.chip
                    : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${t.dot}`} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="h-4 w-4 accent-lime-400"
          />
          All day
        </label>

        {!allDay && (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Start
              </label>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                End <span className="font-normal text-zinc-600">(optional)</span>
              </label>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Location <span className="font-normal text-zinc-600">(optional)</span>
          </label>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Indian Recreation Club, Zoom…"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Notes <span className="font-normal text-zinc-600">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={`${inputClass} resize-y`}
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="mt-1 flex items-center gap-3">
          {event && onDelete && (
            <button
              type="button"
              onClick={() => {
                onDelete(event);
                onClose();
              }}
              className="text-sm text-red-400/80 transition-colors hover:text-red-400"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg px-4 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-100"
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
  );
}
