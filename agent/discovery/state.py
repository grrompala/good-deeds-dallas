"""Typed state flowing through the discovery graph (tech plan §5).

Kept deliberately small: each node reads a few keys and writes a few. Run
configuration (caps, dry-run, models) lives in config.RunConfig, not here —
state is data that flows, config is settings that don't.
"""

from __future__ import annotations

from typing import Optional, TypedDict


class LedgerEntry(TypedDict):
    """One row of long-term memory: what we decided about a domain, and when."""
    verdict: str   # "accept" | "reject"
    date: str      # ISO date of the investigation
    reason: str    # short human-readable why


class Candidate(TypedDict, total=False):
    """A possible org, flowing through search -> triage -> investigate."""
    name: str       # best guess at the org name (from search result title)
    domain: str     # bare registrable-ish domain, lowercased, no www.
    url: str        # the URL the search surfaced
    snippet: str    # search snippet, for cheap triage


class Verdict(TypedDict, total=False):
    """The outcome of investigating one candidate."""
    domain: str
    name: str
    decision: str                 # "accept" | "reject"
    confidence: float             # 0..1
    reason: str
    evidence_quotes: list[str]    # 1-3 short verbatim quotes from the page
    volunteer_url: Optional[str]  # the page we judged
    draft_entry: Optional[dict]   # schema-shaped orgs.json entry when accepted


class OrgEntry(TypedDict, total=False):
    """An orgs.json entry, matching the existing schema exactly (tech plan §2)."""
    id: str
    name: str
    city: str
    state: str
    cause: list[str]
    volunteer_url: str
    fallback_urls: list[str]
    notes: str
    active: bool


class DiscoveryState(TypedDict, total=False):
    """The graph's shared state. total=False so nodes can populate incrementally."""
    queries: list[str]                  # the month's search-grid slice
    coverage: set[str]                  # normalized org names we already have
    coverage_domains: set[str]          # domains we already have
    ledger: dict[str, LedgerEntry]      # domain -> LedgerEntry (long-term memory)
    candidates: list[Candidate]         # flowing through triage/investigate
    verdicts: list[Verdict]             # investigation outcomes
    drafts: list[OrgEntry]              # accepted, schema-shaped entries
    output_ref: Optional[str]           # PR url (live) or report path (dry-run)
    diagnostics: dict                   # queries run + triage funnel, for the report
