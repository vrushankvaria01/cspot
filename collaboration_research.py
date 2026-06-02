"""
Collaboration & partnership lead finder for a tennis + lifestyle creator.

Surfaces brands and fellow creators worth pitching for UGC / partnerships:
- Real YouTube creators in the niche, pulled live from the YouTube Data API
  (verifiable channels with links and subscriber counts).
- Gemini-curated brand leads across tennis apparel, gear, nutrition, and
  athleisure, plus Instagram/TikTok creator suggestions (flagged AI-sourced
  since those platforms have no free search API).
- Best-effort *real* email discovery: for AI brand leads with a website, the
  script fetches the homepage + contact page and scans for a public email. A
  lead is marked email_verified=true only when an email is actually found that
  way; AI-suggested emails are left unverified so you know to double-check.

Each lead gets a category, location, relevance score (0-100) against the
creator profile, a one-line rationale, and a personalized outreach message.

Progress is logged to stderr; `--json` prints a clean JSON result on stdout
(consumed by the web app's collaborations API). CLI behavior is unchanged.

Usage:
    python collaboration_research.py            # human-readable table
    python collaboration_research.py --json     # JSON on stdout, progress on stderr
"""

from __future__ import annotations

import json
import os
import re
import sys
import textwrap
import time

from dotenv import load_dotenv
load_dotenv()

from google import genai
from google.genai import types
import requests
from googleapiclient.discovery import build


# ---------- Config ----------

# Who we're finding partners for. Tweak this to sharpen relevance scoring and
# the tone of the generated outreach messages.
CREATOR_PROFILE = (
    "A tennis + lifestyle content creator who makes talking-head and short-form "
    "videos (TikTok, Reels, YouTube Shorts, and longer YouTube) covering pro-tour "
    "opinions, match reactions, news takes, tennis fashion/style, and "
    "tennis-adjacent lifestyle content. Looking for UGC deals and partnerships "
    "with brands, plus collaborations with fellow creators."
)

CATEGORIES = [
    "Tennis apparel & brands",
    "Racquets & gear",
    "Sports nutrition",
    "Athleisure & lifestyle",
]

YOUTUBE_CREATOR_QUERIES = [
    "tennis creator",
    "tennis lifestyle vlog",
    "tennis fashion",
    "tennis tips coaching",
    "tennis fan reaction",
]
YOUTUBE_PER_QUERY = 5
YOUTUBE_MAX_CHANNELS = 15

# How many fresh brand / IG / TikTok leads to ask Gemini for each run.
NEW_LEADS_TARGET = 12

# Email-scan limits (best-effort; many sites block or have no public email).
EMAIL_SCAN_MAX = 12
EMAIL_SCAN_TIMEOUT = 8

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
# Junk addresses that show up in markup but aren't real contacts.
EMAIL_BLOCKLIST = (
    "example.com", "sentry.", "wixpress.com", "@2x", ".png", ".jpg", ".gif",
    ".webp", ".svg", "your-email", "email@", "name@", "domain.com",
)


# ---------- Logging ----------

def log(msg: str = "") -> None:
    print(msg, file=sys.stderr, flush=True)


# ---------- YouTube creators (Data API v3) ----------

def collect_youtube_creators(existing: set[str]) -> list[dict]:
    api_key = os.environ.get("YOUTUBE_API_KEY")
    if not api_key:
        log("  YouTube: skipped (set YOUTUBE_API_KEY to enable)")
        return []

    yt = build("youtube", "v3", developerKey=api_key)

    channel_ids: list[str] = []
    seen_ids: set[str] = set()
    for query in YOUTUBE_CREATOR_QUERIES:
        if len(channel_ids) >= YOUTUBE_MAX_CHANNELS:
            break
        log(f"  YouTube: '{query}'")
        try:
            resp = yt.search().list(
                q=query,
                part="snippet",
                type="channel",
                maxResults=YOUTUBE_PER_QUERY,
            ).execute()
        except Exception as e:
            log(f"    ! failed: {e}")
            continue
        for item in resp.get("items", []):
            cid = item["snippet"].get("channelId") or item.get("id", {}).get("channelId")
            if cid and cid not in seen_ids:
                seen_ids.add(cid)
                channel_ids.append(cid)

    if not channel_ids:
        return []

    creators: list[dict] = []
    # channels.list accepts up to 50 ids per call.
    for start in range(0, len(channel_ids), 50):
        batch = channel_ids[start:start + 50]
        try:
            resp = yt.channels().list(
                part="snippet,statistics",
                id=",".join(batch),
            ).execute()
        except Exception as e:
            log(f"    ! channel lookup failed: {e}")
            continue
        for item in resp.get("items", []):
            snip = item.get("snippet", {})
            stats = item.get("statistics", {})
            title = snip.get("title", "").strip()
            if not title or title.lower() in existing:
                continue
            custom = snip.get("customUrl")
            url = (
                f"https://www.youtube.com/{custom}"
                if custom
                else f"https://www.youtube.com/channel/{item['id']}"
            )
            subs = stats.get("subscriberCount")
            creators.append({
                "name": title,
                "type": "creator",
                "platform": "youtube",
                "location": snip.get("country", ""),
                "website": url,
                "contact_url": f"{url}/about",
                "subscribers": int(subs) if subs and subs.isdigit() else None,
                "description": (snip.get("description") or "")[:400],
            })
    return creators[:YOUTUBE_MAX_CHANNELS]


