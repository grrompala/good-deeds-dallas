"""
Discovery scraper for North Texas Giving Day (Communities Foundation of Texas).

NTGD's directory is a *vetted* pool of DFW nonprofits. Filtered to orgs with an
active volunteer opportunity, it's an excellent seed for our curated tier. This
script does DISCOVERY only — it produces candidate org records (name + website +
cause + address + contact). You review them, merge the good ones into orgs.json,
then run fetch_curated.py to extract actual opportunities from each org's site.

Pipeline position:
    fetch_ntgd.py  →  orgs_ntgd_candidates.json  →  (review/merge)  →  orgs.json
                                                  →  fetch_curated.py

The site is server-rendered, so plain requests + BeautifulSoup works:
  - Search:  /search?orgScope=on&activeVolunteerOppOnly=on&page=N   (~20 orgs/page)
  - Profile: /organization/<slug>   (structured "Organization Data" block)

Usage:
    pip install requests beautifulsoup4 lxml
    python fetch_ntgd.py                 # all pages
    python fetch_ntgd.py --pages 2       # first 2 search pages (quick test)
    python fetch_ntgd.py --limit 5       # only fetch 5 profiles (quick test)
"""

import argparse
import json
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://www.northtexasgivingday.org"
SEARCH = f"{BASE}/search?orgScope=on&activeVolunteerOppOnly=on&page={{page}}"
OUTPUT_FILE = Path("orgs_ntgd_review.json")   # fresh candidates to review
EXISTING_ORGS = Path("orgs.json")             # already curated
REJECTED_ORGS = Path("orgs_rejected.json")    # previously declined
DELAY = 0.6
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; VolunteerHubBot/1.0; +mailto:grrompala@gmail.com)"
}

# NTGD cause-area labels → our unified taxonomy (classify_listings.py).
CAUSE_MAP = {
    "animal": "animals",
    "environment": "environment",
    "conservation": "environment",
    "health": "health",
    "mental health": "mental_health",
    "education": "education",
    "youth": "children",
    "children": "children",
    "senior": "seniors",
    "hunger": "food_security",
    "food": "food_security",
    "housing": "housing",
    "shelter": "housing",
    "homeless": "housing",
    "arts": "arts",
    "culture": "arts",
    "human services": "community",
    "community": "community",
    "civic": "civic",
    "public": "civic",
    "disabilit": "disabilities",
    "veteran": "veterans",
    "military": "veterans",
    "immigrant": "immigration",
    "refugee": "immigration",
    "crisis": "crisis_support",
    "legal": "legal",
    "foster": "foster_care",
}

# Domains that are never an org's own website.
SKIP_DOMAINS = (
    "northtexasgivingday.org", "mightycause.com", "guidestar.org",
    "facebook.com", "instagram.com", "twitter.com", "x.com",
    "linkedin.com", "youtube.com",
)


def get_soup(url):
    r = requests.get(url, headers=HEADERS, timeout=20)
    if r.status_code != 200:
        print(f"  HTTP {r.status_code} for {url}")
        return None
    return BeautifulSoup(r.text, "lxml")


# ── Step 1: collect (slug, name) from the paginated search ───────────────────
def collect_orgs(max_pages=None):
    found = {}  # slug -> name
    page = 1
    while True:
        if max_pages and page > max_pages:
            break
        soup = get_soup(SEARCH.format(page=page))
        if soup is None:
            break
        links = soup.select('a[href*="/organization/"]')
        new = 0
        for a in links:
            m = re.search(r"/organization/([^/?#]+)", a["href"])
            if not m:
                continue
            slug = m.group(1)
            name = a.get_text(" ", strip=True)
            name = re.sub(r"^(Thumbnail Image\s*)?Organization\s*", "", name, flags=re.I).strip()
            if slug and slug not in found:
                found[slug] = name or slug
                new += 1
        print(f"Search page {page}: +{new} (total {len(found)})")
        if new == 0:
            break
        page += 1
        time.sleep(DELAY)
    return found


# ── Step 2: parse a profile page's "Organization Data" block ─────────────────
def map_causes(raw):
    if not raw:
        return []
    low = raw.lower()
    tags = []
    for needle, tag in CAUSE_MAP.items():
        if needle in low and tag not in tags:
            tags.append(tag)
    return tags or ["community"]


def field_after(lines, *labels):
    """Return the line following the first line that starts with any label."""
    for i, ln in enumerate(lines):
        for lab in labels:
            if ln.lower().startswith(lab.lower()):
                # the value is the next non-empty line
                for nxt in lines[i + 1:]:
                    if nxt.strip():
                        return nxt.strip()
    return None


