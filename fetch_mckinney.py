"""
Scrapes volunteer opportunities from volunteermckinney.galaxydigital.com.
McKinney runs on the same Galaxy Digital platform as Volunteer Garland, so the
logic mirrors fetch_garland.py. Outputs to volops_mckinney.json.

Usage:
    pip install requests beautifulsoup4 lxml
    python fetch_mckinney.py
"""

import json
import time
import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from pathlib import Path

BASE_URL = "https://volunteermckinney.galaxydigital.com"
LIST_URL = f"{BASE_URL}/need/"
OUTPUT_FILE = Path("frontend/public/data/volops_mckinney.json")
DELAY = 0.5
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; VolunteerHubBot/1.0; +mailto:grrompala@gmail.com)"
}


# --- Listing page scraper ---

def get_listing_page(offset: int) -> BeautifulSoup | None:
    """Fetch a listing page. offset=0 is page 1, offset=12 is page 2, etc."""
    url = LIST_URL if offset == 0 else f"{LIST_URL}index/{offset}"
    response = requests.get(url, headers=HEADERS, timeout=15)
    if response.status_code != 200:
        print(f"  Listing page offset={offset}: HTTP {response.status_code}")
        return None
    return BeautifulSoup(response.text, "lxml")


def extract_need_ids(soup: BeautifulSoup) -> list[tuple[int, str]]:
    """
    Pull (need_id, title) pairs from a listing page.
    Galaxy Digital detail links: /need/detail/?need_id=1234567
    """
    results = []
    for a in soup.find_all("a", href=re.compile(r"/need/detail/\?need_id=\d+")):
        match = re.search(r"need_id=(\d+)", a["href"])
        if match:
            need_id = int(match.group(1))
            title = a.get_text(strip=True)
            if need_id and title:
                results.append((need_id, title))
    seen, unique = set(), []
    for need_id, title in results:
        if need_id not in seen:
            seen.add(need_id)
            unique.append((need_id, title))
    return unique


def collect_all_need_ids() -> list[tuple[int, str]]:
    """Page through all listing pages and collect every need_id."""
    all_ids = []
    offset = 0
    page = 1

    while True:
        print(f"Listing page {page} (offset {offset})...")
        soup = get_listing_page(offset)
        if soup is None:
            break

        ids = extract_need_ids(soup)
        if not ids:
            print(f"  No opportunities found — stopping.")
            break

        all_ids.extend(ids)
        print(f"  Found {len(ids)} opportunities (total: {len(all_ids)})")

        # Discover the next page via "next" link or by inspecting pagination
        next_link = soup.find("a", string=re.compile(r"next|»|›", re.I))
        if not next_link:
            pagination = soup.find(class_=re.compile(r"paginat", re.I))
            if not pagination:
                break
            current_page_links = pagination.find_all("a", href=re.compile(r"/need/index/\d+"))
            next_offsets = [
                int(re.search(r"/need/index/(\d+)", a["href"]).group(1))
                for a in current_page_links
                if int(re.search(r"/need/index/(\d+)", a["href"]).group(1)) > offset
            ]
            if not next_offsets:
                break
            offset = min(next_offsets)
        else:
            offset += 12

        page += 1
        time.sleep(DELAY)

    seen, unique = set(), []
    for need_id, title in all_ids:
        if need_id not in seen:
            seen.add(need_id)
            unique.append((need_id, title))
    return unique


# --- Detail page scraper ---

def get_text(soup: BeautifulSoup, *selectors) -> str:
    for sel in selectors:
        el = soup.select_one(sel)
        if el:
            return el.get_text(" ", strip=True)
    return ""


def extract_emails(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text)


def extract_phones(text: str) -> list[str]:
    return re.findall(r"\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}", text)


# --- Text cleanup ---------------------------------------------------------
#
# Galaxy Digital detail pages wrap the real content in a lot of UI chrome:
# button labels ("Respond as Team", "Share"), icon captions ("Get Connected
# Icon", "Calendar"), and section headers. When get_text() runs over a broad
# container, that chrome leaks into our fields. These helpers keep ONLY the
# valuable parts — the opportunity description and a real street address — by
# anchoring on stable text markers instead of fragile CSS classes.

import unicodedata

# The body of every opportunity is rendered under an "Opportunity Description"
# heading. Everything before that heading is page chrome (title, schedule
# widget, Respond/Share buttons), so we split on it and keep the tail.
_DESC_MARKER = re.compile(r"Opportunity Description", re.I)

# Chrome that can trail the description body: a "Details"/requirements block or
# a schedule widget. "Get Connected Icon" is an icon caption that never appears
# in real copy, so it's a safe cut point; same for the Respond buttons.
_DESC_TRAILING = re.compile(
    r"\s*(?:Details\s+|Calendar\s+)?Get Connected Icon.*$"
    r"|\s*Respond(?: as Team| Share)\b.*$",
    re.I | re.S,
)

