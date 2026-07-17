"""
Scrapes volunteer opportunities from dallas.voly.org.

How it works:
  - Page 1 is a normal GET request (static HTML)
  - Pages 2+ use a POST request to the same URL with ?seeMore=1&page=N
    (discovered via Chrome DevTools Network tab)
  - Each listing card contains an opportunity ID
  - We then fetch each detail page for full info

Usage:
    pip install requests beautifulsoup4 lxml
    python fetch_voly.py

Output:
    frontend/public/data/volops_voly.json
"""

import json
import time
import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from pathlib import Path

BASE_URL    = "https://dallas.voly.org"
LIST_URL    = f"{BASE_URL}/opportunities/index.html"
SEARCH_URL  = f"{BASE_URL}/opportunities/search.html"   # offset-paginated POST endpoint
DETAIL_URL  = f"{BASE_URL}/opportunity/view.html"
OUTPUT_FILE = Path("frontend/public/data/volops_voly.json")
DELAY       = 0.5

HEADERS = {
    # The AJAX endpoint appears to gate pagination on User-Agent — a bot-style UA
    # gets a static 25-item courtesy payload regardless of ?page=. A real Chrome UA
    # returns properly paginated results.
    "User-Agent":       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    "Referer":          LIST_URL,
    "Origin":           BASE_URL,
    "X-Requested-With": "XMLHttpRequest",
    "Accept":           "application/json, text/javascript, */*; q=0.01",
    "Accept-Language":  "en-US,en;q=0.9",
}


# ── LISTING PAGE SCRAPER ───────────────────────────────────────────────────────


def extract_ids_from_page(soup: BeautifulSoup) -> list[int]:
    """
    Pull opportunity IDs from listing cards.
    Links look like: /opportunity/view.html?id=116506
    """
    ids = []
    seen = set()
    for a in soup.find_all("a", href=re.compile(r"/opportunity/view\.html\?id=\d+")):
        match = re.search(r"id=(\d+)", a["href"])
        if match:
            oid = int(match.group(1))
            if oid not in seen:
                seen.add(oid)
                ids.append(oid)
    return ids


PAGE_SIZE = 25   # search.html returns 25 records per skip increment

def collect_all_ids() -> list[int]:
    """
    Page through Voly's listings using the offset-based search endpoint:
      POST /opportunities/search.html?skip=N

    Response envelope:
      {"type": "VOLY_JSON_RESPONSE", "code": 200,
       "response": {"searchResults": 25, "totalResults": 169,
                    "resultsReturn": "<html with 25 cards>"}}

    Page size is 25, total is reported in `totalResults`, card HTML lives in
    `resultsReturn`. We iterate skip=0, 25, 50, ... until we've collected the
    full set or a page returns no new IDs.
    """
    all_ids = []
    seen    = set()
    skip    = 0
    total_results = None

    while True:
        print(f"  POST search.html?skip={skip}...")
        envelope = None
        for attempt in range(3):
            try:
                resp = requests.post(
                    SEARCH_URL,
                    params={"skip": str(skip)},
                    headers=HEADERS,
                    timeout=20,
                )
                resp.raise_for_status()
                envelope = resp.json().get("response", {})
                break
            except (requests.RequestException, ValueError) as e:
                print(f"    Error (attempt {attempt + 1}/3): {e}")
                if attempt < 2:
                    time.sleep(3)

        if not envelope:
            print(f"  Giving up on skip={skip}")
            break

        if total_results is None:
            total_results = envelope.get("totalResults")
            if total_results:
                print(f"  Server reports {total_results} total opportunities")

        html = envelope.get("resultsReturn", "")
        if not html:
            print(f"  Empty resultsReturn at skip={skip} — stopping.")
            break

        soup    = BeautifulSoup(html, "lxml")
        ids     = extract_ids_from_page(soup)
        new_ids = [i for i in ids if i not in seen]
        seen.update(new_ids)
        all_ids.extend(new_ids)
        print(f"  {len(ids)} raw IDs, {len(new_ids)} new (total: {len(all_ids)})")

        if not new_ids:
            print(f"  No new IDs at skip={skip} — done.")
            break

        if total_results and len(all_ids) >= total_results:
            print(f"  Collected all {total_results} opportunities — done.")
            break

        skip += PAGE_SIZE
        time.sleep(DELAY)

    return all_ids


# ── DETAIL PAGE SCRAPER ────────────────────────────────────────────────────────

def fetch_detail(opp_id: int) -> dict | None:
    """Fetch and parse a single opportunity detail page."""
    try:
        resp = requests.get(
            DETAIL_URL,
            params={"id": opp_id},
            headers=HEADERS,
            timeout=15
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"    Detail {opp_id} error: {e}")
        return None

    soup = BeautifulSoup(resp.text, "lxml")
    return parse_detail(soup, opp_id)