# ---------- Best-effort real email discovery ----------

def find_email_on_site(website: str) -> str:
    if not website:
        return ""
    base = website.rstrip("/")
    candidates = [base, base + "/contact", base + "/contact-us", base + "/pages/contact"]
    for url in candidates:
        try:
            resp = requests.get(
                url,
                headers={"User-Agent": BROWSER_UA},
                timeout=EMAIL_SCAN_TIMEOUT,
            )
        except requests.RequestException:
            continue
        if resp.status_code != 200:
            continue
        for match in EMAIL_RE.findall(resp.text):
            low = match.lower()
            if any(bad in low for bad in EMAIL_BLOCKLIST):
                continue
            return match
    return ""


def enrich_emails(leads: list[dict]) -> None:
    scanned = 0
    for lead in leads:
        if scanned >= EMAIL_SCAN_MAX:
            break
        if lead.get("type") != "brand" or not lead.get("website"):
            continue
        if lead.get("email"):
            # AI suggested one already; still try to confirm a real one.
            pass
        scanned += 1
        log(f"  Email scan: {lead['name']}")
        found = find_email_on_site(lead["website"])
        if found:
            lead["email"] = found
            lead["email_verified"] = True


# ---------- Gemini curation + enrichment ----------

def _system_instruction() -> str:
    return textwrap.dedent(f"""
        You help a content creator build a partnerships/UGC outreach list.

        CREATOR PROFILE:
        {CREATOR_PROFILE}

        Target categories: {", ".join(CATEGORIES)}.

        For relevance scoring (0-100), reward strong audience/brand fit with the
        creator profile. Outreach messages must be warm, specific, and concise
        (2-4 sentences), reference why the partnership fits, and read like a real
        DM/email from this creator. Never invent fake-looking emails: only include
        an email if it is a genuinely public business contact you are confident
        about; otherwise leave email as an empty string.
    """).strip()


def _build_prompt(youtube_creators: list[dict], existing: set[str]) -> str:
    yt_lines = "\n".join(
        f"[{i}] {c['name']} — {c.get('subscribers') or '?'} subs — "
        f"{c['website']}\n    {c['description'][:200]}"
        for i, c in enumerate(youtube_creators)
    ) or "(none found)"

    avoid = ", ".join(sorted(existing)) if existing else "(none yet)"

    return textwrap.dedent(f"""
        Return ONLY a JSON object with this exact shape:

        {{
          "youtube_enrichment": [
            {{"index": <int matching the list below>,
              "category": "<one of the target categories or 'Fellow creators'>",
              "location": "<best-guess country/region or ''>",
              "relevance": <int 0-100>,
              "why": "<one short sentence on fit>",
              "outreach_message": "<personalized 2-4 sentence DM>"}}
          ],
          "new_leads": [
            {{"name": "<brand or creator name>",
              "type": "brand" | "creator",
              "platform": "instagram" | "tiktok" | "web" | "",
              "category": "<one of the target categories or 'Fellow creators'>",
              "location": "<country/region>",
              "relevance": <int 0-100>,
              "why": "<one short sentence on fit>",
              "email": "<public business email or ''>",
              "website": "<homepage or profile URL>",
              "contact_url": "<contact page or profile URL>",
              "outreach_message": "<personalized 2-4 sentence pitch>"}}
          ]
        }}

        Enrich EVERY YouTube creator below by index. Then add about
        {NEW_LEADS_TARGET} NEW leads across the target categories — a mix of
        real brands (with website + public email if you genuinely know it) and a
        few notable Instagram/TikTok tennis creators (with profile URLs). Do NOT
        repeat any of these existing names: {avoid}.

        YOUTUBE CREATORS TO ENRICH:
        {yt_lines}
    """).strip()


