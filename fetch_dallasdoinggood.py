"""
Fetches volunteer opportunities from Dallas Doing Good (dallasdoinggood.com).

How it works:
  The site is WordPress + "The Events Calendar" (Tribe) plugin, which ships a
  public, unauthenticated REST API. We pull the "volunteer" event category:

    GET /wp-json/tribe/events/v1/events
        ?categories=volunteer&per_page=50&page=N&start_date=YYYY-MM-DD HH:MM:SS

  Cloudflare 403s a non-browser User-Agent, so we send a browser one.

  Most opportunities are RECURRING: each date is a separate "occurrence" with its
  own numeric `id` and a dated `url`, but a STABLE `slug`. We page through every
  upcoming occurrence, group by slug, and emit ONE collapsed record per
  opportunity — recurring when it repeats, one-time when it doesn't. This mirrors
  Voly's schedule shape (date/time/duration/recurring/raw) so the rest of the
  pipeline (rule-based expiry) and the frontend (date-hiding for recurring) work
  unchanged.

  The API's `organizer` field is always empty, so org names are derived from each
  event's external `website` (present on every event), with an override map for
  domains that don't de-slug cleanly.

Usage:
    pip install requests
    python fetch_dallasdoinggood.py

Output:
    frontend/public/data/volops_dallasdoinggood.json
"""

import html
import json
import re
import time
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests

API_URL     = "https://dallasdoinggood.com/wp-json/tribe/events/v1/events"
CATEGORY    = "volunteer"
PER_PAGE    = 50
OUTPUT_FILE = Path("frontend/public/data/volops_dallasdoinggood.json")
SOURCE      = "dallasdoinggood"
DELAY       = 0.4

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
    "Accept": "application/json",
}

# Curated domain -> display name overrides, for orgs whose registrable domain
# doesn't de-slug into a clean name (concatenated words, acronyms, etc.).
# Expand this after a run by spot-checking the emitted org_name values.
ORG_NAME_OVERRIDES = {
    "hugscafe.org":         "HUGS Cafe",
    "cedarhillshares.org":  "Cedar Hill Shares",
    "bodyandsouldallas.org": "Body & Soul Dallas",
}

# Third-party signup/ticketing platforms — an event's `website` often points
# here instead of the host org's own site, so the domain is a useless org name
# ("Eventbrite", "Vomo"). For these we fall back to the event title instead.
PLATFORM_DOMAINS = {
    "eventbrite.com", "vomo.org", "signupgenius.com", "google.com", "docs.google.com",
    "forms.gle", "galaxydigital.com", "givepulse.com", "mobilize.us", "volunteerhub.com",
    "facebook.com", "linktr.ee", "givebutter.com", "paperform.co",
}

_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


# ── HTTP ─────────────────────────────────────────────────────────────────────
def fetch_page(page: int, start_date: str) -> dict | None:
    """One API request for a page of upcoming volunteer occurrences (3 tries)."""
    params = {
        "categories": CATEGORY,
        "per_page":   PER_PAGE,
        "page":       page,
        "start_date": start_date,
    }
    for attempt in range(3):
        try:
            resp = requests.get(API_URL, headers=HEADERS, params=params, timeout=20)
            # The API 404s past the last page rather than returning an empty list.
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.json()
        except (requests.RequestException, ValueError) as e:
            print(f"  page {page} attempt {attempt + 1} error: {e}")
            time.sleep(1 + attempt)
    return None


def collect_all_occurrences() -> list[dict]:
    """Page through every upcoming volunteer-category occurrence."""
    # start_date = now (site-local) so the API returns only upcoming occurrences.
    start_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    all_occ, page, total_pages = [], 1, None

    while True:
        print(f"  page {page}...")
        data = fetch_page(page, start_date)
        if not data:
            break
        if total_pages is None:
            total_pages = data.get("total_pages") or 0
            print(f"  API reports {data.get('total', 0)} occurrences across {total_pages} pages")

        events = data.get("events", [])
        if not events:
            break
        all_occ.extend(events)
        print(f"  got {len(events)} (total so far: {len(all_occ)})")

        if not data.get("next_rest_url") or (total_pages and page >= total_pages):
            break
        page += 1
        time.sleep(DELAY)

    return all_occ


