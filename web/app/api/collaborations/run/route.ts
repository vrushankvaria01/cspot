import { spawn } from "node:child_process";
import path from "node:path";

import {
  bulkCreateCollaborations,
  getCollaborationNames,
  type CollaborationInput,
} from "@/lib/db";

export const runtime = "nodejs";
// A deep run does many Gemini passes (with rate-limit backoff) plus email
// scans, so it can run for a while. Generous ceiling for the local tool.
export const maxDuration = 3600;

const REPO_ROOT = path.join(process.cwd(), "..");
const SCRIPT = "collaboration_research.py";
const PYTHON = process.env.CSPOT_PYTHON || "python3";

interface ScriptResult {
  leads: CollaborationInput[];
  count?: number;
}

// POST — run the lead-finder, streaming progress as newline-delimited JSON:
//   { "type": "progress", "line": "..." }
//   { "type": "result", "inserted": <n>, "leads": [...new rows...] }
//   { "type": "error", "message": "..." }
export async function POST() {
  const encoder = new TextEncoder();

  // Pass existing names so the script can avoid re-suggesting them.
  let existingJson = "[]";
  try {
    existingJson = JSON.stringify(getCollaborationNames());
  } catch {
    // ignore — worst case the script just dedupes nothing
  }

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
        env: { ...process.env, CSPOT_EXISTING_LEADS: existingJson },
      });

      let stdout = "";
      let stderrTail = "";
      let stderrLineBuf = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

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
          message: `Failed to start lead-finder: ${err.message}`,
        });
        close();
      });

      child.on("close", (code) => {
        if (stderrLineBuf.trim()) {
          send({ type: "progress", line: stderrLineBuf });
        }

        if (code !== 0) {
          send({
            type: "error",
            message: `Lead-finder exited with code ${code}.${
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
          send({ type: "error", message: "Could not parse lead output as JSON." });
          close();
          return;
        }

        try {
          const inserted = bulkCreateCollaborations(parsed.leads ?? []);
          send({
            type: "result",
            inserted: inserted.length,
            found: parsed.leads?.length ?? 0,
            leads: inserted,
          });
        } catch (e) {
          send({
            type: "error",
            message: `Failed to save leads: ${
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
