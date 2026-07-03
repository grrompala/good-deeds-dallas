"""
Scrapes volunteer-related posts from local DFW subreddits using Reddit's
public RSS/Atom search feed (search.rss) — no app registration or login
required.

Reddit now blocks the old unauthenticated www.reddit.com/*.json endpoints
outright (403), and as of mid-2026 self-serve OAuth "script" app creation is
gated behind a manual-approval process that most requests never hear back on.
The search.rss endpoint is still open to a plain descriptive User-Agent, just
rate-limited (429) more aggressively than the old JSON API was, so this
backs off hard between requests.

Searches r/Richardson, r/Garland, r/DFW, and r/Dallas for volunteer-related
posts and saves them for LLM review/extraction.

Usage:
    pip install requests beautifulsoup4 lxml
    python fetch_reddit.py

Output:
    reddit_raw.json  — all matching posts, ready for LLM classification
"""

import json
import time
import xml.etree.ElementTree as ET
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from pathlib import Path

OUTPUT_FILE = Path("frontend/public/data/reddit_raw.json")
DELAY = 5.0  # search.rss rate-limits (429) much faster than the old JSON API did
MAX_RETRIES = 3

USER_AGENT = "VolunteerHubBot/1.0 (local nonprofit aggregator; contact: grrompala@gmail.com)"
ATOM_NS = {"a": "http://www.w3.org/2005/Atom"}

# Subreddits to search — ordered by relevance to Richardson/Garland
SUBREDDITS = [
    "Richardson",
    "Garland",
    "plano",          # neighboring, often overlaps
    "DFW",
    "Dallas",
]

# Keywords to search for in each subreddit
SEARCH_QUERIES = [
    "volunteer",
    "volunteering",
    "volunteers needed",
    "community service",
]

# Keywords used to score/filter posts after fetching
HIGH_VALUE_KEYWORDS = [
    "volunteer", "volunteering", "volunteers needed", "looking for volunteers",
    "food bank", "food pantry", "habitat for humanity", "animal shelter",
    "soup kitchen", "fundraiser", "charity", "nonprofit", "non-profit",
    "community garden", "clean up", "cleanup", "tutoring", "mentor",
    "help needed", "help us", "join us", "sign up", "sign-up",
    "free", "donate", "donation", "giveback", "give back",
]

LOCATION_KEYWORDS = [
    "richardson", "garland", "plano", "allen", "mckinney",
    "collin county", "dallas county", "dfw", "north dallas", "tx", "texas",
]


def relevance_score(text: str) -> tuple[int, int]:
    """Return (volunteer_hits, location_hits) for a post's text."""
    text_lower = text.lower()
    vol_hits = sum(1 for kw in HIGH_VALUE_KEYWORDS if kw in text_lower)
    loc_hits = sum(1 for kw in LOCATION_KEYWORDS if kw in text_lower)
    return vol_hits, loc_hits


def parse_entry(entry) -> dict:
    """Pull the fields we need out of one Atom <entry>."""
    def text(tag):
        el = entry.find(f"a:{tag}", ATOM_NS)
        return el.text if el is not None else None

    raw_id = text("id") or ""
    post_id = raw_id.split("_")[-1] if raw_id.startswith("t3_") else raw_id

    author_el = entry.find("a:author/a:name", ATOM_NS)
    author = (author_el.text or "").removeprefix("/u/") if author_el is not None else None

    link_el = entry.find("a:link", ATOM_NS)
    link = link_el.get("href") if link_el is not None else None

    content_el = entry.find("a:content", ATOM_NS)
    body_html = content_el.text or "" if content_el is not None else ""
    body_text = BeautifulSoup(body_html, "lxml").get_text(separator=" ").strip()

    return {
        "id": post_id,
        "title": text("title") or "",
        "author": author,
        "link": link,
        "updated": text("updated"),
        "body": body_text,
    }


