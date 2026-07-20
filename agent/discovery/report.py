"""Evidence cards — the human-facing output (tech plan §2, §7).

One card per investigated org: what surfaced it, what the volunteer page says
(short verbatim quotes), why it qualifies, confidence, and one-click links so
the reviewer never has to take the model's word for it.

Two renderers share the card:
  - render_report  -> dry-run markdown (keeps the raw JSON, since there's no diff)
  - render_pr_body -> PR body (a scan-first summary table + human-readable cards;
    the raw JSON lives in the file diff, so the card omits it)
"""

from __future__ import annotations

import json

from .state import Verdict


def _conf(v: Verdict) -> str:
    c = v.get("confidence")
    return f"{c:.2f}" if isinstance(c, (int, float)) else "?"


def _card(v: Verdict, show_json: bool) -> str:
    entry = v.get("draft_entry") or {}
    name = v.get("name") or entry.get("name") or v.get("domain")
    causes = ", ".join(entry.get("cause") or []) or "—"
    quotes = "\n".join(f"  > {q}" for q in (v.get("evidence_quotes") or []))
    parts = [
        f"### {name} — **{v.get('decision', '?').upper()}** (confidence {_conf(v)})",
        f"- **Domain:** `{v.get('domain')}`",
        f"- **Volunteer page:** {v.get('volunteer_url') or '_none found_'}",
        f"- **Why:** {v.get('reason') or ''}",
    ]
    if entry.get("notes"):
        parts.append(f"- **What they do:** {entry['notes']}")
    if entry.get("cause"):
        parts.append(f"- **Causes:** {causes}")
    if v.get("snippet"):
        parts.append(f"- **Surfaced by search:** {v['snippet']}")
    if quotes:
        parts.append(f"- **Evidence from the page:**\n{quotes}")
    if show_json and v.get("draft_entry"):
        parts.append("```json\n" + json.dumps(entry, indent=2, ensure_ascii=False) + "\n```")
    return "\n".join(parts)


def render_report(verdicts: list[Verdict]) -> str:
    """Full dry-run report: accepts first, then rejects, for quick scanning."""
    accepts = [v for v in verdicts if v.get("decision") == "accept"]
    rejects = [v for v in verdicts if v.get("decision") != "accept"]
    lines = [
        "# Discovery Agent — dry-run report",
        "",
        f"Investigated {len(verdicts)} candidate(s): "
        f"**{len(accepts)} accept**, {len(rejects)} reject.",
        "",
        "## Accepted",
    ]
    lines += [_card(v, show_json=True) for v in accepts] or ["_none_"]
    lines += ["## Rejected"]
    lines += [_card(v, show_json=True) for v in rejects] or ["_none_"]
    return "\n\n".join(lines) + "\n"


def render_pr_body(accepted: list[Verdict]) -> str:
    """PR body: a summary table for a five-second scan, then one card per org.
    Takes the accepted verdicts (evidence + confidence); the appended orgs.json
    entries themselves show up in the PR's file diff."""
    header = [
        "Automated discovery run. Each org below was found, fetched, and judged "
        "by the agent. **Merge** to add them, **close** to reject. The exact "
        "`orgs.json` entries are in the file diff.",
        "",
        f"### Proposing {len(accepted)} new org(s)",
        "",
        "| Org | Causes | Confidence |",
        "| --- | --- | --- |",
    ]
    for v in accepted:
        entry = v.get("draft_entry") or {}
        name = v.get("name") or entry.get("name") or v.get("domain")
        causes = ", ".join(entry.get("cause") or []) or "—"
        header.append(f"| {name} | {causes} | {_conf(v)} |")

    cards = [_card(v, show_json=False) for v in accepted]
    return "\n".join(header) + "\n\n" + "\n\n".join(cards) + "\n"