# ── Text helpers ─────────────────────────────────────────────────────────────
def strip_html(raw: str | None) -> str | None:
    """Collapse an HTML fragment to clean single-spaced text."""
    if not raw:
        return None
    text = html.unescape(raw)
    text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", text)
    text = re.sub(r"(?i)<br\s*/?>|</p>", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = unicodedata.normalize("NFKC", text.replace("\xa0", " "))
    return re.sub(r"\s+", " ", text).strip() or None


def truncate(text: str | None, n: int = 200) -> str | None:
    if not text:
        return None
    return (text[:n].rsplit(" ", 1)[0] + "…") if len(text) > n else text


def clean_city(city: str | None) -> str | None:
    """Drop a trailing state from a venue city ("Cedar Hill, TX" -> "Cedar Hill")."""
    if not city:
        return None
    return re.split(r"\s*,\s*", city.strip())[0] or None


# ── Org name (derived from the external website) ─────────────────────────────
def registrable_domain(url: str | None) -> str | None:
    """Best-effort registrable domain from a URL: strip scheme/www/path/port."""
    if not url:
        return None
    m = re.search(r"https?://([^/]+)", url) or re.match(r"([^/]+)", url)
    host = (m.group(1) if m else url).lower().strip().lstrip(".")
    host = host.split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    parts = host.split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else host or None


def _org_from_title(title: str | None) -> str | None:
    """Best org guess from an event title: the segment before the first dash or
    colon (e.g. "Cedar Ridge Preserve – Conservation Work Day" -> "Cedar Ridge
    Preserve"), else the whole title."""
    if not title:
        return None
    head = re.split(r"\s*[–—:|]\s*|\s+-\s+", title, maxsplit=1)[0].strip()
    return head or title.strip() or None


def derive_org_name(url: str | None, title: str | None) -> str | None:
    """Org display name. Prefer the website's registrable domain (override map,
    else de-slugged + Title-cased). But when the website is a third-party signup
    platform (or absent), the domain is meaningless — use the event title."""
    dom = registrable_domain(url)
    if dom and dom not in PLATFORM_DOMAINS:
        if dom in ORG_NAME_OVERRIDES:
            return ORG_NAME_OVERRIDES[dom]
        core = re.sub(r"[-_]+", " ", dom.rsplit(".", 1)[0]).strip()  # drop TLD
        name = " ".join(w.capitalize() for w in core.split())
        if name:
            return name
    return _org_from_title(title)


# ── Schedule labels ──────────────────────────────────────────────────────────
def _parse_dt(s: str | None) -> datetime | None:
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")  # naive America/Chicago
    except (ValueError, TypeError):
        return None


def _fmt_time(dt: datetime) -> str:
    return dt.strftime("%I:%M %p").lstrip("0")


def fmt_time_range(start_dt, end_dt, all_day) -> str | None:
    if all_day:
        return "All day"
    if start_dt and end_dt:
        return f"{_fmt_time(start_dt)} - {_fmt_time(end_dt)}"
    return _fmt_time(start_dt) if start_dt else None


def weekday_recurrence_label(start_dts: list[datetime]) -> str | None:
    """"Weekly on Tue & Thu" from the distinct weekdays of the occurrences."""
    days = sorted({d.weekday() for d in start_dts})
    if not days:
        return None
    names = [_WEEKDAYS[i] for i in days]
    if len(names) == 1:
        joined = names[0]
    elif len(names) == 2:
        joined = " & ".join(names)
    else:
        joined = ", ".join(names[:-1]) + " & " + names[-1]
    return f"Weekly on {joined}"


# ── Collapse a slug's occurrences into one record ────────────────────────────
def collapse_group(slug: str, occurrences: list[dict]) -> dict:
    occ = sorted(occurrences, key=lambda e: e.get("start_date") or "")
    first = occ[0]
    starts = [d for d in (_parse_dt(e.get("start_date")) for e in occ) if d]
    earliest = starts[0] if starts else None
    recurring = len(occ) > 1

    all_day = bool(first.get("all_day"))
    date_str = earliest.strftime("%b %d, %Y") if earliest else None  # expiry-parseable
    time_str = fmt_time_range(earliest, _parse_dt(first.get("end_date")), all_day)
    recurrence = weekday_recurrence_label(starts) if recurring else None
    raw = " | ".join(x for x in (date_str, recurrence, (None if all_day else time_str)) if x)

    # cause_tags: seed from the custom "cause" field + event category names.
    cause = (((first.get("custom_fields") or {}).get("_ecp_custom_2") or {}).get("value"))
    cats = [c.get("name") for c in (first.get("categories") or []) if c.get("name")]
    seen, cause_tags = set(), []
    for t in ([cause] + cats):
        if t and t not in seen:
            seen.add(t)
            cause_tags.append(t)

    venue = first.get("venue") or {}
    website = first.get("website") or None
    title = strip_html(first.get("title") or "") or "Untitled"
    desc_long = strip_html(first.get("description") or first.get("excerpt") or "")

    return {
        "id":                f"{SOURCE}_{slug}",
        "source":            SOURCE,
        "source_url":        first.get("url"),          # DDG event page (dated is fine)
        "org_name":          derive_org_name(website, title),
        "org_url":           website,
        "opportunity_title": title,
        "description_short": truncate(desc_long, 200),
        "description_long":  desc_long,
        "cause_tags":        cause_tags,
        "is_virtual":        bool(first.get("is_virtual")),
        "schedule": {
            "date":      date_str,
            "time":      None if all_day else time_str,
            "duration":  None,
            "recurring": recurring,                     # always a real bool
            "raw":       raw or None,
        },
        "address": {
            "full":  venue.get("venue") or venue.get("address") or None,
            "city":  clean_city(venue.get("city")),
            "state": "TX",
            "zip":   venue.get("zip") or None,
        },
        "status":       "active",
        "last_scraped": datetime.now(timezone.utc).isoformat(),
    }


def main():
    print("=== Dallas Doing Good Scraper (via The Events Calendar API) ===\n")

    existing: dict[str, dict] = {}
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            for rec in json.load(f):
                if rec.get("id"):
                    existing[rec["id"]] = rec
        print(f"Loaded {len(existing)} existing records\n")

    print("--- Fetching from The Events Calendar API ---")
    occurrences = collect_all_occurrences()
    print(f"\nTotal occurrences fetched: {len(occurrences)}")

    groups: dict[str, list[dict]] = defaultdict(list)
    for e in occurrences:
        slug = e.get("slug")
        if slug:
            groups[slug].append(e)
    print(f"Collapsed to {len(groups)} unique opportunities\n")

    active_ids = set()
    for slug, occ in groups.items():
        detail = collapse_group(slug, occ)
        active_ids.add(detail["id"])
        # Carry pipeline stamps (LLM tags, QC verdicts, expiry extraction) across
        # re-scrapes — they're expensive to recompute and stay valid.
        old = existing.get(detail["id"])
        if old:
            for k in ("unified_tags", "qc", "expiry"):
                if k in old and k not in detail:
                    detail[k] = old[k]
        existing[detail["id"]] = detail

    removed = 0
    for rid in list(existing.keys()):
        if rid.startswith(f"{SOURCE}_") and rid not in active_ids:
            existing[rid]["status"] = "inactive"
            removed += 1
    if removed:
        print(f"Marked {removed} records as inactive (no longer listed)")

    records = sorted(existing.values(), key=lambda r: r.get("opportunity_title") or "")
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    active = sum(1 for r in records if r.get("status") == "active" and r.get("source") == SOURCE)
    recurring = sum(1 for r in records if r.get("status") == "active"
                    and r.get("schedule", {}).get("recurring"))
    print(f"\nSaved {len(records)} total ({active} active, {recurring} recurring) to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
