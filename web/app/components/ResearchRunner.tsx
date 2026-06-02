"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ResearchReport {
  id: number;
  report: string;
  reddit_count: number;
  youtube_count: number;
  trends_count: number;
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
