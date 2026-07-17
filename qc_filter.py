"""
Quality-control filter for volunteer opportunities: a rule-based duplicate
check plus an LLM judge of real-opportunity content.

Two independent passes, always in this order:
  1. Dedup (rule-based, free, no API key): groups records within one file by
     (org, title, description). If a group has no distinguishing schedule
     (an actual date, or specific days/times), all but the most complete copy
     are rejected as duplicates. Idealist re-posts the same base opportunity
     once per shift instance with identical text, which is what this targets.
  2. Content judge (LLM, default: curated set): is this an ACTUAL volunteer
     opportunity — a person donating their time in a concrete role — or
     something that slipped through (a race you run in, a paid internship, a
     pickleball tournament, a donation drive, printable kids' activities,
     etc.)? Skip this pass with --dedupe-only.

It's NON-DESTRUCTIVE and auditable:
  - stamps each record with a `qc` block (status / category / reason / model),
  - writes every rejection to a per-file log for you to skim (qc_rejected.json
    for the curated set, qc_rejected_<name>.json for anything else),
  - respects qc_overrides.json ({ "<id>": "keep" | "reject" }) so you can
    correct the model,
  - is incremental: only checks records without a `qc` stamp (use --recheck to
    redo all) — dedup re-groups fresh every run regardless (it's free).

The frontend hides records whose qc.status == "rejected".

Usage:
    pip install requests openai            # (or anthropic)
    python qc_filter.py                                  # curated, gpt-4o-mini
    python qc_filter.py --model gpt-4o                   # smarter model
    python qc_filter.py --file frontend/public/data/volops_voly.json
    python qc_filter.py --recheck                        # re-judge everything
    python qc_filter.py --file frontend/public/data/volops_idealist.json --dedupe-only
"""

import os
import json
import re
import time
import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

DEFAULT_FILE = Path("frontend/public/data/volops_curated.json")
REJECT_LOG = Path("qc_rejected.json")   # curated's log — kept under its original name
OVERRIDES = Path("qc_overrides.json")
BATCH_SIZE = 10
DELAY = 1.0
MAX_DESC_CHARS = 700  # cap each opportunity's text to bound tokens


def reject_log_path(source_path: Path) -> Path:
    """Each reviewed file gets its own rejection log so running this against a
    second file (e.g. Idealist) can't clobber another file's log — REJECT_LOG
    stays as the name for curated specifically since that's its existing,
    already-committed history."""
    if source_path.resolve() == DEFAULT_FILE.resolve():
        return REJECT_LOG
    stem = source_path.stem.removeprefix("volops_")
    return Path(f"qc_rejected_{stem}.json")

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


# ── Expiry check (LLM date extraction, cached; free date compare each run) ───
# Idealist especially leaves one-time events listed long after the event date
# (e.g. "Date: April 25, 2026 ... Recurrence: One time only" still shown in
# July). Every record gets a one-time LLM extraction of {kind, ends_on} stored
# under rec["expiry"]; the pass then rejects records whose explicit end date
# has passed. Extraction is time-independent (we never tell the model today's
# date), so the stamp stays valid forever — only the cheap comparison reruns.
# Conservative by design: no explicit end date -> never expired.

RUBRIC_DATES = """\
You are extracting scheduling facts from volunteer-opportunity listings.

For each item decide:
- "kind": "one_time" if it is a dated, non-recurring event; "ongoing" if it
  repeats indefinitely or is open-ended (weekly shifts, anytime, flexible);
  "unknown" if you cannot tell.
- "ends_on": the LAST calendar date the opportunity happens, as YYYY-MM-DD —
  the event date for a one-time event, the final date of a range, or an
  explicit "until"/end date (an ongoing opportunity can still have one).
  null if there is no explicit, complete date. NEVER guess: if no year is
  stated, use null. Do not infer a date from vague words like "summer".

Return ONLY a JSON array, one object per input item, in the same order:
[{"id": "<id>", "kind": "one_time" | "ongoing" | "unknown", "ends_on": "YYYY-MM-DD" | null}]
No markdown, no commentary.

ITEMS:
{items}
"""


def compact_dates(rec):
    return {
        "id": rec.get("id"),
        "title": rec.get("opportunity_title"),
        "schedule": rec.get("schedule") or {},
        "description": (rec.get("description_long") or rec.get("description_short") or "")[:MAX_DESC_CHARS],
    }


