"use client";

import { useState } from "react";

import type { Collaboration, CollabStatus } from "@/lib/types";

interface Props {
  lead: Collaboration;
  onChange: (lead: Collaboration) => void;
  onDelete: (lead: Collaboration) => void;
}

const STATUS_OPTIONS: { value: CollabStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "Waiting for reply" },
  { value: "done", label: "Got a response" },
];

const STATUS_STYLE: Record<CollabStatus, string> = {
  todo: "border-zinc-700 bg-zinc-800 text-zinc-300",
  in_progress: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  done: "border-lime-400/40 bg-lime-400/10 text-lime-300",
};

function relevanceStyle(score: number): string {
  if (score >= 70) return "bg-lime-400/15 text-lime-300 border-lime-400/30";
  if (score >= 40) return "bg-amber-400/15 text-amber-300 border-amber-400/30";
  return "bg-zinc-800 text-zinc-400 border-zinc-700";
}

function formatSubs(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  instagram_dm: "Instagram DM",
  tiktok_dm: "TikTok DM",
  contact_form: "Contact form",
  linkedin: "LinkedIn",
};

// Badge shown next to the name to indicate where the lead came from. Verified
// YouTube channels need no badge.
const SOURCE_BADGES: Record<string, { label: string; title: string }> = {
  ai: { label: "AI", title: "Suggested by AI — verify details before reaching out" },
  creator_sponsor: {
    label: "Sponsor",
    title: "A brand/product/service fellow creators have partnered with — verify before reaching out",
  },
  onbrand: {
    label: "OnBrand",
    title: "Reachable through your OnBrand account — verify on OnBrand",
  },
};

export default function LeadCard({ lead, onChange, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(lead.notes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [copied, setCopied] = useState(false);

  async function patch(body: Partial<{ status: CollabStatus; notes: string }>) {
    const res = await fetch(`/api/collaborations/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) onChange(await res.json());
    return res.ok;
  }

  async function handleStatus(status: CollabStatus) {
    onChange({ ...lead, status }); // optimistic
    await patch({ status });
  }

  async function saveNotes() {
    if (notes === lead.notes) return;
    setSavingNotes(true);
    await patch({ notes });
    setSavingNotes(false);
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(lead.outreach_message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard may be unavailable; no-op
    }
  }

  const subs = formatSubs(lead.subscribers);
  const hasEmail = lead.email.trim().length > 0;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 shrink-0 rounded-md border px-2 py-1 text-xs font-semibold tabular-nums ${relevanceStyle(
            lead.relevance,
          )}`}
          title="Relevance to your brand"
        >
          {lead.relevance}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-medium text-zinc-100">{lead.name}</h3>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
              {lead.type}
            </span>
            {lead.platform && (
              <span className="text-[11px] text-zinc-500">{lead.platform}</span>
            )}
            {subs && (
              <span className="text-[11px] text-zinc-500">· {subs} subs</span>
            )}
            {SOURCE_BADGES[lead.source] && (
              <span
                className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500"
                title={SOURCE_BADGES[lead.source].title}
              >
                {SOURCE_BADGES[lead.source].label}
              </span>
            )}
          </div>

          <p className="mt-1 text-xs text-zinc-500">
            {[lead.category, lead.location].filter(Boolean).join(" · ") ||
              "Uncategorized"}
          </p>
          {lead.why && (
            <p className="mt-1 text-xs text-zinc-400">{lead.why}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            {lead.outreach_channel && CHANNEL_LABELS[lead.outreach_channel] && (
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 text-[10px] text-zinc-300">
                <span className="text-zinc-500">Reach via</span>
                {CHANNEL_LABELS[lead.outreach_channel]}
              </span>
            )}
            {hasEmail ? (
              <span className="inline-flex items-center gap-1.5">
                <a
                  href={`mailto:${lead.email}`}
                  className="text-lime-400 hover:underline"
                >
                  {lead.email}
                </a>
                <span
                  className={`rounded px-1 py-0.5 text-[9px] uppercase tracking-wide ${
                    lead.email_verified
                      ? "bg-lime-400/15 text-lime-300"
                      : "bg-amber-400/15 text-amber-300"
                  }`}
                  title={
                    lead.email_verified
                      ? "Found on the brand's website"
                      : "AI-suggested — verify before sending"
                  }
                >
                  {lead.email_verified ? "verified" : "unverified"}
                </span>
              </span>
            ) : (
              <span className="text-zinc-600">No public email</span>
            )}
            {lead.website && (
              <a
                href={lead.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-zinc-100 hover:underline"
              >
                Website ↗
              </a>
            )}
            {lead.contact_url && lead.contact_url !== lead.website && (
              <a
                href={lead.contact_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-zinc-100 hover:underline"
              >
                Contact ↗
              </a>
            )}
          </div>
        </div>

        <select
          value={lead.status}
          onChange={(e) => handleStatus(e.target.value as CollabStatus)}
          className={`shrink-0 rounded-md border px-2 py-1 text-xs outline-none ${
            STATUS_STYLE[lead.status]
          }`}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-zinc-900 text-zinc-100">
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-zinc-800 pt-2 text-[11px]">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-zinc-400 transition-colors hover:text-zinc-100"
        >
          {expanded ? "Hide details" : "Outreach & notes"}
        </button>
        <button
          type="button"
          onClick={() => onDelete(lead)}
          className="ml-auto text-red-400/80 transition-colors hover:text-red-400"
        >
          Remove
        </button>
      </div>

      {expanded && (
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-400">
                Suggested outreach message
              </span>
              {lead.outreach_message && (
                <button
                  type="button"
                  onClick={copyMessage}
                  className="text-[11px] text-lime-400 hover:underline"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              )}
            </div>
            <p className="whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
              {lead.outreach_message || "(none generated)"}
            </p>
          </div>

          <div>
            <span className="mb-1 block text-[11px] font-medium text-zinc-400">
              Your notes
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={3}
              placeholder="Outreach history, who you spoke to, follow-up dates…"
              className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-lime-400/60"
            />
            {savingNotes && (
              <span className="text-[10px] text-zinc-600">Saving…</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
