"""
Scrapes volunteer opportunities from Idealist via its Algolia search backend.

How it works:
  Idealist's site is a Next.js SPA backed by Algolia. The Algolia application
  ID and search-only API key are both public (shipped in the client JS), so
  we can hit the search endpoint directly without an Idealist account.

  Discovered via Chrome DevTools → Network → the `queries?x-algolia-agent=...`
  XHR fired when paginating /en/volunteer.

Usage:
    pip install requests
    python fetch_idealist.py

Output:
    frontend/public/data/volops_idealist.json
"""

import json
import time
import requests
from datetime import datetime, timezone
from pathlib import Path

# ── Algolia credentials (public, embedded in Idealist's client JS) ───────────
ALGOLIA_APP_ID  = "NSV3AUESS7"
ALGOLIA_API_KEY = "c2730ea10ab82787f2f3cc961e8c1e06"
ALGOLIA_INDEX   = "idealist7-production-action-opps"
ALGOLIA_HOST    = f"https://{ALGOLIA_APP_ID}-dsn.algolia.net"

# ── Geo: Dallas-centered search radius ──────────────────────────────────────
DALLAS_LAT, DALLAS_LNG = 32.776664, -96.796988
SEARCH_RADIUS_METERS   = 50_000     # ~30 miles — covers the whole metro
HITS_PER_PAGE          = 100

OUTPUT_FILE = Path("frontend/public/data/volops_idealist.json")
DELAY = 0.4

HEADERS = {
    "X-Algolia-API-Key":        ALGOLIA_API_KEY,
    "X-Algolia-Application-Id": ALGOLIA_APP_ID,
    "Content-Type":             "application/json",
    "User-Agent":               "Mozilla/5.0 (compatible; YallVolunteerBot/1.0; +mailto:grrompala@gmail.com)",
}