# Leading label/icon words that prefix a location block, e.g.
# "Location Location Dot Shift 2000 N McDonald St ...".
_LOC_CHROME_LEAD = re.compile(r"^(?:\s*(?:Location|Dot|Shift)\b)+", re.I)

# If a "location" block actually contains schedule/widget chrome, it isn't an
# address at all (virtual opportunities have no location section, so a broad
# selector can grab the calendar block by mistake).
_CALENDAR_CHROME = re.compile(r"Get Connected Icon|Calendar|\bongoing\b|Respond", re.I)

# A real address has at least one of: a 5-digit ZIP, the state, or a street
# suffix. Used to reject non-address junk.
_ADDRESS_SIGNAL = re.compile(
    r"\b\d{5}\b|\bTX\b|\b(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|Pkwy|"
    r"Parkway|Ln|Lane|Way|Suite|Ste|Hwy|Highway|Ct|Court|Cir|Circle)\b",
    re.I,
)


def normalize_ws(text: str | None) -> str | None:
    """Collapse NBSP/whitespace runs and normalize unicode."""
    if not text:
        return None
    text = unicodedata.normalize("NFKC", text.replace("\xa0", " "))
    return re.sub(r"\s+", " ", text).strip()


def clean_description(raw: str | None) -> str | None:
    """Keep only the opportunity description body.

    If the "Opportunity Description" marker is present (broad container was
    scraped), drop everything before it. If it isn't (a tight selector already
    isolated the body), keep the text as-is. Either way, normalize whitespace.
    """
    if not raw:
        return None
    match = _DESC_MARKER.search(raw)
    body = normalize_ws(raw[match.end():] if match else raw)
    if body:
        body = _DESC_TRAILING.sub("", body).strip()
    return body or None


def clean_location(raw: str | None) -> str | None:
    """Return a clean street address, or None if the block isn't an address.

    Strips the "Location / Dot / Shift" chrome that prefixes real addresses,
    and rejects schedule/calendar blocks that get grabbed when an opportunity
    has no physical location.
    """
    text = normalize_ws(raw)
    if not text:
        return None
    text = _LOC_CHROME_LEAD.sub("", text).strip()
    if _CALENDAR_CHROME.search(text):
        return None
    if not _ADDRESS_SIGNAL.search(text):
        return None
    return text or None


