"""
Scrapes volunteer opportunities from volunteergarland.org (Galaxy Digital platform).
Outputs to volops_garland.json in a schema compatible with the project content spec.

Usage:
    pip install requests beautifulsoup4 lxml
    python fetch_garland.py
"""

import json
import time
import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from pathlib import Path

BASE_URL = "https://www.volunteergarland.org"
LIST_URL = f"{BASE_URL}/need/"
OUTPUT_FILE = Path("frontend/public/data/volops_garland.json")
DELAY = 0.5  # seconds between requests
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; VolunteerHubBot/1.0; +mailto:grrompala@gmail.com)"
}


# --- Listing page scraper ---

def get_listing_page(offset: int) -> BeautifulSoup | None:
    """Fetch a listing page. offset=0 is page 1, offset=12 is page 2, etc."""
    url = LIST_URL if offset == 0 else f"{LIST_URL}index/{offset}"
    response = requests.get(url, headers=HEADERS, timeout=15)
    if response.status_code != 200:
        print(f"  Listing page {offset}: HTTP {response.status_code}")
        return None
    return BeautifulSoup(response.text, "lxml")


def extract_need_ids(soup: BeautifulSoup) -> list[tuple[int, str]]:
    """
    Return list of (need_id, title) from a listing page.
    Galaxy Digital detail links look like: /need/detail/?need_id=1234567
    """
    results = []
    for a in soup.find_all("a", href=re.compile(r"/need/detail/\?need_id=\d+")):
        match = re.search(r"need_id=(\d+)", a["href"])
        if match:
            need_id = int(match.group(1))
            title = a.get_text(strip=True)
            if need_id and title:
                results.append((need_id, title))
    # deduplicate (each row has multiple links to the same detail)
    seen = set()
    unique = []
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
        print(f"  Found {len(ids)} opportunities (total so far: {len(all_ids)})")

        # Check if there's a next page
        next_link = soup.find("a", string=re.compile(r"next|»|›", re.I))
        if not next_link:
            # Also check pagination links for a page number higher than current
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

    # Final dedup across pages
    seen = set()
    unique = []
    for need_id, title in all_ids:
        if need_id not in seen:
            seen.add(need_id)
            unique.append((need_id, title))

    return unique


# --- Detail page scraper ---

def get_text(soup: BeautifulSoup, *selectors) -> str:
    """Try multiple CSS selectors, return first non-empty text found."""
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
# button labels ("Respond", "Share"), the schedule widget ("Calendar Until …
# Time …"), and section headers. When get_text() runs over a broad container,
# that chrome leaks into our fields. These helpers keep ONLY the valuable parts
# — the opportunity description and a real street address — by anchoring on
# stable text markers instead of fragile CSS classes. (Mirrors fetch_mckinney.)

import unicodedata

# The body of every opportunity is rendered under an "Opportunity Description"
# heading. Everything before it is page chrome (title, schedule widget,
# Respond/Share buttons), so we split on it and keep the tail.
_DESC_MARKER = re.compile(r"Opportunity Description", re.I)

# Chrome that can trail the description body: a "Details"/requirements block or
# a schedule widget. "Get Connected Icon" is an icon caption that never appears
# in real copy, so it's a safe cut point; same for the Respond buttons.
_DESC_TRAILING = re.compile(
    r"\s*(?:Details\s+|Calendar\s+)?Get Connected Icon.*$"
    r"|\s*Respond(?: as Team| Share)\b.*$",
    re.I | re.S,
)

# Leading label/icon words that prefix a location block.
_LOC_CHROME_LEAD = re.compile(r"^(?:\s*(?:Location|Dot|Shift)\b)+", re.I)

