import { spawn } from "node:child_process";
import path from "node:path";

import { NextResponse } from "next/server";

import { createResearchReport, getLatestResearchReport } from "@/lib/db";

export const runtime = "nodejs";
// The script hits Reddit (with deliberate sleeps), YouTube, Trends, and Gemini,
// so a single run can take a few minutes.
export const maxDuration = 600;

// The script lives at the repo root (one level above the web app). Running it
// from there also lets python-dotenv pick up the root .env file.
const REPO_ROOT = path.join(process.cwd(), "..");
const SCRIPT = "tennis_content_research.py";
const PYTHON = process.env.CSPOT_PYTHON || "python3";

interface ScriptResult {
  report: string;
  generated_at?: string;
  reddit_count?: number;
  youtube_count?: number;
  trends_count?: number;
}

// GET — return the most recently saved report (if any).
export async function GET() {
  const latest = getLatestResearchReport();
  return NextResponse.json(latest ?? null);
}

// POST — run the research script, streaming progress as newline-delimited JSON.
// Each line is one event:
//   { "type": "progress", "line": "..." }
//   { "type": "result", "report": {...DB row...} }
//   { "type": "error", "message": "..." }
export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      const child = spawn(PYTHON, [SCRIPT, "--json"], {
        cwd: REPO_ROOT,
        env: process.env,
      });

      let stdout = "";
      let stderrTail = "";
      let stderrLineBuf = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      // Progress is emitted on stderr, one message per line.
      child.stderr.on("data", (chunk: Buffer) => {
        stderrLineBuf += chunk.toString();
        const lines = stderrLineBuf.split("\n");
        stderrLineBuf = lines.pop() ?? "";
        for (const line of lines) {
          stderrTail += line + "\n";
          if (line.trim()) send({ type: "progress", line });
        }
      });

      child.on("error", (err) => {
        send({
          type: "error",
          message: `Failed to start research script: ${err.message}`,
        });
        close();
      });

      child.on("close", (code) => {
        // Flush any trailing partial stderr line.
        if (stderrLineBuf.trim()) {
          send({ type: "progress", line: stderrLineBuf });
        }

        if (code !== 0) {
          send({
            type: "error",
            message: `Research script exited with code ${code}.${
              stderrTail ? "\n" + stderrTail.slice(-800) : ""
            }`,
          });
          close();
          return;
        }

        let parsed: ScriptResult;
        try {
          parsed = JSON.parse(stdout.trim());
        } catch {
          send({
            type: "error",
            message: "Could not parse research output as JSON.",
          });
          close();
          return;
        }

        try {
          const saved = createResearchReport({
            report: parsed.report,
            reddit_count: parsed.reddit_count,
            youtube_count: parsed.youtube_count,
            trends_count: parsed.trends_count,
          });
          send({ type: "result", report: saved });
        } catch (e) {
          send({
            type: "error",
            message: `Failed to save report: ${
              e instanceof Error ? e.message : String(e)
            }`,
          });
        }
        close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