def parse_profile(slug, fallback_name):
    soup = get_soup(f"{BASE}/organization/{slug}")
    if soup is None:
        return None

    lines = [l.strip() for l in soup.get_text("\n", strip=True).split("\n") if l.strip()]
    text = " ".join(lines)

    # Website: first external link that isn't a platform/social domain.
    website = None
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith("http") and not any(d in href for d in SKIP_DOMAINS):
            website = href
            break

    # Email via mailto.
    email = None
    mail = soup.find("a", href=re.compile(r"^mailto:", re.I))
    if mail:
        email = mail["href"].split(":", 1)[1].split("?")[0]

    ein = None
    m = re.search(r"\b(\d{2}-\d{7})\b", text)
    if m:
        ein = m.group(1)

    causes_raw = field_after(lines, "Causes")
    county = field_after(lines, "Counties Served", "County")
    phone = field_after(lines, "Phone")

    # Address: the line after "Address" is the street; the following one is
    # usually "City, ST ZIP".
    city = state = postal = addr_full = None
    for i, ln in enumerate(lines):
        if ln.lower() == "address":
            chunk = [x for x in lines[i + 1:i + 4] if x]
            addr_full = ", ".join(chunk[:2]) if chunk else None
            cm = re.search(r"([A-Za-z .'-]+),\s*([A-Z]{2})\s*(\d{5})", " ".join(chunk))
            if cm:
                city, state, postal = cm.group(1).strip(), cm.group(2), cm.group(3)
            break

    # A short notes blurb: prefer the meta description / mission text.
    notes = None
    md = soup.find("meta", attrs={"name": "description"}) or soup.find(
        "meta", attrs={"property": "og:description"}
    )
    if md and md.get("content"):
        notes = md["content"].strip()[:300]

    return {
        "id": re.sub(r"[^a-z0-9]+", "_", (fallback_name or slug).lower()).strip("_"),
        "ntgd_slug": slug,
        "name": fallback_name or slug,
        "city": city,
        "state": state or "TX",
        "postal": postal,
        "ein": ein,
        "county": county,
        "cause": map_causes(causes_raw),
        "cause_raw": causes_raw,
        "volunteer_url": website,      # org homepage — fetch_curated resolves the volunteer page
        "fallback_urls": [],
        "phone": phone,
        "email": email,
        "notes": notes,
        "ntgd_url": f"{BASE}/organization/{slug}",
        "active": bool(website),       # no website → nothing for fetch_curated to read
    }


def load_existing_names():
    """Names we already know — curated (orgs.json) or declined (orgs_rejected.json)
    — so discovery flags them instead of re-surfacing them for review."""
    names = set()
    for path in (EXISTING_ORGS, REJECTED_ORGS):
        if not path.exists():
            continue
        try:
            data = json.load(open(path, encoding="utf-8"))
            items = data if isinstance(data, list) else list(data.values())
            names |= {(o.get("name") or "").strip().lower() for o in items}
        except Exception:
            pass
    return names


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=None, help="limit search pages (testing)")
    ap.add_argument("--limit", type=int, default=None, help="limit profiles fetched (testing)")
    args = ap.parse_args()

    print("=== North Texas Giving Day discovery ===\n")
    orgs = collect_orgs(max_pages=args.pages)
    print(f"\nCollected {len(orgs)} org slugs. Fetching profiles...\n")

    existing = load_existing_names()
    records = []
    for i, (slug, name) in enumerate(orgs.items(), 1):
        if args.limit and i > args.limit:
            break
        rec = parse_profile(slug, name)
        time.sleep(DELAY)
        if not rec:
            print(f"  [{i}/{len(orgs)}] SKIP {name}")
            continue
        rec["already_known"] = rec["name"].strip().lower() in existing
        records.append(rec)
        flags = []
        if rec["already_known"]:
            flags.append("KNOWN")
        if not rec["volunteer_url"]:
            flags.append("NO-SITE")
        print(f"  [{i}/{len(orgs)}] {name} {' '.join(flags)}")

    json.dump(records, open(OUTPUT_FILE, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

    with_site = sum(1 for r in records if r["volunteer_url"])
    known = sum(1 for r in records if r["already_known"])
    print(f"\nWrote {len(records)} candidates to {OUTPUT_FILE}")
    print(f"  {with_site} have a website · {known} already known (curated or declined) · "
          f"{len(records) - with_site} need a manual URL")
    print("\nNext: review the file, merge the good ones into orgs.json (keeping the "
          "orgs.json schema); the rest can go to orgs_rejected.json.")


if __name__ == "__main__":
    main()
