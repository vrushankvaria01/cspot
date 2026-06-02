"""
Multi-platform tennis content research tool.

Pulls signals from Reddit (public .json), YouTube (Data API), and Google Trends,
then hands everything to Gemini to surface video opportunities and talking points
for a tennis + lifestyle creator.

Usage:
    python tennis_content_research.py            # human-readable report on stdout
    python tennis_content_research.py --json     # JSON result on stdout, progress on stderr
"""

from __future__ import annotations

import json
import os
import sys
import textwrap
import time
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
load_dotenv()

from google import genai
from google.genai import types
import requests
from googleapiclient.discovery import build
from pytrends.request import TrendReq


# ---------- Config ----------

SUBREDDITS = ["tennis", "10s", "TennisForum", "tennisfashion"]
TIME_FILTER = "week"  # "day" | "week" | "month" | "year"
POSTS_PER_SUB = 10
COMMENTS_PER_POST = 15

YOUTUBE_QUERIES = ["tennis", "ATP", "WTA", "tennis drama", "tennis fashion"]
YOUTUBE_LOOKBACK_DAYS = 7

TRENDS_KEYWORDS = ["tennis", "ATP", "WTA", "Wimbledon", "Roland Garros"]

USER_AGENT = (
    "tennis-content-research/0.1 "
    "(personal research script; contact: your-email@example.com)"
)

REDDIT_SLEEP = 2.0  # seconds between Reddit calls (free tier: ~10/min)


# ---------- Logging ----------
# Progress goes to stderr so that --json mode can keep stdout clean for the
# machine-readable result (consumed by the web app's research API route).

def log(msg: str = "") -> None:
    print(msg, file=sys.stderr, flush=True)


# ---------- Reddit (no auth) ----------

