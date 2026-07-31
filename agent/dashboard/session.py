"""Driving logic for the discovery dashboard — pure functions, no Streamlit, so
it's unit-testable and the UI stays thin.

The dashboard is the orchestrator: instead of LangGraph's automatic edges, the
human advances one stage at a time. Each stage reuses the exact same node logic
the cron uses (agent/discovery/graph.py) — search, per-candidate investigation,
select — so the two paths can't drift.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from urllib.parse import urlparse

from agent.discovery import config, tools
from agent.discovery.graph import (
    make_search, make_select, investigate_candidate,
)
from agent.discovery.llm import LLM
from agent.discovery import report as report_mod


# ── setup ────────────────────────────────────────────────────────────────────

def build_config(max_candidates: int, confidence_threshold: float,
                 ignore_ledger: bool, dry_run: bool = True) -> config.RunConfig:
    cfg = config.RunConfig(dry_run=dry_run, ignore_ledger=ignore_ledger)
    cfg.max_candidates = max_candidates
    cfg.confidence_threshold = confidence_threshold
    return cfg


def build_llm(cfg: config.RunConfig) -> LLM:
    return LLM.build(cfg.provider, cfg.mini_model, cfg.full_model)


# ── query building ───────────────────────────────────────────────────────────

def build_queries(causes: list[str], cities: list[str],
                  freeform: list[str]) -> list[str]:
    """Compose the search queries: every (cause x city) plus any freeform lines.
    Cities get ', Texas' appended for location grounding; freeform is used as-is."""
    grid = [f"{cause} {city}, Texas" for city in cities for cause in causes]
    extra = [q.strip() for q in freeform if q.strip()]
    # de-dupe, preserve order
    seen, out = set(), []
    for q in grid + extra:
        if q not in seen:
            seen.add(q)
            out.append(q)
    return out


def new_state(cfg: config.RunConfig, queries: list[str]) -> dict:
    """Initial graph state: coverage + ledger loaded, queries set. Replaces the
    cron's plan_queries node (the human built the queries here)."""
    coverage, coverage_domains = tools.load_coverage()
    ledger = {} if cfg.ignore_ledger else tools.load_ledger()
    return {
        "queries": queries,
        "coverage": coverage,
        "coverage_domains": coverage_domains,
        "ledger": ledger,
        "candidates": [],
        "verdicts": [],
        "drafts": [],
    }


# ── stages ───────────────────────────────────────────────────────────────────

def run_search(cfg: config.RunConfig, state: dict) -> dict:
    """Execute the queries via Tavily; return {**state, candidates:[...]}."""
    delta = make_search(cfg)(state)
    return {**state, **delta}


def triage_rows(state: dict) -> list[dict]:
    """Per-candidate triage decision WITH reasons, so the UI can show everything
    and let the user override keep/drop. Reuses the same predicates as the node."""
    ledger = state.get("ledger", {})
    coverage = state.get("coverage", set())
    coverage_domains = state.get("coverage_domains", set())
    rows = []
    for c in state.get("candidates", []):
        dom = c.get("domain", "")
        if not dom:
            reason = "no domain"
        elif tools.is_blocklisted(dom):
            reason = "blocklisted"
        elif dom in ledger:
            reason = "already judged (ledger)"
        else:
            cov = tools.check_coverage(c.get("name", ""), dom, coverage, coverage_domains)
            reason = f"covered ({cov['where']})" if cov["known"] else None
        rows.append({**c, "keep": reason is None, "drop_reason": reason or ""})
    return rows


def investigate(cfg: config.RunConfig, llm: LLM, candidates: list[dict],
                on_progress=None) -> list[dict]:
    """Investigate the given (user-approved) candidates one at a time, reusing the
    cron's per-candidate logic. Persists each verdict to the ledger unless
    ignore_ledger. `on_progress(i, total, candidate)` is called before each."""
    ledger = tools.load_ledger() if not cfg.ignore_ledger else {}
    verdicts = []
    total = len(candidates)
    for i, c in enumerate(candidates, 1):
        if on_progress:
            on_progress(i, total, c)
        v = investigate_candidate(c, cfg, llm)
        verdicts.append(v)
        if not cfg.ignore_ledger:
            ledger[v["domain"]] = {
                "verdict": v["decision"], "date": tools.today_iso(),
                "reason": (v.get("reason") or "")[:200],
            }
            tools.save_ledger(ledger)
    return verdicts


def select_drafts(cfg: config.RunConfig, verdicts: list[dict]) -> list[dict]:
    """Rank/threshold accepted verdicts into schema-shaped orgs.json entries."""
    return make_select(cfg)({"verdicts": verdicts})["drafts"]


