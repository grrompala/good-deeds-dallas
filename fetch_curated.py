"""
Scrapes curated org volunteer pages and uses an LLM to extract structured
opportunity data. No custom parser per org — the LLM handles all variation.

Supports Anthropic (Claude Haiku) and OpenAI (GPT-4o-mini) — pass --provider
or set LLM_PROVIDER env var. Defaults to whichever API key is present.

Usage:
    pip install requests beautifulsoup4 lxml anthropic openai
    set ANTHROPIC_API_KEY=your_key   # for Anthropic
    set OPENAI_API_KEY=your_key      # for OpenAI

    python fetch_curated.py                        # auto-detect provider
    python fetch_curated.py --provider openai      # force OpenAI
    python fetch_curated.py --provider anthropic   # force Anthropic
    python fetch_curated.py --org senior_source_dallas  # test one org
"""

import os
import json
import time
import argparse
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()  # loads .env from current directory

ORGS_FILE = Path("orgs.json")
OUTPUT_FILE = Path("frontend/public/data/volops_curated.json")
DELAY = 1.5
MAX_PAGE_CHARS = 12_000  # keep LLM input manageable

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; VolunteerHubBot/1.0; +mailto:grrompala@gmail.com)"
}

EXTRACTION_PROMPT = """\
You are extracting volunteer opportunity data from an organization's webpage.

Below is the plain text content of the page. Your job is to identify all volunteer
opportunities described and return them as a JSON array.

If the page has NO specific opportunities (e.g. just a generic "contact us to volunteer"
message with no details), return an empty array [].

For each opportunity found, return an object with these fields (use null if unknown):
- opportunity_title: string
- description_short: one sentence summary (you write this, max 120 chars)
- description_long: full description extracted from page text
- schedule: object with keys: raw (string), recurring (bool or null), times_of_day (string or null)
- commitment: expected time commitment (e.g. "2 hours/week", "one-time", etc.)
- location: object with keys: address (string or null), city, state, virtual (bool)
- requirements: string describing any age, background check, training requirements
- cause_tags: array of relevant tags from: ["seniors", "children", "food_security",
  "education", "animals", "environment", "housing", "health", "legal", "arts",
  "community", "crisis_support", "foster_care"]
- apply_url: URL to apply or sign up (null if not found)
- apply_instructions: how to sign up or get started

Return ONLY a valid JSON array, no explanation or markdown.

Page content:
{page_text}
"""


def fetch_page_text(url: str) -> str | None:
    """Fetch a URL and return cleaned plain text, stripping nav/footer boilerplate."""
    try:
        response = requests.get(url, headers=HEADERS, timeout=20)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"    Fetch error: {e}")
        return None

    soup = BeautifulSoup(response.text, "lxml")

    # Remove noise elements
    for tag in soup(["script", "style", "nav", "footer", "header",
                     "aside", "form", "noscript", "svg", "img"]):
        tag.decompose()

    text = soup.get_text(separator="\n", strip=True)

    # Collapse excessive blank lines
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    text = "\n".join(lines)

    return text[:MAX_PAGE_CHARS]


def make_llm_client(provider: str):
    """Return a (client, provider) tuple for the chosen LLM provider."""
    if provider == "anthropic":
        import anthropic as _anthropic
        key = os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise ValueError("ANTHROPIC_API_KEY not set.")
        return _anthropic.Anthropic(api_key=key), "anthropic"
    elif provider == "openai":
        import openai as _openai
        key = os.environ.get("OPENAI_API_KEY") or os.environ.get("OPEN_AI_KEY")
        if not key:
            raise ValueError("Neither OPENAI_API_KEY nor OPEN_AI_KEY found in environment or .env.")
        return _openai.OpenAI(api_key=key), "openai"
    else:
        raise ValueError(f"Unknown provider: {provider}")


