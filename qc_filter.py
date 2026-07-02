"""
LLM quality-control filter for volunteer opportunities.

Reads a volops_*.json file (default: the curated set) and asks an LLM to judge
each opportunity: is this an ACTUAL volunteer opportunity — a person donating
their time in a concrete role — or something that slipped through (a race you
run in, a paid internship, a pickleball tournament, a donation drive, printable
kids' activities, etc.)?

It's NON-DESTRUCTIVE and auditable:
  - stamps each record with a `qc` block (status / category / reason / model),
  - writes every rejection to qc_rejected.json for you to skim,
  - respects qc_overrides.json ({ "<id>": "keep" | "reject" }) so you can
    correct the model,
  - is incremental: only checks records without a `qc` stamp (use --recheck to
    redo all).

The frontend hides records whose qc.status == "rejected".

Usage:
    pip install requests openai            # (or anthropic)
    python qc_filter.py                                  # curated, gpt-4o-mini
    python qc_filter.py --model gpt-4o                   # smarter model
    python qc_filter.py --file frontend/public/data/volops_voly.json
    python qc_filter.py --recheck                        # re-judge everything
"""

import os
import json
import time
import argparse
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

DEFAULT_FILE = Path("frontend/public/data/volops_curated.json")
REJECT_LOG = Path("qc_rejected.json")
OVERRIDES = Path("qc_overrides.json")
BATCH_SIZE = 10
DELAY = 1.0
MAX_DESC_CHARS = 700  # cap each opportunity's text to bound tokens

# ── The rubric (STRICT) ──────────────────────────────────────────────────────
RUBRIC = """\
You are a strict quality-control reviewer for a volunteer-opportunity website.
Decide whether each item is a REAL volunteer opportunity.

KEEP an item ONLY if a person can donate their TIME in a concrete, actionable
volunteer role — an unpaid task where the person provides service or labor
(e.g. tutoring, sorting food, walking shelter dogs, staffing an event, mentoring,
building, driving, admin help). There must be an actual role/task to do.

REJECT the item if it is any of the following (give the matching category):
- "athletic_or_social_event": a race / walk / run / 5K / ride / golf or
  pickleball tournament / gala / party / festival that a person ATTENDS or
  PARTICIPATES IN. EXCEPTION: keep it if the listing is explicitly recruiting
  volunteers to STAFF or WORK the event (e.g. "volunteers needed at water
  stations"). Judge the ROLE, not the event: "run in the 5K" = reject;
  "volunteer at the 5K" = keep.
- "internship_or_job": internship, fellowship, paid position, employment, or
  career/resume role.
- "donation_or_fundraising": asking for money or goods, fundraising,
  sponsorship, "donate," or a drive where the person only drops off items.
- "printable_or_athome_activity": printables, DIY kits, at-home or awareness
  activities, social-media actions, lesson materials.
- "class_membership_or_paid": a paid class, workshop, camp, membership, or
  ticketed program the person pays to join.
- "vague_no_role": only a generic "contact us to volunteer" / "email to get
  involved" with NO specific role or task described.
- "not_volunteering": anything else that isn't a person donating time (e.g. a
  service offered TO the public, a program for clients/beneficiaries).

Return ONLY a JSON array, one object per input item, in the same order:
[{"id": "<id>", "verdict": "keep" | "reject", "category": "<one of the above or null>", "reason": "<short, <140 chars>"}]
No markdown, no commentary.

ITEMS:
{items}
"""


def make_client(provider):
    if provider == "anthropic":
        import anthropic
        key = os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise SystemExit("ANTHROPIC_API_KEY not set.")
        return anthropic.Anthropic(api_key=key)
    import openai
    key = os.environ.get("OPENAI_API_KEY") or os.environ.get("OPEN_AI_KEY")
    if not key:
        raise SystemExit("OPENAI_API_KEY / OPEN_AI_KEY not set.")
    return openai.OpenAI(api_key=key)


