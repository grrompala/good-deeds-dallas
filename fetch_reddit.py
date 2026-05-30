"""
Scrapes volunteer-related posts from local DFW subreddits using Reddit's public
JSON API (no API key required for public subreddits).

Searches r/Richardson, r/Garland, r/DFW, and r/Dallas for volunteer-related
posts and saves them for LLM review/extraction.

Usage:
    pip install requests
    python fetch_reddit.py

Output:
    reddit_raw.json  — all matching posts, ready for LLM classification
"""

import json
import time
import re
import requests
from datetime import datetime, timezone
from pathlib import Path

OUTPUT_FILE = Path("frontend/public/data/reddit_raw.json")
DELAY = 1.0  # Reddit asks for 1 req/sec for unauthenticated access

HEADERS = {
    # Reddit requires a descriptive User-Agent for unauthenticated access
    "User-Agent": "VolunteerHubBot/1.0 (local nonprofit aggregator; contact: grrompala@gmail.com)"
}

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


def search_subreddit(subreddit: str, query: str, limit: int = 100) -> list[dict]:
    """
    Search a subreddit for a query using Reddit's JSON API.
    Handles pagination via 'after' token.
    """
    posts = []
    after = None
    page = 0

    while True:
        page += 1
        params = {
            "q": query,
            "restrict_sr": "on",
            "sort": "new",
            "t": "year",       # posts from last year
            "limit": 100,
            "type": "link",
        }
        if after:
            params["after"] = after

        url = f"https://www.reddit.com/r/{subreddit}/search.json"
        try:
            response = requests.get(url, headers=HEADERS, params=params, timeout=15)
        except requests.RequestException as e:
            print(f"    Request error: {e}")
            break

        if response.status_code == 429:
            print(f"    Rate limited — waiting 10s")
            time.sleep(10)
            continue
        if response.status_code != 200:
            print(f"    HTTP {response.status_code} for r/{subreddit} query '{query}'")
            break

        data = response.json()
        children = data.get("data", {}).get("children", [])
        if not children:
            break

        for child in children:
            post = child.get("data", {})
            posts.append(post)

        after = data.get("data", {}).get("after")
        fetched = len(posts)

        if not after or fetched >= limit:
            break

        time.sleep(DELAY)

    return posts


def normalize_post(post: dict, subreddit: str) -> dict:
    """Convert a raw Reddit post into our schema."""
    title = post.get("title", "")
    body = post.get("selftext", "") or ""
    full_text = f"{title} {body}"
    vol_score, loc_score = relevance_score(full_text)

    created = post.get("created_utc")
    created_iso = (
        datetime.fromtimestamp(created, tz=timezone.utc).isoformat()
        if created else None
    )

    return {
        "id": f"reddit_{post.get('id')}",
        "source": "reddit",
        "subreddit": subreddit,
        "source_url": f"https://www.reddit.com{post.get('permalink', '')}",
        "title": title,
        "body": body[:2000],  # cap at 2000 chars
        "author": post.get("author"),
        "score": post.get("score"),
        "num_comments": post.get("num_comments"),
        "created_utc": created_iso,
        "is_self": post.get("is_self"),         # True = text post, False = link
        "url": post.get("url"),                  # external link if any
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
            print(f"  → {len(posts)} raw results")

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
            existing[rid] = post  # always update (score/comments may change)

    # Sort output: highest relevance first, then by date
    all_records = sorted(
        existing.values(),
        key=lambda r: (
            -r.get("relevance", {}).get("total", 0),
            r.get("created_utc") or "",
        ),
        reverse=False,
    )
    # Re-sort: highest relevance desc, newest date desc within same relevance
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
        print(f"  [{score}] r/{rec['subreddit']} — {rec['title'][:70]}")


if __name__ == "__main__":
    main()
