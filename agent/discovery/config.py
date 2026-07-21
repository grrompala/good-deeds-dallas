"""Run configuration and hard caps for the discovery agent (tech plan §9).

Everything cost- or safety-relevant lives here so a runaway loop hits a cap,
not a bill. Models are env-overridable so switching providers (OpenAI -> the
Claude API) is a config change, not a code change.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# Repo root = two levels up from this file (agent/discovery/config.py).
REPO_ROOT = Path(__file__).resolve().parents[2]

# Long-term memory ledger, committed via the PR (tech plan §5).
LEDGER_PATH = REPO_ROOT / "agent" / "seen_domains.json"

# Where accepted entries are appended, and the files that define "already covered".
ORGS_PATH = REPO_ROOT / "orgs.json"
NTGD_CANDIDATES_PATH = REPO_ROOT / "orgs_ntgd_candidates.json"
VOLOPS_GLOB = "frontend/public/data/volops_*.json"

# Dry-run report destination (tech plan §4 `report` node).
REPORT_DIR = REPO_ROOT / "agent" / "reports"

# Short-term memory: LangGraph SQLite checkpoint store (tech plan §5). Local
# file, gitignored — it's within-run resume state, not something to commit.
CHECKPOINT_PATH = REPO_ROOT / "agent" / "checkpoints.sqlite"

# Aggregators / nationals that are never a curated-source find (tech plan §4 triage).
BLOCKLIST_DOMAINS = {
    "volunteermatch.org", "idealist.org", "eventbrite.com", "facebook.com",
    "gofundme.com", "greatnonprofits.org", "charitynavigator.org",
    "linkedin.com", "indeed.com", "meetup.com", "signupgenius.com",
    "justserve.org", "pointsoflight.org", "handsonconnect.org",
    "guidestar.org", "causeiq.com", "instagram.com", "youtube.com",
    "amazon.com", "google.com", "yelp.com", "wikipedia.org",
    "findhelp.org",   # nationwide social-care referral directory (ex-Aunt Bertha)
    "adoptapet.com",  # nationwide pet-adoption listing aggregator
}

# Target cities for the search grid. DFW-area towns we want curated coverage in.
# This is a *seed* list on purpose: deriving cities from existing coverage would
# only ever re-search where we already are (tech plan §4 plan_queries).
DFW_CITIES = [
    "Dallas", "Richardson", "Garland", "Plano", "McKinney", "Denton",
    "Frisco", "Allen", "Irving", "Mesquite", "Carrollton", "Rowlett",
    "Wylie", "Sachse", "Farmers Branch", "Addison", "The Colony",
    "Lewisville", "Grand Prairie", "Arlington",
]


@dataclass
class RunConfig:
    """One run's settings. Built from CLI flags in __main__."""
    dry_run: bool = True
    provider: str | None = None                 # "openai" | "anthropic" | None=auto
    mini_model: str = os.environ.get("DISCOVERY_MINI_MODEL", "gpt-4o-mini")
    full_model: str = os.environ.get("DISCOVERY_FULL_MODEL", "gpt-4o")

    # Hard caps (tech plan §9).
    max_queries: int = 12
    search_k: int = 8
    max_candidates: int = 25                    # candidates investigated per run
    max_fetches_per_domain: int = 4
    max_entries: int = 10                       # entries proposed per PR
    confidence_threshold: float = 0.6

    # Seed of hand-picked domains for supervised dry-runs (tech plan §10 session 1).
    # When set, the search node is skipped and these are investigated directly.
    seed_domains: list[str] = field(default_factory=list)

    # Memory (tech plan §5).
    checkpoint: bool = True          # SQLite within-run resume; --no-checkpoint off
    thread_id: str = field(          # resume key; same month -> resumes same thread
        default_factory=lambda: f"discovery-{__import__('time').strftime('%Y-%m')}")
    ignore_ledger: bool = False      # bypass + don't persist the ledger (prompt iteration)

    # PR / branch settings (live mode only).
    branch_prefix: str = "discovery"
    base_branch: str = "main"        # PR target
    push: bool = True                # --no-push: prepare branch+commit locally only
