"""The agent's judgment, as prompts (tech plan §7).

Three stages, cost-tiered: two cheap mini-model triages biased toward "keep for
a closer look", then one full-model judgment biased toward "reject" — because a
false accept costs human review time and site quality, while a false negative at
the cheap stage just drops one lead. The final rubric language is carried over
verbatim from qc_filter.py so the agent and the pipeline share one definition of
a real opportunity.
"""

# ── Stage 1: pick the volunteer page from homepage links (mini) ──────────────
VOLUNTEER_PAGE_PICKER = """\
You are given the on-site links from a nonprofit's homepage. Pick the ONE link
most likely to describe how to volunteer / get involved (a "Volunteer", "Get
Involved", "Ways to Help", "Serve", or "Join Us" page).

Return ONLY JSON: {"url": "<the chosen url>"} or {"url": null} if none fit.
No markdown, no commentary.

LINKS:
{links}
"""

# ── Stage 2: cheap local-org triage (mini) ───────────────────────────────────
LOCAL_ORG_TRIAGE = """\
You are doing a fast, cheap triage of a candidate nonprofit for a Dallas-Fort
Worth (DFW) volunteer directory. Based on the page text below, decide:

- is_dfw_local: is this an actual DFW-area nonprofit (a local org or a real
  local chapter/location) — NOT a national org's generic page, NOT a business,
  NOT a directory/aggregator?
- shows_volunteering: does the page indicate volunteer involvement at all
  (roles, "get involved", "volunteer with us", sign-ups)?

Be generous — this is a cheap first pass and a missed lead is cheaper than a
wasted closer look, so when unsure lean toward keep=true.

Return ONLY JSON:
{"is_dfw_local": true|false, "shows_volunteering": true|false, "keep": true|false, "why": "<short>"}
No markdown, no commentary.

PAGE TEXT:
{page_text}
"""

# ── Stage 3: final accept/reject judgment (full model) ───────────────────────
# The KEEP/REJECT rubric here is lifted from qc_filter.py's RUBRIC so the agent
# and the weekly QC pass agree on what "a real opportunity" means.
FINAL_JUDGMENT = """\
You are a STRICT reviewer deciding whether to add a nonprofit to a curated
Dallas-Fort Worth (DFW) volunteer directory. Adding a bad org wastes human
review time and lowers site quality, so when in doubt, REJECT.

ACCEPT only if BOTH hold:
1. The org is a DFW-area nonprofit (in or serving the DFW metro), and
2. The page describes a REAL volunteer opportunity — a person donating their
   TIME in a concrete, actionable role (tutoring, sorting food, walking shelter
   dogs, staffing an event, mentoring, building, driving, admin help).

REJECT if the page only offers, or is really about:
- donations / fundraising / "donate" drives, galas or events you ATTEND,
- internships, fellowships, paid positions, employment,
- paid classes, memberships, or ticketed programs,
- a vague "contact us to volunteer" with NO specific role,
- a national org's generic page not tied to a DFW presence,
- anything that isn't a person donating time.

If you ACCEPT, produce a directory entry using ONLY these cause tags (verbatim):
{taxonomy}

Return ONLY JSON, no markdown:
{
  "decision": "accept" | "reject",
  "confidence": 0.0-1.0,
  "reason": "<one sentence>",
  "evidence_quotes": ["<1-3 short quotes copied verbatim from the page text>"],
  "draft_entry": {
     "name": "<official org name>",
     "city": "<DFW city>",
     "state": "TX",
     "cause": ["<from the taxonomy>"],
     "notes": "<one sentence: what they do + the volunteer role, <200 chars>"
  }
}
If decision is "reject", set draft_entry to null.

ORG NAME GUESS: {name}
VOLUNTEER PAGE URL: {url}

PAGE TEXT:
{page_text}
"""
