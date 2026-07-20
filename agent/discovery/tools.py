"""Tools the graph nodes call (tech plan §6): search, fetch, coverage lookup,
ledger I/O, and PR creation. Network/LLM-free helpers stay pure so they're
cheap to unit-test and safe to run offline.

Fetching reuses the existing scraper stack (fetch_curated.py) rather than
re-implementing it, so the agent honors the same User-Agent, timeouts, and
volunteer-link heuristics as the pipeline.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from datetime import date
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from . import config

# Reuse the scrapers' honest User-Agent and pure parsing helpers (run as
# `python -m agent.discovery` from the repo root so these root-level modules
# import cleanly). We do our own HTTP request rather than reuse fetch_soup so we
# can skip brotli (`br`) encoding, which some hosts serve in a form urllib3
# fails to decode.
from fetch_curated import HEADERS, soup_to_text, find_volunteer_links  # noqa: E402
from classify_listings import TAXONOMY  # noqa: E402  (the canonical 18-tag list)


# ── Name / domain normalization ──────────────────────────────────────────────

_SUFFIXES = re.compile(
    r"\b(inc|incorporated|foundation|fund|organization|org|association|assoc|"
    r"society|charities?|charity|ministries|ministry|inc\.?|llc|d/b/a)\b",
    re.I,
)


def normalize_name(name: str | None) -> str:
    """Lowercase, drop 'the', common legal/nonprofit suffixes, and punctuation
    so 'The Warren Center, Inc.' and 'Warren Center' collapse together."""
    s = (name or "").lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\bthe\b", " ", s)
    s = _SUFFIXES.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip()


def domain_of(url: str | None) -> str:
    """Bare host, lowercased, no leading www. '' if unparseable."""
    if not url:
        return ""
    host = urlparse(url if "://" in url else f"http://{url}").netloc.lower()
    return host[4:] if host.startswith("www.") else host


# ── Coverage set + ledger (memory, tech plan §5) ─────────────────────────────

def _read_json(path: Path, default):
    if not path.exists():
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_coverage() -> tuple[set[str], set[str]]:
    """Everything we already have: normalized org names + known domains, drawn
    from orgs.json, the NTGD candidates, and every volops_*.json output."""
    names: set[str] = set()
    domains: set[str] = set()

    def add(name, url):
        n = normalize_name(name)
        if n:
            names.add(n)
        d = domain_of(url)
        if d:
            domains.add(d)

    for org in _read_json(config.ORGS_PATH, []):
        add(org.get("name"), org.get("volunteer_url"))
    for org in _read_json(config.NTGD_CANDIDATES_PATH, []):
        add(org.get("name"), org.get("volunteer_url"))

    for path in sorted(config.REPO_ROOT.glob(config.VOLOPS_GLOB)):
        for rec in _read_json(path, []):
            add(rec.get("org_name"), rec.get("source_url"))

    return names, domains


def load_ledger() -> dict:
    """domain -> {verdict, date, reason}. Long-term memory of past verdicts."""
    return _read_json(config.LEDGER_PATH, {})


def save_ledger(ledger: dict) -> None:
    config.LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(config.LEDGER_PATH, "w", encoding="utf-8") as f:
        json.dump(ledger, f, indent=2, ensure_ascii=False, sort_keys=True)


def check_coverage(name: str, domain: str, coverage: set[str],
                   coverage_domains: set[str]) -> dict:
    """Pure-local lookup — no network. Known if the domain matches or a
    normalized-name substring match exists (tech plan §12 fuzzy-name note:
    start with substring, upgrade to embeddings only if false dupes appear)."""
    if domain and domain in coverage_domains:
        return {"known": True, "where": "domain"}
    norm = normalize_name(name)
    if norm and any(norm == c or norm in c or c in norm for c in coverage):
        return {"known": True, "where": "name"}
    return {"known": False, "where": None}


def slugify(name: str, city: str) -> str:
    """orgs.json id: '<name>_<city>' slug, e.g. 'hearts_for_homes_denton'."""
    base = f"{normalize_name(name)} {city.lower()}"
    return re.sub(r"\s+", "_", re.sub(r"[^a-z0-9\s]", "", base)).strip("_")


# ── Search (Tavily, tech plan §6) ─────────────────────────────────────────────

def web_search(query: str, k: int = 8) -> list[dict]:
    """Tavily search -> [{name, domain, url, snippet}]. Import-lazy so runs that
    seed hand-picked domains (no search) don't need the SDK or a key."""
    from tavily import TavilyClient

    key = os.environ.get("TAVILY_API_KEY")
    if not key:
        raise SystemExit("TAVILY_API_KEY not set (needed unless running with --domains).")
    client = TavilyClient(api_key=key)
    resp = client.search(query=query, max_results=k)

    out = []
    for r in resp.get("results", []):
        url = r.get("url", "")
        out.append({
            "name": r.get("title", ""),
            "domain": domain_of(url),
            "url": url,
            "snippet": (r.get("content") or "")[:400],
        })
    return out


# ── Fetch (reuses fetch_curated, tech plan §6) ───────────────────────────────

def fetch_page(url: str) -> dict | None:
    """(url) -> {title, text, links[]}. Links are the best volunteer-page
    candidates found on the page (via the scraper's own heuristics)."""
    # Skip brotli: some hosts serve `br` in a form urllib3 can't decode.
    headers = {**HEADERS, "Accept-Encoding": "gzip, deflate"}
    try:
        resp = requests.get(url, headers=headers, timeout=20)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"    Fetch error: {e}")
        return None
    soup = BeautifulSoup(resp.text, "lxml")
    title = soup.title.get_text(strip=True) if soup.title else ""
    links = find_volunteer_links(soup, url)  # ranked, on-site, volunteer-ish
    text = soup_to_text(soup)
    return {"title": title, "text": text, "links": links}


# ── PR creation (gh CLI, tech plan §4 draft_pr; disabled in dry-run) ─────────

def open_pr(entries: list[dict], ledger: dict, pr_body: str,
            branch: str) -> str:
    """Append entries to orgs.json, write the ledger, and open a PR via the gh
    CLI using the workflow's GITHUB_TOKEN. Never merges. Returns the PR URL.

    Only called in live mode; dry-run writes a markdown report instead.
    """
    orgs = _read_json(config.ORGS_PATH, [])
    orgs.extend(entries)
    with open(config.ORGS_PATH, "w", encoding="utf-8") as f:
        json.dump(orgs, f, indent=2, ensure_ascii=False)
    save_ledger(ledger)

    def git(*args):
        subprocess.run(["git", *args], cwd=config.REPO_ROOT, check=True)

    git("checkout", "-b", branch)
    git("add", str(config.ORGS_PATH), str(config.LEDGER_PATH))
    git("commit", "-m", f"Discovery agent: {len(entries)} proposed org(s)")
    git("push", "-u", "origin", branch)

    result = subprocess.run(
        ["gh", "pr", "create", "--title",
         f"Discovery: {len(entries)} candidate org(s) for review",
         "--body", pr_body, "--base", "main", "--head", branch],
        cwd=config.REPO_ROOT, check=True, capture_output=True, text=True,
    )
    return result.stdout.strip()


def today_iso() -> str:
    return date.today().isoformat()
