"""
Collaboration & partnership lead finder for Vrushank Varia
(@vrushwitharacquet) — a tennis + lifestyle content creator.

Goes wide. The goal is hundreds of relevant, real-feeling leads, built up
incrementally across runs (re-running KEEPS what you have and only appends new
names — dedupe is handled by the web app's database and by the existing-names
list passed in via CSPOT_EXISTING_LEADS).

What it pulls:
- Real YouTube creators in the niche, live from the YouTube Data API
  (verifiable channels with links + subscriber counts).
- Past partnerships of fellow tennis/lifestyle creators — the brands,
  products, and services they've actually worked with — surfaced from Gemini's
  knowledge and grounded in the real creators we discovered (flagged so you can
  verify before reaching out).
- A wide sweep of brand/product/service leads across ~16 categories: apparel,
  racquets & strings, footwear, nutrition, hydration, energy/focus, recovery &
  wearables, athleisure, accessories, grooming, travel, sports tech & training
  aids (ball machines, sensors, apps), clubs & academies, physio/spa/recovery
  services, mental-performance apps, and creator gear. Niche products (e.g. a
  ball-launcher) and services (spas, detox, recovery) are explicitly in scope.
- OnBrand roster: Vrushank has an OnBrand account (the IRL brand<>creator
  network). Seeded with confirmed OnBrand brand partners and expanded with
  Gemini's knowledge of their catalog, flagged source="onbrand".

For every lead: category, location, relevance (0-100) vs. the creator profile,
a one-line rationale, a suggested OUTREACH CHANNEL (email / Instagram DM /
TikTok DM / contact form / LinkedIn), and a simple, professional outreach
message written in Vrushank's voice. Brand emails are best-effort verified by
scanning the site; AI-suggested emails stay flagged unverified.

Progress logs to stderr; `--json` prints a clean JSON result on stdout
(consumed by the web app's collaborations API).

Usage:
    python collaboration_research.py            # human-readable table
    python collaboration_research.py --json     # JSON on stdout, progress on stderr

Tunables (env): CSPOT_LEADS_PER_CATEGORY, CSPOT_CREATOR_PARTNER_LEADS,
CSPOT_ONBRAND_LEADS, CSPOT_EMAIL_SCAN_MAX, CSPOT_YOUTUBE_MAX_CHANNELS.
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


# ---------- Who we're finding partners for ----------

CREATOR_PROFILE = (
    "Vrushank Varia (Instagram @vrushwitharacquet) is a tennis + lifestyle "
    "content creator based in Hong Kong. He makes short-form and talking-head "
    "videos across Instagram Reels, TikTok, and YouTube — pro-tour takes, match "
    "reactions, tennis fashion/style, training, and the mental side of "
    "performance. He has 10+ years of competitive tennis and plays for the "
    "Indian Recreation Club in Hong Kong, works as an RPE Analyst at Morgan "
    "Stanley, and has strong networks across Hong Kong and India. He's after "
    "brand partnerships, UGC deals, ambassador programs, and collaborations "
    "with fellow creators — relevant to tennis, sport, wellness, and an "
    "active, design-led lifestyle."
)

# Voice guide for the outreach messages, modeled on a real pitch Vrushank sends.
OUTREACH_GUIDE = textwrap.dedent("""
    Write every outreach message in Vrushank's voice: simple, warm, and
    professional — never salesy, hyped, or generic.

    Structure (keep it to 3-6 short sentences):
    - Open with a specific, genuine line that shows real research about THAT
      brand/creator (a product, a campaign, something they actually do).
    - One or two lines on who he is and why the fit is natural — pick what's
      relevant from: tennis + lifestyle audience, 10+ years competitive tennis,
      the mental side of performance, Hong Kong / India networks, plays for the
      Indian Recreation Club in HK.
    - A clear, low-pressure ask tailored to the lead: an ambassador program,
      UGC, or a content partnership for brands; a collab for fellow creators.
    - Offer a quick call and a thank-you.

    Channel formatting:
    - For an email lead, begin the message with "Subject: <short specific
      subject>" then a blank line, then the body.
    - Instagram/TikTok DMs are a touch shorter and more casual, still
      professional. LinkedIn is a touch more formal.
    - Always sign off as "Vrushank (@vrushwitharacquet)".
    - NEVER use placeholder tokens like [Name], [Brand], or [your link].
