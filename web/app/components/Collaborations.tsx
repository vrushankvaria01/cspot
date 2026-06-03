"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Collaboration, CollabStatus } from "@/lib/types";
import LeadCard from "./LeadCard";

const STATUS_FILTERS: { value: "all" | CollabStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "Waiting" },
  { value: "done", label: "Responded" },
];

type SortKey = "relevance" | "name";

export default function Collaborations() {
  const [leads, setLeads] = useState<Collaboration[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [runSummary, setRunSummary] = useState("");

  const [statusFilter, setStatusFilter] = useState<"all" | CollabStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("relevance");

  const logRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/collaborations");
      setLeads(await res.json());
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [progress]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads) if (l.category) set.add(l.category);
    return [...set].sort();
  }, [leads]);

  const locations = useMemo(() => {
    const set = new Set<string>();
    for (const l of leads) if (l.location) set.add(l.location);
    return [...set].sort();
  }, [leads]);

  const visible = useMemo(() => {
    let out = leads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (categoryFilter !== "all" && l.category !== categoryFilter) return false;
      if (locationFilter !== "all" && l.location !== locationFilter) return false;
      return true;
    });
    out = [...out].sort((a, b) =>
      sortKey === "relevance"
        ? b.relevance - a.relevance
        : a.name.localeCompare(b.name),
    );
    return out;
  }, [leads, statusFilter, categoryFilter, locationFilter, sortKey]);

  function handleLeadChange(updated: Collaboration) {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  async function handleDelete(lead: Collaboration) {
    if (!window.confirm(`Remove "${lead.name}" from your list?`)) return;
    const previous = leads;
    setLeads((prev) => prev.filter((l) => l.id !== lead.id));
    try {
      const res = await fetch(`/api/collaborations/${lead.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
    } catch {
      setLeads(previous);
      setError("Couldn't remove that lead — try again.");
    }
  }

  async function findLeads() {
    setRunning(true);
    setError("");
    setRunSummary("");
    setProgress([]);

    try {
      const res = await fetch("/api/collaborations/run", { method: "POST" });
      if (!res.ok || !res.body) throw new Error(`Server returned ${res.status}`);

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
            inserted?: number;
            found?: number;
            leads?: Collaboration[];
          };
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.type === "progress" && event.line) {
            setProgress((prev) => [...prev, event.line!]);
          } else if (event.type === "result") {
            const newLeads = event.leads ?? [];
            setLeads((prev) => [...newLeads, ...prev]);
            const inserted = event.inserted ?? newLeads.length;
            const found = event.found ?? inserted;
            setRunSummary(
              inserted > 0
                ? `Added ${inserted} new lead${inserted === 1 ? "" : "s"}` +
                    (found > inserted ? ` (${found - inserted} already on your list)` : "")
                : "No new leads this run — everything found was already on your list.",
            );
          } else if (event.type === "error") {
            setError(event.message || "Lead search failed.");
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setRunning(false);
    }
  }

  const selectClass =
    "rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-lime-400/60";

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Collaborations
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Brands, products, services, and creators worth pitching — from
            tennis gear and nutrition to recovery, lifestyle, and OnBrand
            partners. Each lead suggests how to reach out and drafts a message.
            Re-run anytime to append fresh leads without losing your list.
          </p>
        </div>
        <button
          type="button"
          onClick={findLeads}
          disabled={running}
          className="shrink-0 rounded-lg bg-lime-400 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Finding…" : "Find new leads"}
        </button>
      </div>

      {running && (
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2 text-sm text-zinc-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-lime-400" />
            Searching YouTube, curating brands, scanning for emails…
          </div>
          <div
            ref={logRef}
            className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 font-mono text-xs leading-relaxed text-zinc-400"
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

      {runSummary && !running && (
        <div className="mb-4 rounded-lg border border-lime-400/30 bg-lime-400/5 px-4 py-2 text-sm text-lime-200">
          {runSummary}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-300">
          <p className="font-medium">Something went wrong</p>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-red-400/90">
            {error}
          </pre>
        </div>
      )}

      {loading ? (
        <p className="py-16 text-center text-sm text-zinc-600">Loading…</p>
      ) : leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 py-16 text-center">
          <p className="text-sm text-zinc-500">No leads yet.</p>
          <p className="mt-1 text-sm text-zinc-600">
            Hit “Find new leads” to build your outreach list.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-zinc-800 p-0.5">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatusFilter(f.value)}
                  className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                    statusFilter === f.value
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={selectClass}
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className={selectClass}
            >
              <option value="all">All locations</option>
              {locations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>

            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className={`${selectClass} ml-auto`}
            >
              <option value="relevance">Sort: Relevance</option>
              <option value="name">Sort: Name</option>
            </select>
          </div>

          <p className="mb-3 text-xs text-zinc-600">
            {visible.length} of {leads.length} leads
          </p>

          <div className="flex flex-col gap-3">
            {visible.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onChange={handleLeadChange}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
