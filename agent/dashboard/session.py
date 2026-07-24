"""Driving logic for the discovery dashboard — pure functions, no Streamlit, so
it's unit-testable and the UI stays thin.

The dashboard is the orchestrator: instead of LangGraph's automatic edges, the
human advances one stage at a time. Each stage reuses the exact same node logic
the cron uses (agent/discovery/graph.py) — search, per-candidate investigation,
select — so the two paths can't drift.
"""

from __future__ import annotations

import subprocess
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

def _compare_url(branch: str, base: str) -> str | None:
    """GitHub compare URL from origin, so the user can open the PR in one click
    even without the gh CLI installed."""
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
    slug = slug.removesuffix(".git")
    return f"https://github.com/{slug}/compare/{base}...{branch}?expand=1"


def write_local(drafts: list[dict]) -> str:
    """Append the entries to orgs.json on the current branch (no commit/PR)."""
    tools.write_proposal(drafts, tools.load_ledger())
    return f"Appended {len(drafts)} org(s) to orgs.json (uncommitted, current branch)."


def open_pr(cfg: config.RunConfig, drafts: list[dict], verdicts: list[dict]) -> dict:
    """Append + branch + commit + push, then open the PR via gh if present, else
    return the compare URL for one-click PR creation. Returns {url, via, branch}."""
    import time
    accepted = [v for v in verdicts if v.get("decision") == "accept" and v.get("draft_entry")]
    branch = f"{cfg.branch_prefix}/{time.strftime('%Y-%m-%d-%H%M')}"

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
