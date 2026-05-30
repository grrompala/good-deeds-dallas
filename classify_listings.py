"""
Adds a `unified_tags` field to every listing record using an LLM and a fixed
taxonomy. This gives consistent, filterable categories across Garland, McKinney,
Voly, and curated nonprofits — no more relying on each source's messy native
tags (e.g. McKinney's interest icons, Voly's free-text labels).

Idempotent: skips records that already have `unified_tags`. Run repeatedly as
the underlying JSON files are updated by the scrapers.

Usage:
    pip install openai anthropic python-dotenv
    set OPENAI_API_KEY=...        # or ANTHROPIC_API_KEY
    python classify_listings.py                       # process all files
    python classify_listings.py --file volops_voly    # one file
    python classify_listings.py --reclassify          # re-tag even if already tagged
    python classify_listings.py --provider anthropic  # override auto-detect
"""

import os
import json
import time
import argparse
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ── The fixed taxonomy. Edit this list to change available labels. ───────────
TAXONOMY = [
    "seniors",
    "children",
    "food_security",
    "education",
    "animals",
    "environment",
    "housing",
    "health",
    "legal",
    "arts",
    "community",
    "crisis_support",
    "foster_care",
    "disabilities",
    "mental_health",
    "immigration",
    "civic",
    "veterans",
]

# JSON files to process. Add more here as new scrapers come online.
LISTING_FILES = [
    Path("frontend/public/data/volops_garland.json"),
    Path("frontend/public/data/volops_mckinney.json"),
    Path("frontend/public/data/volops_voly.json"),
    Path("frontend/public/data/volops_idealist.json"),
    Path("frontend/public/data/volops_curated.json"),
]

DELAY = 0.4   # seconds between LLM calls

CLASSIFY_PROMPT = """\
You are tagging a volunteer opportunity with categories from a fixed taxonomy.

Pick the 1-4 most relevant tags from this exact list (use the strings verbatim):
{taxonomy}

If none clearly apply, return an empty array. Do not invent new tags.

Return ONLY a JSON array of strings, no explanation, no markdown.

Title: {title}
Organization: {org}
Description: {description}
"""


# ── LLM plumbing (mirrors fetch_curated.py) ──────────────────────────────────

def detect_provider() -> str:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.environ.get("OPENAI_API_KEY") or os.environ.get("OPEN_AI_KEY"):
        return "openai"
    raise ValueError("No API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env.")


def make_client(provider: str):
    if provider == "anthropic":
        import anthropic
        key = os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise ValueError("ANTHROPIC_API_KEY not set.")
        return anthropic.Anthropic(api_key=key), "anthropic"
    elif provider == "openai":
        import openai
        key = os.environ.get("OPENAI_API_KEY") or os.environ.get("OPEN_AI_KEY")
        if not key:
            raise ValueError("OPENAI_API_KEY not set.")
        return openai.OpenAI(api_key=key), "openai"
    else:
        raise ValueError(f"Unknown provider: {provider}")


def call_llm(prompt: str, client, provider: str) -> str:
    if provider == "anthropic":
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=128,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    elif provider == "openai":
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=128,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.choices[0].message.content.strip()


def classify(record: dict, client, provider: str) -> list[str]:
    """Return a list of tags from TAXONOMY for one record."""
    title       = record.get("opportunity_title") or ""
    org         = record.get("org_name") or ""
    description = record.get("description_short") or record.get("description_long") or ""
    description = description[:1500]   # cap to keep cost predictable

    if not title and not description:
        return []

    prompt = CLASSIFY_PROMPT.format(
        taxonomy=json.dumps(TAXONOMY),
        title=title,
        org=org,
        description=description,
    )
    raw = call_llm(prompt, client, provider)

    # Strip markdown fences if model added them
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        tags = json.loads(raw)
    except json.JSONDecodeError:
        print(f"    Parse error: {raw[:120]}")
        return []
    if not isinstance(tags, list):
        return []
    # Drop anything not in the taxonomy
    return [t for t in tags if isinstance(t, str) and t in TAXONOMY]


# ── Main ─────────────────────────────────────────────────────────────────────

def process_file(path: Path, client, provider: str, reclassify: bool):
    if not path.exists():
        print(f"  Skip — file not found: {path}")
        return

    with open(path, "r", encoding="utf-8") as f:
        records = json.load(f)

    todo = [r for r in records if reclassify or not r.get("unified_tags")]
    print(f"  {len(records)} records · {len(todo)} need tagging")

    for i, rec in enumerate(todo, 1):
        title = rec.get("opportunity_title") or rec.get("id")
        tags = classify(rec, client, provider)
        rec["unified_tags"] = tags
        print(f"    [{i}/{len(todo)}] {title[:60]}: {tags}")
        time.sleep(DELAY)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)
    print(f"  Saved {path}\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", help="Process only one file (basename without .json)")
    parser.add_argument("--reclassify", action="store_true",
                        help="Re-tag records that already have unified_tags")
    parser.add_argument("--provider", choices=["openai", "anthropic"],
                        default=os.environ.get("LLM_PROVIDER"))
    args = parser.parse_args()

    provider = args.provider or detect_provider()
    client, provider = make_client(provider)
    print(f"Using provider: {provider}\n")

    files = LISTING_FILES
    if args.file:
        files = [p for p in files if p.stem == args.file]
        if not files:
            print(f"No file matching '{args.file}'")
            return

    for path in files:
        print(f"--- {path.name} ---")
        process_file(path, client, provider, args.reclassify)


if __name__ == "__main__":
    main()