def parse_detail(soup: BeautifulSoup, need_id: int) -> dict:
    """
    Parse a Galaxy Digital detail page into a structured record.

    Selectors are pinned to the actual classes Galaxy Digital uses:
      - h1.panel-title                                 → title
      - section.description > div.section-content      → long description
      - div.agency > a.card-body > div.title           → org name (NOT "Posted By")
      - ul.interests-list > li.interest                → cause tags (NOT social links)
      - section.location                               → address
      - section.requirements                           → requirements
    """
    record = {
        "id": f"mckinney_{need_id}",
        "source": "volunteermckinney",
        "source_url": f"{BASE_URL}/need/detail/?need_id={need_id}",
        "org_name": None,
        "opportunity_title": None,
        "description_long": None,
        "description_short": None,
        "address": {"state": "TX"},
        "schedule": {},
        "contact": [],
        "requirements": None,
        "cause_tags": [],
        "last_scraped": datetime.now(timezone.utc).isoformat(),
        "status": "active",
    }

    # Title — h1.panel-title inside section.description
    title_el = soup.select_one("section.description h1.panel-title") or soup.find("h1")
    if title_el:
        record["opportunity_title"] = title_el.get_text(strip=True)

    # Org name — div.agency .title is the org name. The "Posted By" anchor
    # lives in the same agency block; we ignore it.
    org_el = soup.select_one("div.agency .title")
    if org_el:
        record["org_name"] = org_el.get_text(strip=True)
    else:
        # Fallback for pages with a slightly different agency layout
        org_link = soup.find("a", href=re.compile(r"/agency/detail/"))
        if org_link:
            inner = org_link.select_one(".title")
            text = inner.get_text(strip=True) if inner else org_link.get_text(strip=True)
            if text:
                record["org_name"] = text

    # Belt-and-braces: strip Galaxy Digital UI suffixes ("Posted By", "Agency",
    # "Brought To You By") that occasionally leak into the org name regardless
    # of which path produced it. Run a few iterations to catch stacked noise.
    if record["org_name"]:
        noise = re.compile(r"\s*(Posted By|Agency|Brought To You By)\s*$", re.I)
        name = record["org_name"]
        for _ in range(3):
            if not noise.search(name):
                break
            name = noise.sub("", name).strip()
        record["org_name"] = name or None

    # Description — section.description > div.section-content. We run
    # clean_description() regardless, so even if the selector grabs a broad
    # container the "Opportunity Description" anchor trims the page chrome.
    desc_el = soup.select_one("section.description div.section-content") \
        or soup.select_one("section.description")
    if desc_el:
        desc = clean_description(desc_el.get_text(" ", strip=True))
        if desc:
            record["description_long"] = desc
            record["description_short"] = (
                desc[:250].rsplit(" ", 1)[0] + "…" if len(desc) > 250 else desc
            )

    # Address — section.location holds the full address block. clean_location()
    # strips the "Location/Dot/Shift" chrome and returns None for blocks that
    # are actually schedule widgets (virtual opportunities have no address).
    addr_section = soup.select_one("section.location")
    if addr_section:
        addr_text = clean_location(addr_section.get_text(" ", strip=True))
        if addr_text:
            record["address"]["full"] = addr_text
            zip_match = re.search(r"\b(\d{5})\b", addr_text)
            if zip_match:
                record["address"]["zip"] = zip_match.group(1)
            # City: the word immediately before the state token. Handles
            # "... McKinney, TX 75069" and "... McKinney Tx, TX 75069".
            city_match = re.search(
                r"\b([A-Za-z]+)\s*,?\s*(?:Tx|TX)\b\s*,?\s*(?:TX\b)?\s*\d{5}",
                addr_text,
            )
            if city_match and city_match.group(1).lower() != "tx":
                record["address"]["city"] = city_match.group(1)

    # Cause tags — ul.interests-list > li.interest. Each li's text contains
    # the interest name (e.g. "Event Support"). Reject anything inside that
    # accidentally pulls in social media or other noise.
    tags = []
    for li in soup.select("ul.interests-list li.interest"):
        text = li.get_text(" ", strip=True)
        if text and len(text) < 60:
            tags.append(text)
    # Dedupe while preserving order
    seen, deduped = set(), []
    for t in tags:
        if t not in seen:
            seen.add(t)
            deduped.append(t)
    record["cause_tags"] = deduped

    # Requirements — section.requirements
    req_section = soup.select_one("section.requirements div.section-content")
    if req_section:
        record["requirements"] = req_section.get_text(" ", strip=True) or None

    # Schedule — look inside section.requirements or the dates section
    schedule_text = None
    for sel in ("section.dates div.section-content", "section.schedule div.section-content"):
        el = soup.select_one(sel)
        if el:
            schedule_text = el.get_text(" ", strip=True)
            break
    if schedule_text:
        record["schedule"]["raw"] = schedule_text

    # Contacts — pull emails/phones from any explicit contact block
    contact_blocks = soup.select("section.contact, div.contact, .agency-contact")
    contacts, seen_emails = [], set()
    for block in contact_blocks:
        block_text = block.get_text(" ", strip=True)
        emails = extract_emails(block_text)
        phones = extract_phones(block_text)
        for email in emails:
            if email not in seen_emails:
                seen_emails.add(email)
                contacts.append({
                    "email": email,
                    "phone": phones[0] if phones else None,
                })
    record["contact"] = contacts

    return record


def fetch_detail(need_id: int) -> dict | None:
    url = f"{BASE_URL}/need/detail/?need_id={need_id}"
    response = requests.get(url, headers=HEADERS, timeout=15)
    if response.status_code != 200:
        return None
    soup = BeautifulSoup(response.text, "lxml")
    return parse_detail(soup, need_id)


# --- Main ---

def main():
    print("=== Volunteer McKinney Scraper ===\n")

    # Load existing output to avoid re-fetching unchanged records
    existing: dict[str, dict] = {}
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            for rec in json.load(f):
                existing[rec["id"]] = rec
        print(f"Loaded {len(existing)} existing records from {OUTPUT_FILE}\n")

    print("--- Step 1: Collecting opportunity IDs ---")
    need_ids = collect_all_need_ids()
    print(f"\nTotal unique opportunities found: {len(need_ids)}\n")

    print("--- Step 2: Fetching details ---")
    active_ids = set()
    for i, (need_id, list_title) in enumerate(need_ids, 1):
        record_id = f"mckinney_{need_id}"
        active_ids.add(record_id)

        detail = fetch_detail(need_id)
        time.sleep(DELAY)

        if detail is None:
            print(f"  [{i}/{len(need_ids)}] SKIP (404): {list_title}")
            continue

        if not detail.get("opportunity_title"):
            detail["opportunity_title"] = list_title

        existing[record_id] = detail
        print(f"  [{i}/{len(need_ids)}] OK: {detail.get('opportunity_title', list_title)}")

    # Mark anything no longer listed as inactive
    removed = 0
    for record_id in list(existing.keys()):
        if record_id.startswith("mckinney_") and record_id not in active_ids:
            existing[record_id]["status"] = "inactive"
            removed += 1
    if removed:
        print(f"\nMarked {removed} records as inactive (no longer listed)")

    records = sorted(existing.values(), key=lambda r: r.get("opportunity_title") or "")
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    active_count = sum(
        1 for r in records
        if r.get("status") == "active" and r.get("source") == "volunteermckinney"
    )
    print(f"\nSaved {len(records)} total records ({active_count} active McKinney) to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