def get_text(soup, *selectors) -> str | None:
    """Try CSS selectors in order, return first non-empty text found."""
    for sel in selectors:
        el = soup.select_one(sel)
        if el:
            t = el.get_text(" ", strip=True)
            if t:
                return t
    return None


def _text_after_icon(soup: BeautifulSoup, icon_class: str) -> str | None:
    """
    Voly displays many fields as an icon followed by text:
        <i class="icon-calendar"></i> May 24, 2026
    This grabs the text immediately following the named icon.
    """
    icon = soup.find("i", class_=icon_class)
    if not icon:
        return None
    # Get the text from the icon's parent (everything inside, minus the icon itself)
    parent = icon.parent
    if not parent:
        return None
    text = parent.get_text(" ", strip=True)
    return text or None


def _section_after_heading(soup: BeautifulSoup, *heading_keywords: str) -> str | None:
    """
    Find a heading (h1-h5) whose text contains any of the keywords, then return
    the text of everything until the next heading. Used to grab 'More Details',
    'Volunteer Information', etc.
    """
    pattern = re.compile("|".join(heading_keywords), re.I)
    for h in soup.find_all(["h1", "h2", "h3", "h4", "h5"]):
        if pattern.search(h.get_text(" ", strip=True)):
            chunks = []
            for sib in h.find_next_siblings():
                if sib.name in {"h1", "h2", "h3", "h4", "h5"}:
                    break
                chunks.append(sib.get_text(" ", strip=True))
            text = " ".join(c for c in chunks if c).strip()
            return text or None
    return None


def parse_detail(soup: BeautifulSoup, opp_id: int) -> dict:
    """Extract structured fields from a Voly opportunity detail page."""

    # ── Title ─────────────────────────────────────────────────────────────────
    title = (
        get_text(soup, "h1", ".opportunity-title", ".opp-title", ".opp-name")
        or get_text(soup, "h2")
        or "Untitled"
    )

    # ── Organization (linked to /agencies/profile) ────────────────────────────
    org_link = soup.find("a", href=re.compile(r"/agencies/profile"))
    org_name = org_link.get_text(strip=True) if org_link else None
    org_url  = f"{BASE_URL}{org_link['href']}" if org_link and org_link.get("href") else None

    # ── Cause tags (label spans, but excluding the VIRTUAL flag) ──────────────
    cause_tags = []
    for span in soup.find_all("span", class_="label"):
        t = span.get_text(strip=True)
        if t and t.upper() != "VIRTUAL":
            cause_tags.append(t)
    cause_tags = list(dict.fromkeys(cause_tags))   # dedupe, preserve order

    # ── VIRTUAL flag ──────────────────────────────────────────────────────────
    is_virtual = bool(soup.find(string=re.compile(r"^\s*VIRTUAL\s*$", re.I))) or \
                 bool(soup.find(class_=re.compile(r"label-yellow")))

    # ── Schedule fields (icon-driven) ─────────────────────────────────────────
    date_str     = _text_after_icon(soup, "icon-calendar")
    duration_str = _text_after_icon(soup, "icon-time")
    needed_str   = _text_after_icon(soup, "icon-VOLUNTEER_ICON2")
    location_str = _text_after_icon(soup, "icon-map-marker")

    volunteers_needed = None
    if needed_str:
        m = re.search(r"([\d,]+)", needed_str)
        if m:
            volunteers_needed = int(m.group(1).replace(",", ""))

    # Time range (e.g. "9:00 AM - 11:00 AM") if present anywhere in the page
    full_text = soup.get_text(" ", strip=True)
    tm = re.search(r"\d{1,2}:\d{2}\s*(AM|PM)\s*[-–]\s*\d{1,2}:\d{2}\s*(AM|PM)",
                   full_text, re.I)
    time_str = tm.group(0) if tm else None

    # Flexible/recurring opportunities show a "Click Here For Dates" link (the
    # calendar-icon date next to it is just today's date / a placeholder, not
    # a real fixed date). One-time events instead show a direct "Sign Up" link.
    # Confirmed by diffing both link types across live detail pages.
    is_recurring = any(
        "click here for dates" in a.get_text(strip=True).lower()
        for a in soup.find_all("a")
    )

    # ── Address parsing ───────────────────────────────────────────────────────
    # Detail pages typically show the full street address; the listing card only
    # has city + state. Try to find a full street address first, then fall back
    # to whatever's near the map-marker icon.
    address_full = None
    addr_match = re.search(
        r"\d+[\w\s\.]+,\s+[\w\s]+,\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?",
        full_text
    )
    if addr_match:
        address_full = addr_match.group(0).strip()
    elif location_str and not is_virtual:
        address_full = location_str

    city = state = postal = None
    if address_full:
        parts = re.search(
            r",\s*([\w\s\.]+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$",
            address_full
        )
        if parts:
            city, state, postal = parts.group(1).strip(), parts.group(2), parts.group(3)
    if not city and location_str:
        # Listing-style "Dallas, TX" fallback
        m = re.match(r"\s*([\w\s\.]+?),\s*([A-Za-z]{2})\b", location_str)
        if m:
            city, state = m.group(1).strip(), m.group(2).upper()

    # ── Description: short blurb + "More Details" extended copy ───────────────
    short_desc = get_text(soup, ".opp-details2", ".opp-description", ".description")

    more_details = _section_after_heading(soup, "more details", "about", "description",
                                          "volunteer information", "opportunity details")
    description_long = more_details or short_desc

    if short_desc and description_long and short_desc not in description_long:
        description_long = f"{short_desc}\n\n{description_long}"

    description_short = None
    if description_long:
        clipped = description_long[:200]
        description_short = (clipped.rsplit(" ", 1)[0] + "…") if len(description_long) > 200 else description_long

    # ── Free-form sections that sometimes appear under "More Details" ─────────
    contact_section      = _section_after_heading(soup, "contact")
    requirements_section = _section_after_heading(soup, "requirement", "qualification")
    skills_section       = _section_after_heading(soup, "skill")
    training_section     = _section_after_heading(soup, "training")
    bring_section        = _section_after_heading(soup, "what to bring", "bring")
    dress_section        = _section_after_heading(soup, "dress", "attire")

    # Pull email + phone out of the page text if present
    email_match = re.search(r"[\w\.\-]+@[\w\.\-]+\.[A-Za-z]{2,}", full_text)
    phone_match = re.search(r"\(?\d{3}\)?[\s\.\-]?\d{3}[\s\.\-]?\d{4}", full_text)

    return {
        "id":               f"voly_{opp_id}",
        "source":           "voly_dallas",
        "source_url":       f"{DETAIL_URL}?id={opp_id}",
        "org_name":         org_name,
        "org_url":          org_url,
        "opportunity_title": title,
        "description_short": description_short,
        "description_long":  description_long,
        "cause_tags":        cause_tags,
        "is_virtual":        is_virtual,
        "schedule": {
            "date":      date_str,
            "time":      time_str,
            "duration":  duration_str,
            "recurring": is_recurring,
            "raw":       " | ".join(filter(None, [date_str, time_str, duration_str])) or None,
        },
        "volunteers_needed": volunteers_needed,
        "address": {
            "full":   address_full,
            "city":   city,
            "state":  state or "TX",
            "postal": postal,
        },
        "contact": {
            "email": email_match.group(0) if email_match else None,
            "phone": phone_match.group(0) if phone_match else None,
            "info":  contact_section,
        },
        "requirements":      requirements_section,
        "skills":            skills_section,
        "training":          training_section,
        "what_to_bring":     bring_section,
        "dress_code":        dress_section,
        "status":            "active",
        "last_scraped":      datetime.now(timezone.utc).isoformat(),
    }


# ── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    print("=== Voly Dallas Scraper ===\n")

    # Load existing records to avoid re-fetching unchanged ones
    existing: dict[str, dict] = {}
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            for rec in json.load(f):
                existing[rec["id"]] = rec
        print(f"Loaded {len(existing)} existing records\n")

    # Step 1: collect all opportunity IDs from listing pages
    print("--- Step 1: Collecting IDs ---")
    all_ids = collect_all_ids()
    print(f"\nTotal opportunities found: {len(all_ids)}\n")

    # Step 2: fetch detail pages
    print("--- Step 2: Fetching details ---")
    active_ids = set()

    for i, opp_id in enumerate(all_ids, 1):
        rid = f"voly_{opp_id}"
        active_ids.add(rid)

        detail = fetch_detail(opp_id)
        time.sleep(DELAY)

        if detail is None:
            print(f"  [{i}/{len(all_ids)}] SKIP (404): {opp_id}")
            continue


        # Carry pipeline stamps (LLM tags, QC verdicts, expiry extraction)
        # across re-scrapes — they're expensive to recompute and stay valid.
        old = existing.get(rid)
        if old:
            for k in ("unified_tags", "qc", "expiry"):
                if k in old and k not in detail:
                    detail[k] = old[k]
        existing[rid] = detail
        print(f"  [{i}/{len(all_ids)}] OK: {detail.get('opportunity_title', opp_id)}")

    # Mark anything no longer listed as inactive
    for rid in list(existing.keys()):
        if rid.startswith("voly_") and rid not in active_ids:
            existing[rid]["status"] = "inactive"

    # Save
    records = sorted(
        existing.values(),
        key=lambda r: r.get("opportunity_title") or ""
    )
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    active = sum(1 for r in records if r.get("status") == "active" and r.get("source") == "voly_dallas")
    print(f"\nSaved {len(records)} total ({active} active) to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