def _parse_mdy(text):
    """'Nov 14, 2026' -> '2026-11-14', else None."""
    try:
        return datetime.strptime(text.strip(), "%b %d, %Y").date().isoformat()
    except (ValueError, AttributeError):
        return None


def _rule_based_expiry(rec):
    """Deterministic extraction where the data is fully structured (Voly:
    parsed date + recurring flag). Returns an expiry stamp dict or None."""
    sched = rec.get("schedule") or {}
    if isinstance(sched.get("recurring"), bool):
        if sched["recurring"]:
            return {"kind": "ongoing", "ends_on": None, "model": "rule"}
        ends = _parse_mdy(sched.get("date") or "")
        if ends:
            return {"kind": "one_time", "ends_on": ends, "model": "rule"}
    # Idealist-style ISO date alone is NOT trusted deterministically — for
    # some listings it's the start of an ongoing program, so the LLM decides.
    return None


def expiry_pass(records, client, provider, model, recheck, batch_size):
    """Stamp rec['expiry'] where missing (rule or LLM), then reject any
    record whose explicit end date has passed. Returns count rejected."""
    now = datetime.now(timezone.utc).isoformat()
    # "Today" in Dallas terms, not UTC — otherwise events still happening
    # locally get expired a few hours early once UTC rolls past midnight.
    # Fixed UTC-6 offset (CST); at day granularity the DST hour is noise.
    today = (datetime.now(timezone.utc) - timedelta(hours=6)).date().isoformat()

    candidates = [
        r for r in records
        if r.get("status") != "inactive"
        and r.get("qc", {}).get("status") != "rejected"
        and (recheck or "expiry" not in r)
    ]

    # Deterministic stamps first, LLM for the rest.
    todo_llm = []
    for r in candidates:
        stamp = _rule_based_expiry(r)
        if stamp:
            r["expiry"] = {**stamp, "checked_at": now}
        else:
            todo_llm.append(r)

    print(f"Expiry: {len(candidates) - len(todo_llm)} stamped by rule, "
          f"{len(todo_llm)} need LLM date extraction")

    for i in range(0, len(todo_llm), batch_size):
        batch = todo_llm[i:i + batch_size]
        items = json.dumps([compact_dates(r) for r in batch], ensure_ascii=False, indent=1)
        raw = call_llm(client, provider, model, RUBRIC_DATES.replace("{items}", items))
        verdicts = {v.get("id"): v for v in parse_json(raw) if isinstance(v, dict)}
        for r in batch:
            v = verdicts.get(r.get("id"))
            if not v:
                continue  # unstamped; retried next run
            ends_on = v.get("ends_on")
            if ends_on is not None and not re.match(r"^\d{4}-\d{2}-\d{2}$", str(ends_on)):
                ends_on = None  # malformed date from the model — don't trust it
            r["expiry"] = {
                "kind": v.get("kind") if v.get("kind") in ("one_time", "ongoing", "unknown") else "unknown",
                "ends_on": ends_on,
                "model": model,
                "checked_at": now,
            }
        print(f"  ...{min(i + batch_size, len(todo_llm))}/{len(todo_llm)}")
        time.sleep(DELAY)

    # The free, every-run part: reject anything whose end date has passed.
    rejected = 0
    for r in records:
        if r.get("status") == "inactive" or r.get("qc", {}).get("status") == "rejected":
            continue
        ends_on = (r.get("expiry") or {}).get("ends_on")
        if ends_on and ends_on < today:
            r["qc"] = {
                "status": "rejected",
                "category": "expired",
                "reason": f"event date passed ({ends_on})",
                "model": "expiry-rule",
                "checked_at": now,
            }
            rejected += 1
            print(f"  EXPIRED [{ends_on}] {r.get('org_name')}: {r.get('opportunity_title')}")
    return rejected


# ── Deduplication (rule-based, no LLM) ───────────────────────────────────────
# Idealist in particular re-posts the same base opportunity many times (one
# copy per shift instance) with identical org/title/description and only the
# tag order shuffled. Unless there's an actual distinguishing schedule (a real
# date, or specific days/times), those are noise — keep one, reject the rest.

def _normalize(text):
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _dedup_key(rec):
    # description_short (the truncated teaser actually shown on cards) is far
    # more stable across true duplicates than description_long — the full text
    # sometimes carries trivial noise (a phone number appended, a stray line)
    # that breaks an exact match even when the posting is otherwise identical.
    return (
        _normalize(rec.get("org_name")),
        _normalize(rec.get("opportunity_title")),
        _normalize(rec.get("description_short") or rec.get("description_long")),
    )


