#!/usr/bin/env python3
"""One-time backfill: rewrite the outreach_message on every existing lead so it
uses the corrected framing (no claimed prior product use; genuine interest in
trying it / creating UGC / forming a partnership).

Leaves every other field untouched — only outreach_message is updated.

Usage:
    python backfill_messages.py            # rewrite all leads
    python backfill_messages.py --dry-run  # show first batch, write nothing

Reuses the Gemini client, system instruction, and corrected OUTREACH_GUIDE from
collaboration_research.py so the voice stays identical to fresh runs.
"""

import json
import os
import sqlite3
import sys
import textwrap

import collaboration_research as cr

DB_PATH = os.environ.get(
    "CSPOT_DB_PATH",
    os.path.join(os.path.dirname(__file__), "web", "data", "cspot.db"),
)
BATCH_SIZE = int(os.environ.get("CSPOT_BACKFILL_BATCH", "8"))


def fetch_leads(conn: sqlite3.Connection) -> list[dict]:
    cols = (
        "id, name, type, platform, category, location, relevance, why, "
        "email, website, outreach_channel"
    )
    rows = conn.execute(f"SELECT {cols} FROM collaborations ORDER BY id").fetchall()
    keys = [c.strip() for c in cols.split(",")]
    return [dict(zip(keys, row)) for row in rows]


def build_prompt(batch: list[dict]) -> str:
    lines = []
    for lead in batch:
        lines.append(json.dumps({
            "id": lead["id"],
            "name": lead["name"],
            "type": lead["type"],
            "category": lead["category"],
            "location": lead["location"],
            "why": lead["why"],
            "outreach_channel": lead["outreach_channel"] or "email",
        }, ensure_ascii=False))
    leads_block = "\n".join(lines)
    return textwrap.dedent(f"""
        Rewrite the outreach message for each lead below, in Vrushank's voice and
        following the OUTREACH MESSAGE GUIDE exactly. Do NOT claim he has ever
        used, owned, or tried the product — frame it as genuine interest in
        trying it and creating UGC / content, or forming a partnership.

        Use each lead's "outreach_channel" to set tone and formatting (email gets
        a "Subject:" line; DMs are shorter/casual; LinkedIn a touch formal).

        Keep each message to 3-6 short sentences and sign off as
        "Vrushank (@vrushwitharacquet)". Never use placeholder tokens.

        Leads (one JSON object per line):
        {leads_block}

        Return STRICT JSON only:
        {{ "messages": [ {{ "id": <number>, "outreach_message": "<message>" }} ] }}
        Include exactly one entry per lead id above.
    """).strip()


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]

    if cr._gemini_client() is None:
        cr.log("Gemini unavailable (set GEMINI_API_KEY). Nothing to do.")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    leads = fetch_leads(conn)
    cr.log(f"Backfilling messages for {len(leads)} leads "
           f"(batch size {BATCH_SIZE})...")

    system = cr._system_instruction()
    updated = 0
    failed = 0

    for start in range(0, len(leads), BATCH_SIZE):
        batch = leads[start:start + BATCH_SIZE]
        idx = start // BATCH_SIZE + 1
        cr.log(f"  Batch {idx}: leads {batch[0]['id']}–{batch[-1]['id']}")
        obj = cr.gemini_json(build_prompt(batch), system, temperature=0.85)
        messages = (obj or {}).get("messages") if isinstance(obj, dict) else None
        if not messages:
            cr.log("    ! no messages returned; skipping batch")
            failed += len(batch)
            continue

        by_id = {}
        for m in messages:
            if isinstance(m, dict) and "id" in m:
                msg = (m.get("outreach_message") or "").strip()
                if msg:
                    by_id[int(m["id"])] = msg

        for lead in batch:
            msg = by_id.get(lead["id"])
            if not msg:
                cr.log(f"    ! no message for #{lead['id']} {lead['name']}")
                failed += 1
                continue
            if dry_run:
                print(f"\n==== #{lead['id']} {lead['name']} "
                      f"[{lead['outreach_channel'] or 'email'}]")
                print(msg)
            else:
                conn.execute(
                    "UPDATE collaborations SET outreach_message = ? WHERE id = ?",
                    (msg, lead["id"]),
                )
            updated += 1

        if not dry_run:
            conn.commit()
        if dry_run:
            cr.log("  (dry run — stopping after first batch)")
            break

    conn.close()
    cr.log(f"Done. Updated {updated}, failed {failed}.")


if __name__ == "__main__":
    main()