""").strip()


# ---------- Categories (wide on purpose) ----------

CATEGORIES = [
    "Tennis apparel & on-court wear",
    "Racquets, strings & gear",
    "Tennis & court footwear",
    "Sports nutrition & supplements",
    "Hydration & electrolytes",
    "Energy, focus & nootropics (gum, drinks)",
    "Recovery, wearables & sleep tech",
    "Athleisure & lifestyle apparel",
    "Sunglasses, bags & accessories",
    "Grooming & skincare for athletes",
    "Travel, luggage & lifestyle brands",
    "Sports tech & training aids (ball machines, sensors, coaching apps)",
    "Tennis clubs, academies & court brands",
    "Physio, massage, spa, detox & recovery services",
    "Mental performance & wellness apps",
    "Creator gear (cameras, mics, editing tools)",
]

# Confirmed OnBrand brand partners (public, from OnBrand's own marketing).
# Gemini expands this with the rest of the roster it knows.
ONBRAND_SEED = [
    "Poppi", "OLIPOP", "Liquid Death", "Bloom Nutrition",
    "Gruns", "PepsiCo", "Nestlé",
]

# ---------- Volume / limits (env-tunable) ----------

def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except (TypeError, ValueError):
        return default

LEADS_PER_CATEGORY = _int_env("CSPOT_LEADS_PER_CATEGORY", 25)
CREATOR_PARTNER_LEADS = _int_env("CSPOT_CREATOR_PARTNER_LEADS", 40)
ONBRAND_LEADS = _int_env("CSPOT_ONBRAND_LEADS", 30)
EMAIL_SCAN_MAX = _int_env("CSPOT_EMAIL_SCAN_MAX", 40)
EMAIL_SCAN_TIMEOUT = 8

YOUTUBE_CREATOR_QUERIES = [
    "tennis creator", "tennis lifestyle vlog", "tennis fashion",
    "tennis tips coaching", "tennis fan reaction", "tennis vlog",
    "tennis influencer", "tennis gear review",
]
YOUTUBE_PER_QUERY = 8
YOUTUBE_MAX_CHANNELS = _int_env("CSPOT_YOUTUBE_MAX_CHANNELS", 25)

# Small pause between Gemini calls to stay friendly with the rate limiter.
GEMINI_CALL_PAUSE = 1.0
GEMINI_MODELS = ("gemini-flash-lite-latest", "gemini-2.0-flash-lite", "gemini-2.0-flash")

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
EMAIL_BLOCKLIST = (
    "example.com", "sentry.", "wixpress.com", "@2x", ".png", ".jpg", ".gif",
    ".webp", ".svg", "your-email", "email@", "name@", "domain.com",
)

VALID_CHANNELS = ("email", "instagram_dm", "tiktok_dm", "contact_form", "linkedin", "")


# ---------- Logging ----------

def log(msg: str = "") -> None:
    print(msg, file=sys.stderr, flush=True)


# ---------- Gemini helper ----------

_client: genai.Client | None = None


def _gemini_client() -> genai.Client | None:
    global _client
    if _client is not None:
        return _client
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        log("  Gemini: skipped (set GEMINI_API_KEY in your .env file)")
        return None
    _client = genai.Client(api_key=api_key)
    return _client


def gemini_json(prompt: str, system: str, temperature: float = 0.8):
    """Call Gemini and return the first complete JSON value, or None."""
    client = _gemini_client()
    if client is None:
        return None

    for model_name in GEMINI_MODELS:
        for attempt in range(3):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system,
                        response_mime_type="application/json",
                        temperature=temperature,
                    ),
                )
                text = (response.text or "").strip()
                if text.startswith("```"):
                    text = text.strip("`")
                # Find the first JSON value (object or array).
                start = min(
                    [i for i in (text.find("{"), text.find("[")) if i != -1],
                    default=-1,
                )
                if start == -1:
                    raise json.JSONDecodeError("no JSON found", text, 0)
                obj, _ = json.JSONDecoder().raw_decode(text[start:])
                return obj
            except json.JSONDecodeError as e:
                log(f"    ! {model_name} returned invalid JSON: {e}")
                break
            except Exception as e:
                err = str(e)
                if "429" in err or "RESOURCE_EXHAUSTED" in err:
                    wait = 60
                    m = re.search(r"retryDelay.*?(\d+)s", err)
                    if m:
                        wait = int(m.group(1)) + 5
                    log(f"    rate limited on {model_name}, waiting {wait}s "
                        f"(attempt {attempt + 1}/3)...")
                    time.sleep(wait)
                else:
                    log(f"    ! {model_name} failed: {e}")
                    break
        else:
            continue
    return None


def _leads_from(obj) -> list[dict]:
    """Accept either a bare list or {'leads': [...]}; return list of dicts."""
    if isinstance(obj, list):
        items = obj
    elif isinstance(obj, dict):
        items = obj.get("leads") or obj.get("new_leads") or []
    else:
        items = []
    return [x for x in items if isinstance(x, dict)]


def _lead_schema_hint() -> str:
    return textwrap.dedent("""
        Each lead is an object:
        {
          "name": "<brand / product / service / creator name>",
          "type": "brand" | "product" | "service" | "creator",
          "platform": "instagram" | "tiktok" | "youtube" | "web" | "",
          "category": "<one of the target categories, or 'Fellow creators'>",
          "location": "<country/region, or '' if global/unknown>",
          "relevance": <int 0-100, fit with the creator profile>,
          "why": "<one short sentence on why it fits Vrushank>",
          "email": "<public business email, or '' if you're not certain>",
          "website": "<homepage or profile URL>",
          "contact_url": "<contact / partnerships / profile URL>",
          "outreach_channel": "email" | "instagram_dm" | "tiktok_dm"
                              | "contact_form" | "linkedin",
          "outreach_message": "<simple, professional message in Vrushank's voice>"
        }
    """).strip()


def _system_instruction() -> str:
    return textwrap.dedent(f"""
        You build a partnerships / UGC outreach list for a content creator.

        CREATOR PROFILE:
        {CREATOR_PROFILE}

        OUTREACH MESSAGE GUIDE:
        {OUTREACH_GUIDE}

        Rules:
        - Only suggest REAL, well-known or plausibly real organizations/people.
          Do not invent fictional brands.
        - Score relevance (0-100) by genuine audience/brand fit with the profile.
        - Pick outreach_channel by what's realistic: brands with a public
          partnerships email -> "email"; brands/creators best reached on social
          -> "instagram_dm" or "tiktok_dm"; otherwise "contact_form"; use
          "linkedin" only for B2B/agency-style contacts.
        - Never fabricate emails. Only include an email if you're genuinely
          confident it's a real public business address; otherwise use "".
        - Return STRICT JSON only, no prose.
    """).strip()


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
                q=query, part="snippet", type="channel",
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
    for start in range(0, len(channel_ids), 50):
        batch = channel_ids[start:start + 50]
        try:
            resp = yt.channels().list(
                part="snippet,statistics", id=",".join(batch),
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
                f"https://www.youtube.com/{custom}" if custom
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
                url, headers={"User-Agent": BROWSER_UA}, timeout=EMAIL_SCAN_TIMEOUT,
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
        if lead.get("type") not in ("brand", "product", "service"):
            continue
        if not lead.get("website") or lead.get("email_verified"):
            continue
        scanned += 1
        log(f"  Email scan ({scanned}/{EMAIL_SCAN_MAX}): {lead['name']}")
        found = find_email_on_site(lead["website"])
        if found:
            lead["email"] = found
            lead["email_verified"] = True
            if lead.get("outreach_channel") in ("", "contact_form"):
                lead["outreach_channel"] = "email"


# ---------- Lead generation passes ----------

def _normalize_lead(raw: dict, source: str, default_type: str = "brand") -> dict | None:
    name = (raw.get("name") or "").strip()
    if not name:
        return None
    lead_type = raw.get("type")
    if lead_type not in ("brand", "product", "service", "creator"):
        lead_type = default_type
    channel = raw.get("outreach_channel")
    if channel not in VALID_CHANNELS:
        channel = ""
    try:
        relevance = max(0, min(100, int(raw.get("relevance", 50))))
    except (TypeError, ValueError):
        relevance = 50
    email = (raw.get("email") or "").strip()
    website = (raw.get("website") or "").strip()
    contact_url = (raw.get("contact_url") or "").strip()
    platform = raw.get("platform") or ""
    # Infer a channel if the model didn't give one.
    if not channel:
        if email:
            channel = "email"
        elif platform == "instagram":
            channel = "instagram_dm"
        elif platform == "tiktok":
            channel = "tiktok_dm"
        elif website or contact_url:
            channel = "contact_form"
    return {
        "name": name,
        "type": lead_type,
        "platform": platform,
        "category": raw.get("category") or "",
        "location": raw.get("location") or "",
        "relevance": relevance,
        "why": raw.get("why", ""),
        "email": email,
        "website": website,
        "contact_url": contact_url,
        "email_verified": False,
        "source": source,
        "subscribers": None,
        "outreach_channel": channel,
        "outreach_message": raw.get("outreach_message", ""),
    }


def generate_category_leads(category: str, avoid: set[str]) -> list[dict]:
    avoid_str = ", ".join(sorted(avoid)[:400]) if avoid else "(none yet)"
    prompt = textwrap.dedent(f"""
        Category to mine: "{category}".

        Give me about {LEADS_PER_CATEGORY} REAL leads in this category that fit
        Vrushank — a mix of brands, specific products, services, and (where the
        category is creators) fellow creators. Favour ones an active tennis +
        lifestyle audience would actually care about, including niche/indie
        names, not just the obvious giants. Include the channel you'd use and a
        ready-to-send outreach message for each.

        Do NOT repeat any of these names (already on the list):
        {avoid_str}

        Return STRICT JSON: {{ "leads": [ ... ] }} where
        {_lead_schema_hint()}
    """).strip()

    obj = gemini_json(prompt, _system_instruction())
    out: list[dict] = []
    for raw in _leads_from(obj):
        lead = _normalize_lead(raw, source="ai")
        if lead and lead["name"].lower() not in avoid:
            if not lead["category"]:
                lead["category"] = category
            out.append(lead)
            avoid.add(lead["name"].lower())
    return out


def generate_creator_partnership_leads(
    creators: list[dict], avoid: set[str]
) -> list[dict]:
    names = [c["name"] for c in creators]
    creator_str = "; ".join(names[:25]) if names else \
        "(none discovered — use well-known tennis/lifestyle creators you know)"
    avoid_str = ", ".join(sorted(avoid)[:400]) if avoid else "(none yet)"

    prompt = textwrap.dedent(f"""
        Look at tennis & lifestyle creators across YouTube, Instagram, and
        TikTok — including these real ones we found: {creator_str}.

        From your knowledge, list the BRANDS, PRODUCTS, and SERVICES these and
        similar creators have actually partnered with, been sponsored by, or are
        known to use — the kind of partnership Vrushank could realistically land
        too. Cast a wide net: include niche tennis products (e.g. ball-launcher
        / ball-machine style gadgets), recovery and wellness services (spas,
        detox, physio, cold plunge), apparel, nutrition, energy, and tech.

        Give about {CREATOR_PARTNER_LEADS} leads. For each, in "why", briefly
        note the partnership angle (e.g. "sponsors several tennis YouTubers").

        Do NOT repeat any of these names: {avoid_str}

        Return STRICT JSON: {{ "leads": [ ... ] }} where
        {_lead_schema_hint()}
    """).strip()

    obj = gemini_json(prompt, _system_instruction())
    out: list[dict] = []
    for raw in _leads_from(obj):
        lead = _normalize_lead(raw, source="creator_sponsor")
        if lead and lead["name"].lower() not in avoid:
            out.append(lead)
            avoid.add(lead["name"].lower())
    return out


def generate_onbrand_leads(avoid: set[str]) -> list[dict]:
    seed_str = ", ".join(ONBRAND_SEED)
    avoid_str = ", ".join(sorted(avoid)[:400]) if avoid else "(none yet)"

    prompt = textwrap.dedent(f"""
        Vrushank has an account on OnBrand (onbrand.com) — the IRL network that
        connects creators/event hosts with brands for sponsorships and product
        sampling. Confirmed OnBrand brand partners include: {seed_str}.

        List about {ONBRAND_LEADS} brands that are on OnBrand or are exactly the
        kind of consumer / wellness / beverage / lifestyle brand that uses
        OnBrand, and that fit Vrushank's tennis + lifestyle audience. Include the
        confirmed seeds above (with full details) plus others you know of.

        Because these are reachable through OnBrand, set outreach_channel to
        "contact_form" unless you know a better public channel, and mention
        OnBrand in the outreach_message where natural.

        Do NOT repeat any of these names: {avoid_str}

        Return STRICT JSON: {{ "leads": [ ... ] }} where
        {_lead_schema_hint()}
    """).strip()

    obj = gemini_json(prompt, _system_instruction())
    out: list[dict] = []
    for raw in _leads_from(obj):
        lead = _normalize_lead(raw, source="onbrand", default_type="brand")
        if lead and lead["name"].lower() not in avoid:
            out.append(lead)
            avoid.add(lead["name"].lower())
    return out


def enrich_youtube_creators(creators: list[dict], avoid: set[str]) -> list[dict]:
    """Score + write outreach for the real YouTube channels we found."""
    if not creators:
        return []
    listing = "\n".join(
        f"[{i}] {c['name']} — {c.get('subscribers') or '?'} subs — {c['website']}\n"
        f"    {c['description'][:200]}"
        for i, c in enumerate(creators)
    )
    prompt = textwrap.dedent(f"""
        For each YouTube creator below, decide fit with Vrushank and write a
        collab outreach message (Instagram or YouTube DM style).

        Return STRICT JSON: {{ "enrichment": [
          {{"index": <int>, "category": "<category or 'Fellow creators'>",
            "location": "<country or ''>", "relevance": <int 0-100>,
            "why": "<one sentence>", "outreach_channel": "instagram_dm",
            "outreach_message": "<message>"}}
        ] }}

        CREATORS:
        {listing}
    """).strip()

    obj = gemini_json(prompt, _system_instruction())
    enrich = {}
    if isinstance(obj, dict):
        for e in obj.get("enrichment", []):
            if isinstance(e, dict) and isinstance(e.get("index"), int):
                enrich[e["index"]] = e

    out: list[dict] = []
    for i, c in enumerate(creators):
        if c["name"].lower() in avoid:
            continue
        e = enrich.get(i, {})
        try:
            relevance = max(0, min(100, int(e.get("relevance", 50))))
        except (TypeError, ValueError):
            relevance = 50
        channel = e.get("outreach_channel")
        if channel not in VALID_CHANNELS:
            channel = "instagram_dm"
        out.append({
            "name": c["name"],
            "type": "creator",
            "platform": "youtube",
            "category": e.get("category") or "Fellow creators",
            "location": c.get("location") or e.get("location") or "",
            "relevance": relevance,
            "why": e.get("why", ""),
            "email": "",
            "website": c["website"],
            "contact_url": c["contact_url"],
            "email_verified": False,
            "source": "youtube_api",
            "subscribers": c.get("subscribers"),
            "outreach_channel": channel,
            "outreach_message": e.get("outreach_message", ""),
        })
        avoid.add(c["name"].lower())
    return out


# ---------- Orchestration ----------

def run_research(existing: set[str] | None = None) -> dict:
    existing = existing or set()
    avoid = set(existing)  # grows as we collect, to dedupe within the run
    leads: list[dict] = []

    log("Finding collaboration leads — going wide.\n")

    # 1) Real YouTube creators, then enrich them.
    log("YouTube creators:")
    youtube_creators = collect_youtube_creators(existing)
    log(f"  → {len(youtube_creators)} channels")
    if youtube_creators:
        enriched = enrich_youtube_creators(youtube_creators, avoid)
        leads.extend(enriched)
        log(f"  → enriched {len(enriched)}")
        time.sleep(GEMINI_CALL_PAUSE)
    log("")

    # 2) Past partnerships of fellow creators (brands/products/services).
    log("Mining creator partnerships (brands, products, services)...")
    partner_leads = generate_creator_partnership_leads(youtube_creators, avoid)
    leads.extend(partner_leads)
    log(f"  → {len(partner_leads)} leads")
    time.sleep(GEMINI_CALL_PAUSE)
    log("")

    # 3) OnBrand roster.
    log("OnBrand roster...")
    onbrand_leads = generate_onbrand_leads(avoid)
    leads.extend(onbrand_leads)
    log(f"  → {len(onbrand_leads)} leads")
    time.sleep(GEMINI_CALL_PAUSE)
    log("")

    # 4) Wide category sweep.
    log(f"Category sweep across {len(CATEGORIES)} categories "
        f"(~{LEADS_PER_CATEGORY} each)...")
    for category in CATEGORIES:
        cat_leads = generate_category_leads(category, avoid)
        leads.extend(cat_leads)
        log(f"  • {category}: +{len(cat_leads)} (total {len(leads)})")
        time.sleep(GEMINI_CALL_PAUSE)
    log("")

    # 5) Best-effort real email discovery for brands/products/services.
    log("Scanning sites for public emails...")
    enrich_emails(leads)
    verified = sum(1 for l in leads if l.get("email_verified"))
    log(f"  → {verified} verified email(s)\n")

    leads.sort(key=lambda l: l.get("relevance", 0), reverse=True)
    log(f"Done. {len(leads)} new leads this run.\n")
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
        channel = lead.get("outreach_channel") or "?"
        print(f"\n[{lead['relevance']:>3}] {lead['name']}  "
              f"({lead['type']}/{lead['platform'] or '—'}) · via {channel}")
        print(f"      {lead['category']} · {lead['location'] or 'location?'}")
        print(f"      {lead['why']}")
        print(f"      {email}{verified} · {lead['website']}")


if __name__ == "__main__":
    main()