def detect_provider() -> str:
    """Auto-detect which provider to use based on available API keys."""
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.environ.get("OPENAI_API_KEY") or os.environ.get("OPEN_AI_KEY"):
        return "openai"
    raise ValueError("No API key found. Set OPENAI_API_KEY (or OPEN_AI_KEY) in your .env file.")


def call_llm(prompt: str, client, provider: str) -> str:
    """Call the appropriate LLM and return the response text."""
    if provider == "anthropic":
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text.strip()
    elif provider == "openai":
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.choices[0].message.content.strip()


def extract_opportunities(page_text: str, org: dict, client, provider: str) -> list[dict]:
    """Send page text to the LLM and parse structured opportunities."""
    prompt = EXTRACTION_PROMPT.format(page_text=page_text)

    raw = call_llm(prompt, client, provider)

    # Strip markdown code fences if model added them
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        opportunities = json.loads(raw)
        if not isinstance(opportunities, list):
            return []
    except json.JSONDecodeError as e:
        print(f"    LLM JSON parse error: {e}")
        print(f"    Raw response: {raw[:300]}")
        return []

    # Stamp each opportunity with source metadata
    now = datetime.now(timezone.utc).isoformat()
    stamped = []
    for i, opp in enumerate(opportunities):
        stamped.append({
            "id": f"{org['id']}_{i}",
            "source": "curated",
            "org_id": org["id"],
            "org_name": org["name"],
            "source_url": org["volunteer_url"],
            "status": "active",
            "last_scraped": now,
            **opp,
        })

    return stamped


def scrape_org(org: dict, client, provider: str) -> list[dict]:
    """Fetch and extract opportunities for one org, trying fallback URLs if needed."""
    urls_to_try = [org["volunteer_url"]] + org.get("fallback_urls", [])

    for url in urls_to_try:
        print(f"  Fetching {url}...")
        page_text = fetch_page_text(url)

        if not page_text:
            print(f"  Failed, trying next URL...")
            continue

        print(f"  Extracting with LLM/{provider} ({len(page_text)} chars)...")
        opportunities = extract_opportunities(page_text, org, client, provider)
        print(f"  Found {len(opportunities)} opportunity/ies")

        if opportunities:
            return opportunities

        # Got text but no opportunities — might be the wrong page, try fallback
        if url != urls_to_try[-1]:
            print(f"  No opportunities extracted, trying fallback URL...")

    return []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--org", help="Only run for this org ID (for testing)")
    parser.add_argument("--provider", choices=["anthropic", "openai"],
                        default=os.environ.get("LLM_PROVIDER"),
                        help="LLM provider to use (default: auto-detect from API keys)")
    args = parser.parse_args()

    provider = args.provider or detect_provider()
    client, provider = make_llm_client(provider)
    print(f"Using provider: {provider}\n")

    with open(ORGS_FILE, "r", encoding="utf-8") as f:
        orgs = json.load(f)

    if args.org:
        orgs = [o for o in orgs if o["id"] == args.org]
        if not orgs:
            print(f"Org '{args.org}' not found in {ORGS_FILE}")
            return

    # Load existing output
    existing: dict[str, dict] = {}
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            for rec in json.load(f):
                existing[rec["id"]] = rec
        print(f"Loaded {len(existing)} existing records\n")

    active_orgs = [o for o in orgs if o.get("active", True)]
    print(f"Processing {len(active_orgs)} org(s)...\n")

    for org in active_orgs:
        print(f"--- {org['name']} ---")

        # Remove old records for this org before replacing
        old_keys = [k for k in existing if k.startswith(f"{org['id']}_")]
        for k in old_keys:
            del existing[k]

        opportunities = scrape_org(org, client, provider)

        for opp in opportunities:
            existing[opp["id"]] = opp

        time.sleep(DELAY)
        print()

    records = sorted(existing.values(), key=lambda r: (r.get("org_name") or "", r.get("opportunity_title") or ""))
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    curated_count = sum(1 for r in records if r.get("source") == "curated" and r.get("status") == "active")
    print(f"Saved {len(records)} total records ({curated_count} active curated) to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