# ── draft editing (round-trips through st.data_editor) ───────────────────────

def drafts_to_rows(drafts: list[dict]) -> list[dict]:
    """Editable rows: cause list -> comma string so a grid can edit it."""
    return [{
        "include": True,
        "id": d.get("id", ""),
        "name": d.get("name", ""),
        "city": d.get("city", ""),
        "state": d.get("state", "TX"),
        "cause": ", ".join(d.get("cause") or []),
        "volunteer_url": d.get("volunteer_url", ""),
        "notes": d.get("notes", ""),
    } for d in drafts]


def rows_to_drafts(rows: list[dict]) -> list[dict]:
    """Editable rows -> orgs.json entries (only rows marked include)."""
    out = []
    for r in rows:
        if not r.get("include", True):
            continue
        causes = [c.strip() for c in str(r.get("cause", "")).split(",") if c.strip()]
        out.append({
            "id": r.get("id") or tools.slugify(r.get("name", ""), r.get("city", "")),
            "name": r.get("name", ""),
            "city": r.get("city", ""),
            "state": r.get("state", "TX"),
            "cause": [c for c in causes if c in tools.TAXONOMY],
            "volunteer_url": r.get("volunteer_url", ""),
            "fallback_urls": [],
            "notes": r.get("notes", ""),
            "active": True,
        })
    return out


# ── finish ───────────────────────────────────────────────────────────────────