def search_subreddit(subreddit: str, query: str, limit: int = 100) -> list[dict]:
    """Search a subreddit via its RSS/Atom search feed. No pagination — a
    single request capped at `limit` (RSS doesn't expose an 'after' cursor
    the way the JSON API did), which is plenty for a recent-posts sweep."""
    params = {
        "q": query,
        "restrict_sr": "on",
        "sort": "new",
        "t": "year",       # posts from last year
        "limit": limit,
    }
    url = f"https://www.reddit.com/r/{subreddit}/search.rss"
    headers = {"User-Agent": USER_AGENT}

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = requests.get(url, headers=headers, params=params, timeout=15)
        except requests.RequestException as e:
            print(f"    Request error: {e}")
            return []

        if response.status_code == 429:
            wait = 20 * attempt
            print(f"    Rate limited — waiting {wait}s (attempt {attempt}/{MAX_RETRIES})")
            time.sleep(wait)
            continue
        if response.status_code != 200:
            print(f"    HTTP {response.status_code} for r/{subreddit} query '{query}'")
            return []

        try:
            root = ET.fromstring(response.content)
        except ET.ParseError as e:
            print(f"    Feed parse error: {e}")
            return []
        return [parse_entry(e) for e in root.findall("a:entry", ATOM_NS)]

    print(f"    Giving up on r/{subreddit} query '{query}' after {MAX_RETRIES} rate-limited attempts")
    return []


def normalize_post(post: dict, subreddit: str) -> dict:
    """Convert a parsed RSS entry into our schema."""
    title = post.get("title", "")
    body = post.get("body", "") or ""
    full_text = f"{title} {body}"
    vol_score, loc_score = relevance_score(full_text)

    return {
        "id": f"reddit_{post.get('id')}",
        "source": "reddit",
        "subreddit": subreddit,
        "source_url": post.get("link"),
        "title": title,
        "body": body[:2000],  # cap at 2000 chars
        "author": post.get("author"),
        "created_utc": post.get("updated"),  # already ISO 8601
        "relevance": {
            "volunteer_keyword_hits": vol_score,
            "location_keyword_hits": loc_score,
            "total": vol_score + loc_score,
        },
        "status": "needs_llm_review",
        "last_scraped": datetime.now(timezone.utc).isoformat(),
    }


def main():
    print("=== Reddit Volunteer Scraper ===\n")

    # Load existing to avoid duplicates
    existing: dict[str, dict] = {}
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            for rec in json.load(f):
                existing[rec["id"]] = rec
        print(f"Loaded {len(existing)} existing records\n")

    new_count = 0

    for subreddit in SUBREDDITS:
        print(f"\n--- r/{subreddit} ---")
        sub_posts: dict[str, dict] = {}

        for query in SEARCH_QUERIES:
            print(f"  Searching: '{query}'...")
            posts = search_subreddit(subreddit, query)
            print(f"  -> {len(posts)} raw results")

            for post in posts:
                pid = post.get("id")
                if not pid or pid in sub_posts:
                    continue
                normalized = normalize_post(post, subreddit)
                # Only keep posts with at least 1 volunteer keyword hit
                if normalized["relevance"]["volunteer_keyword_hits"] >= 1:
                    sub_posts[pid] = normalized

            time.sleep(DELAY)

        # Sort by relevance, show summary
        sorted_posts = sorted(
            sub_posts.values(),
            key=lambda p: p["relevance"]["total"],
            reverse=True
        )
        print(f"  Kept {len(sorted_posts)} relevant posts after filtering")

        for post in sorted_posts:
            rid = post["id"]
            if rid not in existing:
                new_count += 1
            existing[rid] = post  # always update

    # Sort output: highest relevance first, then newest within same relevance
    all_records = sorted(
        existing.values(),
        key=lambda r: (
            r.get("relevance", {}).get("total", 0),
            r.get("created_utc") or "",
        ),
        reverse=True,
    )

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_records, f, indent=2, ensure_ascii=False)

    print(f"\n=== Done ===")
    print(f"Total records: {len(all_records)} ({new_count} new)")
    print(f"Saved to {OUTPUT_FILE}")

    # Print top 10 most relevant for a quick sanity check
    print("\nTop 10 by relevance:")
    for rec in all_records[:10]:
        score = rec["relevance"]["total"]
        print(f"  [{score}] r/{rec['subreddit']} - {rec['title'][:70]}")


if __name__ == "__main__":
    main()