# If a "location" block actually contains schedule/widget chrome, it isn't an
# address at all (most Garland opportunities are anywhere-cleanups with no
# location section, so a broad selector grabs the calendar block by mistake).
_CALENDAR_CHROME = re.compile(
    r"Get Connected Icon|Calendar|\bUntil\b|\bongoing\b|Respond", re.I
)

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
    scraped), drop everything before it, then cut any trailing widget chrome.
    If the marker isn't present (a tight selector already isolated the body),
    keep the text as-is. Either way, normalize whitespace.
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

    Strips any "Location/Dot/Shift" chrome and rejects schedule/calendar blocks
    that get grabbed when an opportunity has no physical location.
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
    Parse a detail page into a structured record.
    Galaxy Digital detail pages vary slightly but follow a consistent layout.
    """
    record = {
        "id": f"garland_{need_id}",
        "source": "volunteergarland",
        "source_url": f"{BASE_URL}/need/detail/?need_id={need_id}",
        "org_name": None,
        "opportunity_title": None,
        "description_long": None,
        "description_short": None,
        "address": {},
        "schedule": {},
        "contact": [],
        "requirements": None,
        "cause_tags": [],
        "last_scraped": datetime.now(timezone.utc).isoformat(),
        "status": "active",
        "city": "Garland",
        "state": "TX",
    }

    # Title — usually in h1 or .need-title
    title_el = (
        soup.find("h1")
        or soup.find(class_=re.compile(r"need.?title|opportunity.?title", re.I))
    )
    if title_el:
        record["opportunity_title"] = title_el.get_text(strip=True)

    # Org name — look for agency/organization label
    org_el = soup.find(class_=re.compile(r"agency|organization|org.?name", re.I))
    if not org_el:
        # Fallback: find a link to an agency page
        org_link = soup.find("a", href=re.compile(r"/agency/detail/"))
        if org_link:
            org_el = org_link
    if org_el:
        record["org_name"] = org_el.get_text(strip=True)

    # Full page text for fallback parsing
    full_text = soup.get_text(" ", strip=True)

    # Description — largest text block, often in .need-description or .description
    desc_el = (
        soup.find(class_=re.compile(r"need.?desc|description|details", re.I))
        or soup.find("div", class_=re.compile(r"content|body", re.I))
    )
    if desc_el:
        desc = clean_description(desc_el.get_text(" ", strip=True))
        if desc:
            record["description_long"] = desc
            record["description_short"] = (
                desc[:250].rsplit(" ", 1)[0] + "…" if len(desc) > 250 else desc
            )

    # Address — look for address block. clean_location() strips chrome and
    # returns None for schedule/calendar blocks (most Garland opportunities have
    # no physical address, so we leave address.full unset rather than store junk).
    addr_el = soup.find(class_=re.compile(r"address|location", re.I))
    if addr_el:
        addr_text = clean_location(addr_el.get_text(" ", strip=True))
        if addr_text:
            record["address"]["full"] = addr_text
            zip_match = re.search(r"\b(\d{5})\b", addr_text)
            if zip_match:
                record["address"]["zip"] = zip_match.group(1)

    # Schedule — dates and times
    date_el = soup.find(class_=re.compile(r"date|schedule|time", re.I))
    if date_el:
        record["schedule"]["raw"] = date_el.get_text(" ", strip=True)

    # Contacts — find all email/phone combos on the page
    contact_blocks = soup.find_all(class_=re.compile(r"contact|coordinator|staff", re.I))
    contacts = []
    seen_emails = set()
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
                    "raw": block_text[:200],
                })

    # Fallback: scan full page for emails if none found in blocks
    if not contacts:
        page_emails = extract_emails(full_text)
        page_phones = extract_phones(full_text)
        for i, email in enumerate(page_emails):
            if "garlandtx.gov" in email or "volunteer" in email.lower():
                contacts.append({
                    "email": email,
                    "phone": page_phones[i] if i < len(page_phones) else None,
                })

    record["contact"] = contacts

    # Categories/tags — look for tag/category elements
    tag_els = soup.find_all(class_=re.compile(r"tag|categor|cause|interest", re.I))
    tags = [el.get_text(strip=True) for el in tag_els if el.get_text(strip=True)]
    record["cause_tags"] = list(set(tags))

    # Requirements — look for requirements section
    req_el = soup.find(class_=re.compile(r"require|qualif|eligib", re.I))
    if req_el:
        record["requirements"] = req_el.get_text(" ", strip=True)

    return record


def fetch_detail(need_id: int) -> dict | None:
    """Fetch and parse a single detail page."""
    url = f"{BASE_URL}/need/detail/?need_id={need_id}"
    response = requests.get(url, headers=HEADERS, timeout=15)
    if response.status_code != 200:
        return None
    soup = BeautifulSoup(response.text, "lxml")
    return parse_detail(soup, need_id)


# --- Main ---

def main():
    print("=== Volunteer Garland Scraper ===\n")

    # Load existing output to avoid re-fetching unchanged records
    existing: dict[str, dict] = {}
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            for rec in json.load(f):
                existing[rec["id"]] = rec
        print(f"Loaded {len(existing)} existing records from {OUTPUT_FILE}\n")

    # Step 1: collect all need_ids from listing pages
    print("--- Step 1: Collecting opportunity IDs ---")
    need_ids = collect_all_need_ids()
    print(f"\nTotal unique opportunities found: {len(need_ids)}\n")

    # Step 2: fetch details for each
    print("--- Step 2: Fetching details ---")
    active_ids = set()
    for i, (need_id, list_title) in enumerate(need_ids, 1):
        record_id = f"garland_{need_id}"
        active_ids.add(record_id)

        detail = fetch_detail(need_id)
        time.sleep(DELAY)

        if detail is None:
            print(f"  [{i}/{len(need_ids)}] SKIP (404): {list_title}")
            continue

        # Use list title as fallback if detail parse missed it
        if not detail.get("opportunity_title"):
            detail["opportunity_title"] = list_title

        existing[record_id] = detail
        print(f"  [{i}/{len(need_ids)}] OK: {detail.get('opportunity_title', list_title)}")

    # Step 3: mark anything no longer on the site as inactive
    removed = 0
    for record_id in list(existing.keys()):
        if record_id.startswith("garland_") and record_id not in active_ids:
            existing[record_id]["status"] = "inactive"
            removed += 1
    if removed:
        print(f"\nMarked {removed} records as inactive (no longer listed)")

    # Step 4: save
    records = sorted(existing.values(), key=lambda r: r.get("opportunity_title") or "")
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    active_count = sum(1 for r in records if r.get("status") == "active" and r.get("source") == "volunteergarland")
    print(f"\nSaved {len(records)} total records ({active_count} active Garland) to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