def _origin_slug() -> str | None:
    """'owner/repo' parsed from the origin remote (SSH or HTTPS form)."""
    try:
        url = subprocess.run(["git", "remote", "get-url", "origin"],
                             cwd=config.REPO_ROOT, check=True,
                             capture_output=True, text=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    if url.startswith("git@github.com:"):
        slug = url.split("git@github.com:", 1)[1]
    elif "github.com/" in url:
        slug = url.split("github.com/", 1)[1]
    else:
        return None
    return slug.removesuffix(".git")


def _compare_url(branch: str, base: str) -> str | None:
    """GitHub compare URL from origin, so the user can open the PR in one click
    even without the gh CLI installed."""
    slug = _origin_slug()
    return f"https://github.com/{slug}/compare/{base}...{branch}?expand=1" if slug else None


def _use_push_token_if_configured() -> None:
    """Cloud deployments have no local SSH key, so authenticate the git push
    with a scoped GitHub token instead — only when GH_PUSH_TOKEN is present, so
    local runs (which never set it) keep using the existing SSH remote as-is."""
    token = os.environ.get("GH_PUSH_TOKEN")
    slug = _origin_slug()
    if not token or not slug:
        return
    subprocess.run(
        ["git", "remote", "set-url", "origin",
         f"https://x-access-token:{token}@github.com/{slug}.git"],
        cwd=config.REPO_ROOT, check=True, capture_output=True, text=True,
    )


def write_local(drafts: list[dict]) -> str:
    """Append the entries to orgs.json on the current branch (no commit/PR).
    Entries already present are skipped (see tools.write_proposal)."""
    written = tools.write_proposal(drafts, tools.load_ledger())
    msg = f"Appended {len(written)} org(s) to orgs.json (uncommitted, current branch)."
    skipped = len(drafts) - len(written)
    if skipped:
        msg += f" Skipped {skipped} already in orgs.json."
    return msg


def open_pr(cfg: config.RunConfig, drafts: list[dict], verdicts: list[dict]) -> dict:
    """Append + branch + commit + push, then open the PR via gh if present, else
    return the compare URL for one-click PR creation. Returns {url, via, branch}.

    If GH_PUSH_TOKEN is set (cloud deployment, no local SSH key), the push
    authenticates via that scoped token instead — see _use_push_token_if_configured."""
    import time
    accepted = [v for v in verdicts if v.get("decision") == "accept" and v.get("draft_entry")]
    branch = f"{cfg.branch_prefix}/{time.strftime('%Y-%m-%d-%H%M')}"

    _use_push_token_if_configured()

    tools.write_proposal(drafts, tools.load_ledger())
    tools.branch_and_commit(branch, f"Discovery (dashboard): {len(drafts)} proposed org(s)")

    if tools.have_gh():
        url = tools.push_and_open_pr(
            branch, cfg.base_branch,
            f"Discovery: {len(drafts)} candidate org(s) for review",
            report_mod.render_pr_body(accepted))
        return {"url": url, "via": "gh", "branch": branch}

    # No gh: push and hand back a compare URL.
    subprocess.run(["git", "push", "-u", "origin", branch],
                   cwd=config.REPO_ROOT, check=True, capture_output=True, text=True)
    return {"url": _compare_url(branch, cfg.base_branch), "via": "compare", "branch": branch}


# ── Curated scrape (post-merge: get newly-merged orgs live on the site) ───────
# Drives the "Scrape pending" page. orgs.json is only the input list — an org
# merged by a discovery PR stays invisible until fetch_curated scrapes it into
# volops_curated.json and QC/tags run. These run that curated sub-pipeline on
# demand. Each underlying script is a CLI batch tool with hard-coded relative
# paths, so we shell out with cwd=REPO_ROOT (as the finish step does for git),
# rather than importing. fetch_curated's load_dotenv() + the inherited env
# supply the LLM key — the same requirement as the discovery flow.

CURATED_FILE = config.REPO_ROOT / "frontend" / "public" / "data" / "volops_curated.json"


def _fetch_curated_mod():
    """Import the repo-root fetch_curated module (repo root is importable here,
    same as agent.discovery). Importing it also runs its load_dotenv()."""
    root = str(config.REPO_ROOT)
    if root not in sys.path:
        sys.path.insert(0, root)
    import fetch_curated
    return fetch_curated


def pending_orgs() -> list[dict]:
    """Active orgs merged into orgs.json that haven't been scraped yet — the same
    set a no-arg `fetch_curated.py` run would process."""
    return _fetch_curated_mod().pending_orgs()


def _run(cmd: list[str]) -> tuple[bool, str]:
    """Run a repo script with the current interpreter, capturing combined output.

    Force UTF-8 on the child: these scripts print org names / listing titles that
    can contain emoji, and to a captured (piped) stdout Python otherwise defaults
    to the Windows cp1252 codec and crashes on the first emoji — e.g. qc_filter
    printing an expired listing's title. PYTHONIOENCODING fixes the child's
    stdout; encoding/errors fixes our decode side."""
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    proc = subprocess.run([sys.executable, *cmd], cwd=config.REPO_ROOT,
                          capture_output=True, text=True,
                          encoding="utf-8", errors="replace", env=env)
    out = ((proc.stdout or "") + (proc.stderr or "")).strip()
    return proc.returncode == 0, out


def scrape_org_ids(org_ids: list[str], on_progress=None) -> list[dict]:
    """Scrape each org one at a time (fetch_curated --org <id>) so the UI can show
    progress. Each run re-merges volops_curated.json and stamps the ledger.
    Returns per-org {id, ok, output}."""
    results = []
    total = len(org_ids)
    for i, oid in enumerate(org_ids, 1):
        if on_progress:
            on_progress(i, total, oid)
        ok, out = _run(["fetch_curated.py", "--org", oid])
        results.append({"id": oid, "ok": ok, "output": out})
    return results


def run_curated_qc() -> tuple[bool, str]:
    """Dedup + expiry + content-judge the curated file in place (defaults to it)."""
    return _run(["qc_filter.py"])


def run_curated_tags() -> tuple[bool, str]:
    """Add unified_tags to any untagged curated records in place."""
    return _run(["classify_listings.py", "--file", "volops_curated"])


def curated_records(org_ids: list[str]) -> list[dict]:
    """The actual scraped listings for the given orgs, read fresh from
    volops_curated.json — so the dashboard can preview what was curated without
    leaving. Ordered by org then title; each dict is the raw record."""
    ids = set(org_ids)
    try:
        with open(CURATED_FILE, encoding="utf-8") as f:
            records = json.load(f)
    except (OSError, ValueError):
        return []
    rows = [r for r in records if r.get("org_id") in ids]
    rows.sort(key=lambda r: (r.get("org_name") or "", r.get("opportunity_title") or ""))
    return rows


def curated_yield(org_ids: list[str]) -> dict[str, dict]:
    """Post-run summary keyed by org id: how many listings survived QC and how
    many were rejected, read from the current volops_curated.json. Orgs that
    yielded nothing simply report zeros."""
    out = {oid: {"listings": 0, "rejected": 0} for oid in org_ids}
    ids = set(org_ids)
    try:
        with open(CURATED_FILE, encoding="utf-8") as f:
            records = json.load(f)
    except (OSError, ValueError):
        return out
    for r in records:
        oid = r.get("org_id")
        if oid not in ids:
            continue
        if (r.get("qc") or {}).get("status") == "rejected":
            out[oid]["rejected"] += 1
        else:
            out[oid]["listings"] += 1
    return out
