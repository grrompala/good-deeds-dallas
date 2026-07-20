"""Evidence cards — the human-facing output (tech plan §2, §7).

One card per investigated org: what we found, short verbatim quotes, why it
qualifies, and one-click links so the reviewer never has to take the model's
word for it. The same renderer feeds both the dry-run markdown report and the
live PR body.
"""

from __future__ import annotations

import json

from .state import Verdict


def _card(v: Verdict) -> str:
    quotes = "\n".join(f"  > {q}" for q in (v.get("evidence_quotes") or []))
    entry = v.get("draft_entry")
    entry_block = (
        "\n```json\n" + json.dumps(entry, indent=2, ensure_ascii=False) + "\n```"
        if entry else ""
    )
    decision = v.get("decision", "?").upper()
    conf = v.get("confidence")
    conf_str = f"{conf:.2f}" if isinstance(conf, (int, float)) else "?"
    return (
        f"### {v.get('name') or v.get('domain')} — **{decision}** "
        f"(confidence {conf_str})\n"
        f"- Domain: `{v.get('domain')}`\n"
        f"- Volunteer page: {v.get('volunteer_url') or '_none found_'}\n"
        f"- Why: {v.get('reason') or ''}\n"
        + (f"- Evidence:\n{quotes}\n" if quotes else "")
        + entry_block
    )


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
        "",
    ]
    lines += [_card(v) for v in accepts] or ["_none_"]
    lines += ["", "## Rejected", ""]
    lines += [_card(v) for v in rejects] or ["_none_"]
    return "\n\n".join(lines) + "\n"


def render_pr_body(accepted: list[Verdict]) -> str:
    """PR body: one evidence card per proposed org, for a five-minute review."""
    lines = [
        "Automated discovery run. Each org below was found, fetched, and judged "
        "by the agent; merge to accept, close to reject.",
        "",
        f"Proposing **{len(accepted)}** new org(s):",
        "",
    ]
    lines += [_card(v) for v in accepted]
    return "\n\n".join(lines) + "\n"