def reddit_get(url: str, params: dict | None = None) -> dict | list:
    resp = requests.get(
        url,
        params=params,
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_reddit_posts(subreddit: str) -> list[dict]:
    data = reddit_get(
        f"https://www.reddit.com/r/{subreddit}/top.json",
        params={"t": TIME_FILTER, "limit": POSTS_PER_SUB},
    )
    return [child["data"] for child in data["data"]["children"]]


def fetch_reddit_comments(permalink: str) -> list[str]:
    data = reddit_get(f"https://www.reddit.com{permalink}.json")
    if not isinstance(data, list) or len(data) < 2:
        return []
    comments = []
    for child in data[1]["data"]["children"][:COMMENTS_PER_POST]:
        if child.get("kind") != "t1":
            continue
        body = child["data"].get("body", "").strip()
        score = child["data"].get("score", 0)
        if body and body != "[deleted]":
            comments.append(f"[+{score}] {body[:500]}")
    return comments


def collect_reddit() -> list[dict]:
    all_posts = []
    for sub in SUBREDDITS:
        log(f"  Reddit: r/{sub}")
        try:
            posts = fetch_reddit_posts(sub)
        except requests.HTTPError as e:
            log(f"    ! failed: {e}")
            continue
        for p in posts:
            try:
                comments = fetch_reddit_comments(p["permalink"])
            except requests.HTTPError:
                comments = []
            all_posts.append({
                "subreddit": sub,
                "title": p["title"],
                "body": (p.get("selftext") or "")[:500],
                "score": p["score"],
                "num_comments": p["num_comments"],
                "url": f"https://reddit.com{p['permalink']}",
                "flair": p.get("link_flair_text"),
                "comments": comments,
            })
            time.sleep(REDDIT_SLEEP)
        time.sleep(REDDIT_SLEEP)
    return all_posts


# ---------- YouTube (Data API v3) ----------

def collect_youtube() -> list[dict]:
    api_key = os.environ.get("YOUTUBE_API_KEY")
    if not api_key:
        log("  YouTube: skipped (set YOUTUBE_API_KEY to enable)")
        return []

    yt = build("youtube", "v3", developerKey=api_key)
    published_after = (
        datetime.now(timezone.utc) - timedelta(days=YOUTUBE_LOOKBACK_DAYS)
    ).isoformat()

    results = []
    for query in YOUTUBE_QUERIES:
        log(f"  YouTube: '{query}'")
        try:
            resp = yt.search().list(
                q=query,
                part="snippet",
                type="video",
                order="viewCount",
                publishedAfter=published_after,
                maxResults=10,
            ).execute()
        except Exception as e:
            log(f"    ! failed: {e}")
            continue

        for item in resp.get("items", []):
            results.append({
                "query": query,
                "title": item["snippet"]["title"],
                "channel": item["snippet"]["channelTitle"],
                "description": item["snippet"]["description"][:300],
                "published_at": item["snippet"]["publishedAt"],
                "url": f"https://youtube.com/watch?v={item['id']['videoId']}",
            })
    return results


# ---------- Google Trends ----------

def collect_trends() -> dict:
    log(f"  Google Trends: {TRENDS_KEYWORDS}")
    for attempt in range(3):
        try:
            pytrends = TrendReq(hl="en-US", tz=360)
            pytrends.build_payload(TRENDS_KEYWORDS, timeframe="now 7-d")
            related = pytrends.related_queries()
            rising = {}
            for kw in TRENDS_KEYWORDS:
                entry = related.get(kw)
                if entry and entry.get("rising") is not None:
                    rising[kw] = entry["rising"].head(10).to_dict("records")
            return rising
        except Exception as e:
            err = str(e)
            if "429" in err and attempt < 2:
                wait = 30 * (attempt + 1)
                log(f"    Rate limited, retrying in {wait}s...")
                time.sleep(wait)
            else:
                log(f"    ! failed: {e}")
                return {}
    return {}


# ---------- Gemini analysis ----------

def analyze_with_gemini(
    reddit_posts: list[dict],
    youtube_videos: list[dict],
    trends: dict,
) -> str:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return "(no analysis — set GEMINI_API_KEY in your .env file)"

    client = genai.Client(api_key=api_key)

    reddit_text = "\n\n".join(
        f"[R{i}] r/{p['subreddit']} | {p['score']}↑ | {p['num_comments']} comments\n"
        f"Title: {p['title']}\n"
        f"Body: {p['body'] or '(none)'}\n"
        f"Top comments:\n" + "\n".join(f"  - {c}" for c in p["comments"][:10])
        for i, p in enumerate(reddit_posts)
    )

    youtube_text = "\n".join(
        f"[Y{i}] ({v['query']}) {v['channel']}: {v['title']}"
        for i, v in enumerate(youtube_videos)
    ) or "(none)"

    trends_text = json.dumps(trends, indent=2, default=str)[:3000] or "(none)"

    user_prompt = textwrap.dedent(f"""
        Analyze the following research from the last week and produce:

        ## 1. Top 5 video ideas, ranked
        For each: hook, 1-sentence pitch, why now, format (short or long).

        ## 2. Top 10 Reddit comments worth quoting
        Pick comments that are funny, sharp, contrarian, or capture the fan mood.
        Quote verbatim with the Reddit post link.

        ## 3. Emerging trends to watch
        From Google Trends + YouTube search volume — what's accelerating?

        ## 4. Cross-platform signal
        Any story showing up across Reddit + YouTube + Trends? Those are gold.

        ---

        ## REDDIT POSTS + COMMENTS
        {reddit_text}

        ## YOUTUBE TOP VIDEOS (past {YOUTUBE_LOOKBACK_DAYS} days)
        {youtube_text}

        ## GOOGLE TRENDS — RISING QUERIES
        {trends_text}
    """).strip()

    system_instruction = textwrap.dedent("""
        You are a content strategist for a creator who makes talking-head videos
        (TikTok, Reels, YouTube Shorts, and longer YouTube) covering tennis
        opinions, match reactions, news takes, and tennis + lifestyle content.
        They use Reddit comments to source talking points and counterpoints.

        Your job is to surface what to make next. Prioritize: pro tour storylines,
        controversies, fan reactions, fashion/style moments, and topics with
        strong opinion-bait potential.
    """).strip()

    for model_name in ("gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-flash-lite-latest"):
        for attempt in range(3):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=user_prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                    ),
                )
                return response.text
            except Exception as e:
                err = str(e)
                if "429" in err:
                    wait = 60
                    # parse suggested retry delay if present
                    import re
                    m = re.search(r"retryDelay.*?(\d+)s", err)
                    if m:
                        wait = int(m.group(1)) + 5
                    log(f"    Rate limited on {model_name}, waiting {wait}s (attempt {attempt+1}/3)...")
                    time.sleep(wait)
                else:
                    log(f"    ! {model_name} failed: {e}")
                    break  # non-rate-limit error, try next model
        else:
            log(f"    ! {model_name} exhausted retries, trying next model...")
            continue

    return "(analysis failed — Gemini quota exhausted on all models)"


# ---------- Orchestration ----------

def run_research() -> dict:
    """Collect signals from all sources and analyze them.

    Returns a structured result. All progress is logged to stderr via log(),
    so the returned dict (and its JSON form) stays clean for programmatic use.
    """
    log("Collecting signals...\n")

    log("Reddit:")
    reddit_posts = collect_reddit()
    log(f"  → {len(reddit_posts)} posts\n")

    log("YouTube:")
    youtube_videos = collect_youtube()
    log(f"  → {len(youtube_videos)} videos\n")

    log("Trends:")
    trends = collect_trends()
    log(f"  → {len(trends)} keyword groups\n")

    log("Analyzing with Gemini...\n")
    report = analyze_with_gemini(reddit_posts, youtube_videos, trends)

    return {
        "report": report,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "reddit_count": len(reddit_posts),
        "youtube_count": len(youtube_videos),
        "trends_count": len(trends),
    }


# ---------- Main ----------

def main() -> None:
    json_mode = "--json" in sys.argv[1:]

    result = run_research()

    if json_mode:
        # Machine-readable: only JSON on stdout.
        print(json.dumps(result))
    else:
        # Human-readable: pretty report on stdout.
        print("=" * 72)
        print("CONTENT RESEARCH REPORT")
        print("=" * 72)
        print(result["report"])


if __name__ == "__main__":
    main()