def call_llm(client, provider, model, prompt):
    if provider == "anthropic":
        msg = client.messages.create(
            model=model, max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    resp = client.chat.completions.create(
        model=model, temperature=0,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content.strip()


def compact(rec):
    """A small representation of one opportunity for the LLM."""
    loc = rec.get("location") or {}
    return {
        "id": rec.get("id"),
        "org": rec.get("org_name"),
        "title": rec.get("opportunity_title"),
        "short": (rec.get("description_short") or "")[:200],
        "long": (rec.get("description_long") or "")[:MAX_DESC_CHARS],
        "requirements": (rec.get("requirements") or "")[:200],
        "apply": (rec.get("apply_instructions") or "")[:200],
        "virtual": loc.get("virtual"),
    }


def parse_json(raw):
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.lstrip().startswith("json"):
            raw = raw.lstrip()[4:]
    raw = raw.strip()
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError as e:
        print(f"    JSON parse error: {e}\n    {raw[:200]}")
        return []


def judge_batch(client, provider, model, batch):
    items = json.dumps([compact(r) for r in batch], ensure_ascii=False, indent=1)
    raw = call_llm(client, provider, model, RUBRIC.replace("{items}", items))
    verdicts = {v.get("id"): v for v in parse_json(raw) if isinstance(v, dict)}
    return verdicts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default=str(DEFAULT_FILE), help="volops_*.json to review")
    ap.add_argument("--provider", choices=["openai", "anthropic"],
                    default=os.environ.get("QC_PROVIDER", "openai"))
    ap.add_argument("--model", default=os.environ.get("QC_MODEL", "gpt-4o-mini"))
    ap.add_argument("--recheck", action="store_true", help="re-judge records that already have a qc stamp")
    ap.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    args = ap.parse_args()

    path = Path(args.file)
    records = json.load(open(path, encoding="utf-8"))
    client = make_client(args.provider)

    overrides = {}
    if OVERRIDES.exists():
        overrides = json.load(open(OVERRIDES, encoding="utf-8"))

    # Pick records to judge: active, no qc stamp yet (unless --recheck).
    todo = [
        r for r in records
        if r.get("status") != "inactive"
        and r.get("id") not in overrides
        and (args.recheck or "qc" not in r)
    ]
    print(f"{len(records)} records · judging {len(todo)} with {args.provider}/{args.model} "
          f"(strict). Overrides: {len(overrides)}.\n")

    now = datetime.now(timezone.utc).isoformat()
    by_id = {r.get("id"): r for r in records}
    rejected_this_run = 0

    for i in range(0, len(todo), args.batch_size):
        batch = todo[i:i + args.batch_size]
        verdicts = judge_batch(client, args.provider, args.model, batch)
        for r in batch:
            v = verdicts.get(r.get("id"))
            if not v:
                continue  # leave unstamped; a later run retries it
            reject = str(v.get("verdict", "")).lower() == "reject"
            r["qc"] = {
                "status": "rejected" if reject else "passed",
                "category": v.get("category") if reject else None,
                "reason": (v.get("reason") or "")[:200],
                "model": args.model,
                "checked_at": now,
            }
            if reject:
                rejected_this_run += 1
                print(f"  REJECT [{v.get('category')}] {r.get('org_name')}: {r.get('opportunity_title')}")
        print(f"  ...{min(i + args.batch_size, len(todo))}/{len(todo)}")
        time.sleep(DELAY)

    # Apply manual overrides on top (always win).
    for oid, decision in overrides.items():
        if oid in by_id:
            reject = str(decision).lower() == "reject"
            by_id[oid]["qc"] = {
                "status": "rejected" if reject else "passed",
                "category": "manual_override" if reject else None,
                "reason": "manual override",
                "model": "override",
                "checked_at": now,
            }

    # Write the file back (in place).
    json.dump(records, open(path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

    # Rebuild the rejection audit log from the full current state.
    rejected = [
        {
            "id": r.get("id"),
            "org_name": r.get("org_name"),
            "opportunity_title": r.get("opportunity_title"),
            "category": r.get("qc", {}).get("category"),
            "reason": r.get("qc", {}).get("reason"),
            "source_url": r.get("source_url"),
        }
        for r in records
        if r.get("qc", {}).get("status") == "rejected"
    ]
    json.dump(rejected, open(REJECT_LOG, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

    passed = sum(1 for r in records if r.get("qc", {}).get("status") == "passed")
    print(f"\nDone. {rejected_this_run} new rejects this run.")
    print(f"Totals — passed: {passed} · rejected: {len(rejected)} "
          f"(logged to {REJECT_LOG}). Reviewed file: {path}")
    print("To correct a call, add its id to qc_overrides.json as "
          '{"<id>": "keep"} or {"<id>": "reject"} and re-run.')


if __name__ == "__main__":
    main()