def _schedule_signal(rec):
    """A schedule value worth distinguishing duplicates by, or None."""
    sched = rec.get("schedule") or {}
    for key in ("date", "raw"):
        val = _normalize(sched.get(key))
        if val:
            return val
    return None


def _completeness(rec):
    """Rough proxy for 'most complete record' — used to pick which duplicate
    to keep. Empty dicts/lists/strings don't count as populated. Excludes
    `qc` itself — it's only ever set on rejected copies, never the keeper, so
    counting it would let a rejected record out-score the keeper on a later
    re-run and flip which copy survives."""
    return sum(1 for k, v in rec.items() if k != "qc" and v not in (None, "", [], {}))


def dedupe_records(records, now):
    """Group active records by (org, title, description). Within a group with
    no distinguishing schedule signal, keep the most complete record and stamp
    the rest qc.status=rejected / category=duplicate. Returns count rejected."""
    groups = {}
    for rec in records:
        if rec.get("status") == "inactive":
            continue
        groups.setdefault(_dedup_key(rec), []).append(rec)

    rejected = 0
    for group in groups.values():
        if len(group) < 2:
            continue
        signals = {_schedule_signal(r) for r in group} - {None}
        if len(signals) > 1:
            continue  # genuinely different scheduled instances — keep all

        keeper = max(group, key=_completeness)
        for rec in group:
            if rec is keeper:
                continue
            rec["qc"] = {
                "status": "rejected",
                "category": "duplicate",
                "reason": f"duplicate of {keeper.get('id')} — same org/title/description, no distinguishing schedule",
                "model": "dedup-rule",
                "checked_at": now,
            }
            rejected += 1
    return rejected


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
    ap.add_argument("--dedupe-only", action="store_true",
                    help="only run the rule-based duplicate check (no LLM, no API key needed) "
                         "and skip the expiry check and the real-opportunity content judge")
    ap.add_argument("--no-judge", action="store_true",
                    help="run dedup + expiry but skip the content judge — for the scraped "
                         "portal sources, which are trusted for content but can go stale")
    args = ap.parse_args()

    path = Path(args.file)
    records = json.load(open(path, encoding="utf-8"))

    overrides = {}
    if OVERRIDES.exists():
        overrides = json.load(open(OVERRIDES, encoding="utf-8"))

    now = datetime.now(timezone.utc).isoformat()
    by_id = {r.get("id"): r for r in records}
    rejected_this_run = 0

    # Rule-based duplicate check always runs first — it's free and catches the
    # same-posting-repeated-N-times noise (Idealist's biggest offender) before
    # any LLM content judging happens.
    dupes_rejected = dedupe_records(records, now)
    print(f"Dedup: {dupes_rejected} record(s) rejected as duplicates.\n")
    rejected_this_run += dupes_rejected

    # Expiry check: LLM extraction is cached per record; the date comparison
    # reruns every time, so newly-passed dates get caught on each run.
    if not args.dedupe_only:
        client = make_client(args.provider)
        expired = expiry_pass(records, client, args.provider, args.model,
                              args.recheck, args.batch_size)
        print(f"Expiry: {expired} record(s) rejected as expired.\n")
        rejected_this_run += expired

    if not args.dedupe_only and not args.no_judge:
        # Pick records to judge: active, no qc stamp yet (unless --recheck).
        todo = [
            r for r in records
            if r.get("status") != "inactive"
            and r.get("id") not in overrides
            and (args.recheck or "qc" not in r)
        ]
        print(f"{len(records)} records · judging {len(todo)} with {args.provider}/{args.model} "
              f"(strict). Overrides: {len(overrides)}.\n")

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

    # Rebuild this file's rejection audit log from its full current state.
    reject_log = reject_log_path(path)
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
    json.dump(rejected, open(reject_log, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

    passed = sum(1 for r in records if r.get("qc", {}).get("status") == "passed")
    print(f"\nDone. {rejected_this_run} new rejects this run.")
    print(f"Totals — passed: {passed} · rejected: {len(rejected)} "
          f"(logged to {reject_log}). Reviewed file: {path}")
    print("To correct a call, add its id to qc_overrides.json as "
          '{"<id>": "keep"} or {"<id>": "reject"} and re-run.')


if __name__ == "__main__":
    main()