def algolia_query(page: int) -> dict | None:
    """Run one Algolia search request for a given page (0-indexed)."""
    payload = {
        "requests": [{
            "indexName":            ALGOLIA_INDEX,
            "hitsPerPage":          HITS_PER_PAGE,
            "attributesToRetrieve": ["*"],
            "filters":              "actionType:'VOLOP' AND (source:'IDEALIST')",
            "removeStopWords":      True,
            "ignorePlurals":        True,
            "aroundLatLng":         f"{DALLAS_LAT}, {DALLAS_LNG}",
            "aroundPrecision":      15000,
            "minimumAroundRadius":  SEARCH_RADIUS_METERS,
            "page":                 page,
            "query":                "",
        }]
    }
    try:
        resp = requests.post(
            f"{ALGOLIA_HOST}/1/indexes/*/queries",
            headers=HEADERS,
            data=json.dumps(payload),
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("results", [{}])[0]
    except (requests.RequestException, ValueError) as e:
        print(f"  Algolia page {page} error: {e}")
        return None


def normalize(hit: dict) -> dict:
    """
    Convert a raw Algolia hit into our shared record schema. Field names on
    the Algolia side vary; we check several common shapes defensively.
    """
    object_id = hit.get("objectID") or hit.get("id") or hit.get("slug")
    title     = hit.get("name") or hit.get("title") or "Untitled"
    desc      = hit.get("description") or hit.get("summary") or ""

    # Organization name (top-level string on Algolia)
    org_name = hit.get("orgName") or hit.get("organization")
    if isinstance(org_name, dict):
        org_name = org_name.get("name")

    # Location — top-level `city`/`state`/`stateStr` fields on Idealist hits
    city  = hit.get("city")
    state = hit.get("state") or hit.get("stateStr")
    full_addr = hit.get("address")

    # Cause tags — intentionally not pulled from Idealist. Their native tags
    # are noisy and inconsistent with our taxonomy. `classify_listings.py`
    # assigns clean `unified_tags` on the next run.
    tag_names = []

    # Detail URL — Idealist returns a per-language dict like
    #   {"en": "/en/volunteer-opportunity/<id>-<slug>", "es": "...", "pt": "..."}
    # We want the English absolute URL.
    def absolutize(path):
        if not path: return None
        if path.startswith("http"): return path
        return f"https://www.idealist.org{path}"

    def pick_lang(raw):
        if isinstance(raw, dict):
            return raw.get("en") or next(iter(raw.values()), None)
        return raw

    source_url = absolutize(pick_lang(hit.get("url") or hit.get("canonicalUrl")))
    if not source_url:
        slug = hit.get("slug") or object_id
        if slug:
            source_url = f"https://www.idealist.org/en/volunteer-opportunity/{slug}"

    # Org URL — also a per-language dict
    org_url = absolutize(pick_lang(hit.get("orgUrl") or hit.get("organizationUrl")))

    # Remote / virtual flag
    is_virtual = bool(
        hit.get("isRemote")
        or hit.get("remote")
        or hit.get("remoteOk")
        or (hit.get("locationType") == "REMOTE")
    )

    # Published date — Algolia gives a Unix timestamp in `published`. Convert
    # to ISO so downstream code (UI / sorting) can parse it.
    published_iso = None
    pub_ts = hit.get("published") or hit.get("publishedAt") or hit.get("publishedForAlerts")
    if isinstance(pub_ts, (int, float)) and pub_ts > 0:
        try:
            published_iso = datetime.fromtimestamp(pub_ts, tz=timezone.utc).isoformat()
        except (ValueError, OSError):
            pass

    # Schedule (when the volunteer slot is, not when it was posted)
    schedule = {}
    if hit.get("startDate"):
        schedule["date"] = hit["startDate"]
    elif hit.get("startsOn"):
        schedule["date"] = hit["startsOn"]

    return {
        "id":                f"idealist_{object_id}" if object_id else None,
        "source":            "idealist",
        "source_url":        source_url,
        "org_name":          org_name,
        "org_url":           org_url,
        "opportunity_title": title,
        "description_short": (desc[:250].rsplit(" ", 1)[0] + "…") if len(desc) > 250 else desc,
        "description_long":  desc,
        "cause_tags":        tag_names,
        "is_virtual":        is_virtual,
        "published":         published_iso,    # ISO date the opp was posted
        "schedule":          schedule,
        "address": {
            "full":  full_addr,
            "city":  city,
            "state": state,
        },
        "status":       "active",
        "last_scraped": datetime.now(timezone.utc).isoformat(),
    }


def collect_all_hits() -> list[dict]:
    """Page through every Idealist VOLOP near Dallas via Algolia."""
    all_hits = []
    page = 0
    total_pages = None

    while True:
        print(f"  Algolia page {page}...")
        result = algolia_query(page)
        if not result:
            break

        if total_pages is None:
            total_pages = result.get("nbPages", 0)
            print(f"  Algolia reports {result.get('nbHits', 0)} hits across {total_pages} pages")

        hits = result.get("hits", [])
        if not hits:
            print(f"  Empty page — stopping.")
            break

        all_hits.extend(hits)
        print(f"  Got {len(hits)} hits (total so far: {len(all_hits)})")

        page += 1
        if total_pages and page >= total_pages:
            break
        time.sleep(DELAY)

    return all_hits


def main():
    print("=== Idealist Scraper (via Algolia) ===\n")

    existing: dict[str, dict] = {}
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            for rec in json.load(f):
                if rec.get("id"):
                    existing[rec["id"]] = rec
        print(f"Loaded {len(existing)} existing records\n")

    print("--- Fetching from Algolia ---")
    hits = collect_all_hits()
    print(f"\nTotal hits fetched: {len(hits)}\n")

    active_ids = set()
    for hit in hits:
        rec = normalize(hit)
        if not rec.get("id"):
            continue
        active_ids.add(rec["id"])
        # Preserve unified_tags from previous classifier runs
        if rec["id"] in existing and "unified_tags" in existing[rec["id"]]:
            rec["unified_tags"] = existing[rec["id"]]["unified_tags"]
        existing[rec["id"]] = rec

    removed = 0
    for rid in list(existing.keys()):
        if rid.startswith("idealist_") and rid not in active_ids:
            existing[rid]["status"] = "inactive"
            removed += 1
    if removed:
        print(f"Marked {removed} records as inactive (no longer listed)")

    records = sorted(existing.values(), key=lambda r: r.get("opportunity_title") or "")
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    active = sum(1 for r in records if r.get("status") == "active" and r.get("source") == "idealist")
    print(f"\nSaved {len(records)} total ({active} active) to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
