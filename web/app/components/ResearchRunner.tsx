"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SuggestedIdea {
  title: string;
  notes: string;
  why: string;
}

interface ResearchReport {
  id: number;
  report: string;
  reddit_count: number;
  youtube_count: number;
  trends_count: number;
  suggested_ideas: SuggestedIdea[];
  created_at: string;
}

function formatTimestamp(value: string): string {
  // SQLite stores UTC like "2026-06-03 12:34:56"; make it an ISO instant.
  const iso = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ResearchRunner() {
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loadingLatest, setLoadingLatest] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  // Load the most recent saved report on mount.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/research");
        if (res.ok) {
          const data = await res.json();
          if (data) setReport(data);
        }
      } catch {
        // Non-fatal — user can still run a fresh report.
      } finally {
        setLoadingLatest(false);
      }
    })();
  }, []);

  // Keep the live log scrolled to the bottom.
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [progress]);

  async function runResearch() {
    setRunning(true);
    setError("");
    setProgress([]);

    try {
      const res = await fetch("/api/research", { method: "POST" });
      if (!res.ok || !res.body) {
        throw new Error(`Server returned ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event: {
            type: string;
            line?: string;
            message?: string;
            report?: ResearchReport;
          };
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.type === "progress" && event.line) {
            setProgress((prev) => [...prev, event.line!]);
          } else if (event.type === "result" && event.report) {
            setReport(event.report);
          } else if (event.type === "error") {
            setError(event.message || "Research failed.");
          }
        }
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Something went wrong running research.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Content Research
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Pulls fresh signals from Reddit, YouTube, and Google Trends, then
            asks Gemini for video ideas, quotable comments, and emerging
            trends. Run it, skim the report, then add the ideas you like to the
            Ideas board.
          </p>
        </div>
        <button
          type="button"
          onClick={runResearch}
          disabled={running}
          className="shrink-0 rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Running…" : "Run research"}
        </button>
      </div>

      {running && (
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2 text-sm text-zinc-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-lime-400" />
            Gathering signals… this can take a few minutes.
          </div>
          <div
            ref={logRef}
            className="max-h-56 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 font-mono text-xs leading-relaxed text-zinc-400"
          >
            {progress.length === 0 ? (
              <span className="text-zinc-600">Starting…</span>
            ) : (
              progress.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap">
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-300">
          <p className="font-medium">Research failed</p>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-red-400/90">
            {error}
          </pre>
        </div>
      )}

      {loadingLatest ? (
        <p className="py-16 text-center text-sm text-zinc-600">Loading…</p>
      ) : report ? (
        <>
          <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-800 pb-4 text-xs text-zinc-500">
              <span>Generated {formatTimestamp(report.created_at)}</span>
              <span className="text-zinc-700">•</span>
              <span>{report.reddit_count} Reddit posts</span>
              <span>{report.youtube_count} YouTube videos</span>
              <span>{report.trends_count} trend groups</span>
            </div>
            <div className="prose prose-invert prose-sm max-w-none prose-headings:text-zinc-100 prose-a:text-lime-400 prose-strong:text-zinc-100 prose-code:text-lime-300">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {report.report}
              </ReactMarkdown>
            </div>
          </article>

          <SuggestedIdeas key={report.id} suggestions={report.suggested_ideas} />
        </>
      ) : (
        !running && (
          <div className="rounded-xl border border-dashed border-zinc-800 py-16 text-center">
            <p className="text-sm text-zinc-500">No research yet.</p>
            <p className="mt-1 text-sm text-zinc-600">
              Hit “Run research” to generate your first report.
            </p>
          </div>
        )
      )}
    </div>
  );
}

// ---------- Suggested ideas ----------

type CardState = "draft" | "saving" | "added" | "error" | "dismissed";

interface CardData {
  title: string;
  notes: string;
  why: string;
  state: CardState;
}

function SuggestedIdeas({ suggestions }: { suggestions: SuggestedIdea[] }) {
  // Local, per-session state — each card tracks its own edits + status.
  const initial = useMemo<CardData[]>(
    () =>
      suggestions.map((s) => ({
        title: s.title,
        notes: s.notes,
        why: s.why,
        state: "draft" as CardState,
      })),
    [suggestions],
  );
  const [cards, setCards] = useState<CardData[]>(initial);

  // Re-seed when the report changes (parent passes a fresh `key` on report.id).
  // Using `useState(initial)` already does this on remount, so no effect needed.

  if (cards.length === 0) {
    return null;
  }

  function updateCard(i: number, patch: Partial<CardData>) {
    setCards((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    );
  }

  async function addToIdeas(i: number) {
    const card = cards[i];
    if (!card.title.trim()) {
      updateCard(i, { state: "error" });
      return;
    }
    updateCard(i, { state: "saving" });
    try {
      const notes = card.notes.trim();
      const why = card.why.trim();
      // Stitch the "why" line into notes so it travels with the idea.
      const fullNotes = why ? `${notes}\n\nWhy now: ${why}`.trim() : notes;
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: card.title.trim(),
          notes: fullNotes,
          status: "to_start",
        }),
      });
      if (!res.ok) throw new Error();
      updateCard(i, { state: "added" });
    } catch {
      updateCard(i, { state: "error" });
    }
  }

  const visible = cards
    .map((c, i) => ({ card: c, index: i }))
    .filter((x) => x.card.state !== "dismissed");

  if (visible.length === 0) {
    return (
      <p className="mt-8 rounded-lg border border-dashed border-zinc-800 py-6 text-center text-sm text-zinc-600">
        All suggested ideas handled. 🎬
      </p>
    );
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold text-zinc-100">
          Suggested ideas
        </h2>
        <p className="text-xs text-zinc-500">
          {visible.length} draft{visible.length === 1 ? "" : "s"} — edit, then
          add to your Ideas board.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map(({ card, index }) => (
          <SuggestedIdeaCard
            key={index}
            card={card}
            onChange={(patch) => updateCard(index, patch)}
            onAdd={() => addToIdeas(index)}
            onDismiss={() => updateCard(index, { state: "dismissed" })}
          />
        ))}
      </div>
    </section>
  );
}

function SuggestedIdeaCard({
  card,
  onChange,
  onAdd,
  onDismiss,
}: {
  card: CardData;
  onChange: (patch: Partial<CardData>) => void;
  onAdd: () => void;
  onDismiss: () => void;
}) {
  const added = card.state === "added";
  const saving = card.state === "saving";
  const errored = card.state === "error";

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border p-4 transition-colors ${
        added
          ? "border-lime-400/30 bg-lime-400/5"
          : "border-zinc-800 bg-zinc-900/40"
      }`}
    >
      <input
        value={card.title}
        onChange={(e) => onChange({ title: e.target.value })}
        disabled={added || saving}
        placeholder="Idea title"
        className="rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-zinc-100 outline-none transition-colors hover:border-zinc-700 focus:border-lime-400/60 disabled:opacity-70"
      />
      <textarea
        value={card.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        disabled={added || saving}
        rows={3}
        placeholder="Hook, angle, format…"
        className="rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-zinc-300 outline-none transition-colors hover:border-zinc-700 focus:border-lime-400/60 disabled:opacity-70"
      />
      {card.why && (
        <p className="px-2 text-[11px] italic text-zinc-500">
          Why now: {card.why}
        </p>
      )}

      <div className="mt-1 flex items-center gap-2 border-t border-zinc-800 pt-2 text-xs">
        {added ? (
          <>
            <span className="text-lime-400">✓ Added to Ideas</span>
            <button
              type="button"
              onClick={onDismiss}
              className="ml-auto text-zinc-500 transition-colors hover:text-zinc-200"
            >
              Hide
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onDismiss}
              disabled={saving}
              className="text-zinc-500 transition-colors hover:text-zinc-200"
            >
              Dismiss
            </button>
            {errored && (
              <span className="text-red-400">Couldn’t save — try again.</span>
            )}
            <button
              type="button"
              onClick={onAdd}
              disabled={saving || !card.title.trim()}
              className="ml-auto rounded-md bg-lime-400 px-3 py-1 text-xs font-medium text-zinc-950 transition-colors hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add to Ideas"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