def generate_leads(youtube_creators: list[dict], existing: set[str]) -> dict:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        log("  Gemini: skipped (set GEMINI_API_KEY in your .env file)")
        return {"youtube_enrichment": [], "new_leads": []}

    client = genai.Client(api_key=api_key)
    prompt = _build_prompt(youtube_creators, existing)
    system = _system_instruction()

    for model_name in ("gemini-flash-lite-latest", "gemini-2.0-flash-lite", "gemini-2.0-flash"):
        for attempt in range(3):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system,
                        response_mime_type="application/json",
                        temperature=0.7,
                    ),
                )
                text = (response.text or "").strip()
                if text.startswith("```"):
                    text = text.strip("`")
                start = text.find("{")
                if start == -1:
                    raise json.JSONDecodeError("no JSON object found", text, 0)
                # raw_decode reads the first complete JSON value and ignores any
                # trailing data the model may have appended.
                obj, _ = json.JSONDecoder().raw_decode(text[start:])
                return obj
            except json.JSONDecodeError as e:
                log(f"    ! {model_name} returned invalid JSON: {e}")
                break
            except Exception as e:
                err = str(e)
                if "429" in err:
                    wait = 60
                    m = re.search(r"retryDelay.*?(\d+)s", err)
                    if m:
                        wait = int(m.group(1)) + 5
                    log(f"    Rate limited on {model_name}, waiting {wait}s (attempt {attempt+1}/3)...")
                    time.sleep(wait)
                else:
                    log(f"    ! {model_name} failed: {e}")
                    break
        else:
            log(f"    ! {model_name} exhausted retries, trying next model...")
            continue

    return {"youtube_enrichment": [], "new_leads": []}


# ---------- Merge ----------

def _coerce_relevance(value) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        return 50
    return max(0, min(100, n))


def merge_leads(youtube_creators: list[dict], curated: dict, existing: set[str]) -> list[dict]:
    enrich_by_index = {
        e.get("index"): e for e in curated.get("youtube_enrichment", [])
        if isinstance(e, dict)
    }

    leads: list[dict] = []

    # 1) Real YouTube creators, enriched but with factual fields preserved.
    for i, creator in enumerate(youtube_creators):
        e = enrich_by_index.get(i, {})
        leads.append({
            "name": creator["name"],
            "type": "creator",
            "platform": "youtube",
            "category": e.get("category") or "Fellow creators",
            "location": creator.get("location") or e.get("location") or "",
            "relevance": _coerce_relevance(e.get("relevance", 50)),
            "why": e.get("why", ""),
            "email": "",  # YouTube API never exposes business emails
            "website": creator["website"],
            "contact_url": creator["contact_url"],
            "email_verified": False,
            "source": "youtube_api",
            "subscribers": creator.get("subscribers"),
            "outreach_message": e.get("outreach_message", ""),
        })

    # 2) AI-curated brands + IG/TikTok creators.
    for nl in curated.get("new_leads", []):
        if not isinstance(nl, dict):
            continue
        name = (nl.get("name") or "").strip()
        if not name or name.lower() in existing:
            continue
        leads.append({
            "name": name,
            "type": nl.get("type") if nl.get("type") in ("brand", "creator") else "brand",
            "platform": nl.get("platform", ""),
            "category": nl.get("category") or "",
            "location": nl.get("location") or "",
            "relevance": _coerce_relevance(nl.get("relevance", 50)),
            "why": nl.get("why", ""),
            "email": (nl.get("email") or "").strip(),
            "website": (nl.get("website") or "").strip(),
            "contact_url": (nl.get("contact_url") or "").strip(),
            "email_verified": False,  # AI-suggested until confirmed by scan
            "source": "ai",
            "subscribers": None,
            "outreach_message": nl.get("outreach_message", ""),
        })

    return leads


# ---------- Orchestration ----------

def run_research(existing: set[str] | None = None) -> dict:
    existing = existing or set()
    log("Finding collaboration leads...\n")

    log("YouTube creators:")
    youtube_creators = collect_youtube_creators(existing)
    log(f"  → {len(youtube_creators)} channels\n")

    log("Curating brands & enriching with Gemini...")
    curated = generate_leads(youtube_creators, existing)
    leads = merge_leads(youtube_creators, curated, existing)
    log(f"  → {len(leads)} leads\n")

    log("Scanning brand sites for public emails...")
    enrich_emails(leads)
    verified = sum(1 for l in leads if l.get("email_verified"))
    log(f"  → {verified} verified email(s)\n")

    # Highest-relevance first.
    leads.sort(key=lambda l: l.get("relevance", 0), reverse=True)

    return {"leads": leads, "count": len(leads)}


# ---------- Main ----------

def main() -> None:
    json_mode = "--json" in sys.argv[1:]

    existing: set[str] = set()
    raw = os.environ.get("CSPOT_EXISTING_LEADS")
    if raw:
        try:
            existing = {str(n).strip().lower() for n in json.loads(raw)}
        except (json.JSONDecodeError, TypeError):
            pass

    result = run_research(existing)

    if json_mode:
        print(json.dumps(result))
        return

    print("=" * 72)
    print(f"COLLABORATION LEADS ({result['count']})")
    print("=" * 72)
    for lead in result["leads"]:
        email = lead["email"] or "(no public email)"
        verified = " [verified]" if lead.get("email_verified") else ""
        print(f"\n[{lead['relevance']:>3}] {lead['name']}  ({lead['type']}/{lead['platform']})")
        print(f"      {lead['category']} · {lead['location'] or 'location?'}")
        print(f"      {lead['why']}")
        print(f"      {email}{verified} · {lead['website']}")


if __name__ == "__main__":
    main()
