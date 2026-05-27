# cspot

A multi-platform content research tool for tennis creators. Pulls signals from Reddit, YouTube, and Google Trends, then uses AI to surface video ideas, quotable fan reactions, and cross-platform trends — all in one automated report.

---

## What It Does

Running the script produces a structured content report covering:

1. **Top 5 video ideas** — each with a hook, one-sentence pitch, reason why it's relevant now, and recommended format (short-form vs long-form)
2. **Top 10 Reddit comments worth quoting** — funny, sharp, or contrarian comments pulled verbatim with source links, ready to use as talking points
3. **Emerging trends to watch** — rising search queries from Google Trends and YouTube view patterns
4. **Cross-platform signals** — stories appearing across Reddit, YouTube, and Trends simultaneously (the highest-confidence content opportunities)

### Data Sources

| Source | What's collected | Auth required |
|---|---|---|
| Reddit | Top posts + comments from r/tennis, r/10s, r/TennisForum, r/tennisfashion | None |
| YouTube Data API | Top videos by view count across 5 tennis search queries (past 7 days) | API key |
| Google Trends | Rising related queries for 5 tennis keywords (past 7 days) | None |
| Gemini AI | Analyzes all of the above and writes the report | API key |

---

## Key Design Decisions

### Reddit: No API access — public `.json` endpoints instead
Reddit's official API requires approval through their Responsible Builder Policy, which can be difficult to get for personal/small projects. Instead, this tool uses Reddit's **public `.json` endpoints** — any Reddit URL returns structured JSON data when you append `.json` to it (e.g. `reddit.com/r/tennis/top.json`). No credentials, no OAuth, no approval needed. The only requirement is a descriptive `User-Agent` header and polite rate limiting (2 seconds between requests).

### AI model: Gemini instead of Claude
The script was originally built around the **Anthropic Claude API**, but that requires a paid account. For anyone wanting to run this for free, the analysis section was rewritten to use **Google's Gemini API**, which has a generous free tier (1,500 requests/day, 1 million tokens/minute). The script uses `gemini-2.0-flash` as the primary model with automatic fallbacks to `gemini-2.0-flash-lite` and `gemini-flash-lite-latest` if rate limits are hit.

---

## Setup

### 1. Clone the repo

```bash
git clone git@github.com:vrushankvaria01/cspot.git
cd cspot
```

### 2. Install dependencies

```bash
pip install requests google-genai google-api-python-client pytrends python-dotenv
```

### 3. Get your API keys

**Gemini API key (free)**
1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in with Google → click **Create API key**
3. Copy the key (starts with `AIza...`)

**YouTube Data API key (free, optional)**
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project → search for **YouTube Data API v3** → Enable it
3. Go to **Credentials** → **Create Credentials** → **API key**
4. Optionally restrict the key to YouTube Data API v3 only
5. Free quota: 10,000 units/day — the script uses 500 units per run (5 queries × 100 units each)

> If you skip the YouTube key, that section is skipped gracefully and the report runs on Reddit + Trends data only.

### 4. Create your `.env` file

Create a file called `.env` in the project root (it is gitignored and will never be committed):

```
GEMINI_API_KEY=your-gemini-key-here
YOUTUBE_API_KEY=your-youtube-key-here
```

### 5. Run it

```bash
python tennis_content_research.py
```

**Expected runtime:** ~2–3 minutes (Reddit scraping is intentionally slow to stay within rate limits)

---

## Configuration

All tunable settings are at the top of `tennis_content_research.py`:

```python
SUBREDDITS = ["tennis", "10s", "TennisForum", "tennisfashion"]  # subreddits to scrape
TIME_FILTER = "week"        # "day" | "week" | "month" | "year"
POSTS_PER_SUB = 10          # posts to fetch per subreddit
COMMENTS_PER_POST = 15      # top-level comments to fetch per post

YOUTUBE_QUERIES = ["tennis", "ATP", "WTA", "tennis drama", "tennis fashion"]
YOUTUBE_LOOKBACK_DAYS = 7   # how far back to search YouTube

TRENDS_KEYWORDS = ["tennis", "ATP", "WTA", "Wimbledon", "Roland Garros"]
```

---

## Notes

- Reddit's public `.json` API is rate-limited to roughly 10 requests/minute unauthenticated. The script sleeps 2 seconds between calls automatically.
- Google Trends (via `pytrends`) can occasionally return 429 errors — the script retries up to 3 times with backoff.
- Gemini free tier limits are per-minute and per-day. If the primary model is rate-limited, the script automatically falls back to smaller models before giving up.
