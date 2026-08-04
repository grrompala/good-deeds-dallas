"""
Stamps every listing with a normalized `geo` block, so the frontend map,
distance sort, and (later) Smart Search all read location from one clean field
instead of each re-parsing the messy per-source address data.

    "geo": {
      "city":  "Plano",
      "state": "TX",
      "lat":   33.0198,
      "lng":   -96.6989,
      "precision":     "city",          # "city" | "virtual" | "unknown"
      "resolved_from": "location.city"  # which candidate matched (provenance)
    }

RESOLUTION IS CITY-LEVEL and fully offline — no API calls, no LLM. Coordinates
come from geo_gazetteer.json (built once by build_geo_gazetteer.py), which also
serves as the controlled vocabulary: a location string only counts as a city
if it matches a gazetteer entry. This is what filters Voly's mangled address
blobs and street-glued strings ("W. South St. Arlington") down to a real city.

Matching, per listing, tries these candidate strings in order:
    address.city -> location.city -> org city (via org_id) -> address.full
For each candidate:
    1. exact match (normalized) against the gazetteer, then
    2. trailing-token match — the real city is almost always the tail of a
       dirty string ("North Mcdonald Street Mckinney" -> McKinney).
Virtual-only opportunities are stamped precision="virtual" (no coords); nothing
matched -> precision="unknown".

Idempotent: only stamps records without a `geo` block (or all, with --recheck).
Preserved across re-scrapes like `qc` / `expiry` / `unified_tags`.

Usage:
    python geocode_listings.py                    # all files, new records only
    python geocode_listings.py --file volops_voly # one file
    python geocode_listings.py --recheck          # re-stamp everything
"""

import argparse
import json
import re
from pathlib import Path

GAZETTEER = Path("geo_gazetteer.json")
ORGS = Path("orgs.json")

LISTING_FILES = [
    Path("frontend/public/data/volops_garland.json"),
    Path("frontend/public/data/volops_mckinney.json"),
    Path("frontend/public/data/volops_voly.json"),
    Path("frontend/public/data/volops_idealist.json"),
    Path("frontend/public/data/volops_curated.json"),
    Path("frontend/public/data/volops_dallasdoinggood.json"),
]

# Some sources are single-city; when a listing there yields no city, fall back
# to the source's home city rather than "unknown".
SOURCE_DEFAULT_CITY = {
    "volops_garland": "Garland",
    "volops_mckinney": "McKinney",
}


def norm(s: str) -> str:
    """Lowercase, collapse punctuation/whitespace — the matching key."""
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def build_index(gaz: dict):
    """Map normalized city name -> (canonical name, coords). Also return the
    list of (normalized, canonical, coords) sorted longest-first for trailing
    matches, so 'north richland hills' wins over 'richland hills'/'hills'."""
    exact = {}
    for canonical, coords in gaz.items():
        exact[norm(canonical)] = (canonical, coords)
    ordered = sorted(
        ((k, v[0], v[1]) for k, v in exact.items()),
        key=lambda t: len(t[0]), reverse=True,
    )
    return exact, ordered


def match_city(candidate: str, exact: dict, ordered: list):
    """Return (canonical, coords) for a candidate string, or None."""
    key = norm(candidate)
    if not key:
        return None
    if key in exact:
        return exact[key]
    # Trailing / whole-word match: the real city is usually the tail.
    for nkey, canonical, coords in ordered:
        # word-boundary containment so "allen" doesn't match "mcallen"
        if re.search(rf"(?:^|\s){re.escape(nkey)}(?:\s|$)", key):
            return (canonical, coords)
    return None


def is_virtual(rec: dict) -> bool:
    loc = rec.get("location")
    if isinstance(loc, dict) and loc.get("virtual") is True:
        return True
    return bool(rec.get("is_virtual"))


def candidates(rec: dict, org_city: dict):
    """Ordered candidate location strings, cleanest first."""
    a = rec.get("address") or {}
    loc = rec.get("location") if isinstance(rec.get("location"), dict) else {}
    out = [
        (a.get("city"), "address.city"),
        (loc.get("city"), "location.city"),
    ]
    oid = rec.get("org_id")
    if oid and org_city.get(oid):
        out.append((org_city[oid], "org.city"))
    # Dirty last resorts — a trailing real city may still be recoverable.
    out.append((a.get("full"), "address.full"))
    if isinstance(loc, dict):
        out.append((loc.get("address"), "location.address"))
    # Last of all: org names sometimes name their city ("... Hospice, Arlington").
    # Only reached when everything above misses, so it can't override real data.
    out.append((rec.get("org_name"), "org_name"))
    return [(c, src) for c, src in out if c and str(c).strip()]


def resolve(rec: dict, exact, ordered, org_city, source_stem):
    if is_virtual(rec):
        return {"city": None, "state": "TX", "lat": None, "lng": None,
                "precision": "virtual", "resolved_from": "location.virtual"}

    for cand, src in candidates(rec, org_city):
        hit = match_city(cand, exact, ordered)
        if hit:
            canonical, coords = hit
            return {"city": canonical, "state": "TX",
                    "lat": coords["lat"], "lng": coords["lng"],
                    "precision": "city", "resolved_from": src}

    default = SOURCE_DEFAULT_CITY.get(source_stem)
    if default:
        hit = match_city(default, exact, ordered)
        if hit:
            canonical, coords = hit
            return {"city": canonical, "state": "TX",
                    "lat": coords["lat"], "lng": coords["lng"],
                    "precision": "city", "resolved_from": "source.default"}

    return {"city": None, "state": None, "lat": None, "lng": None,
            "precision": "unknown", "resolved_from": None}


def process_file(path: Path, exact, ordered, org_city, recheck: bool):
    if not path.exists():
        print(f"  Skip — not found: {path}")
        return None

    records = json.loads(path.read_text(encoding="utf-8"))
    todo = [r for r in records if recheck or not r.get("geo")]
    stem = path.stem

    stats = {"city": 0, "virtual": 0, "unknown": 0}
    for rec in todo:
        rec["geo"] = resolve(rec, exact, ordered, org_city, stem)

    # Report over ALL active records, not just newly-stamped ones.
    for rec in records:
        if rec.get("status") == "inactive":
            continue
        g = rec.get("geo") or {}
        stats[g.get("precision", "unknown")] = stats.get(g.get("precision", "unknown"), 0) + 1

    path.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
    active = sum(stats.values())
    print(f"  {len(records)} records ({len(todo)} stamped) · active: "
          f"city={stats['city']} virtual={stats['virtual']} unknown={stats['unknown']}"
          + (f"  [{100*stats['city']//active if active else 0}% located]" if active else ""))
    return stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="one file (basename without .json)")
    ap.add_argument("--recheck", action="store_true", help="re-stamp all records")
    args = ap.parse_args()

    if not GAZETTEER.exists():
        raise SystemExit("geo_gazetteer.json missing — run build_geo_gazetteer.py first.")
    gaz = json.loads(GAZETTEER.read_text(encoding="utf-8"))
    exact, ordered = build_index(gaz)

    orgs = json.loads(ORGS.read_text(encoding="utf-8")) if ORGS.exists() else []
    org_city = {o["id"]: o.get("city", "").strip() for o in orgs}
    print(f"Gazetteer: {len(gaz)} cities · orgs.json: {len(org_city)} org cities\n")

    files = LISTING_FILES
    if args.file:
        files = [p for p in files if p.stem == args.file]
        if not files:
            print(f"No file matching '{args.file}'")
            return

    totals = {"city": 0, "virtual": 0, "unknown": 0}
    for path in files:
        print(f"--- {path.name} ---")
        s = process_file(path, exact, ordered, org_city, args.recheck)
        if s:
            for k in totals:
                totals[k] += s.get(k, 0)
        print()

    tot = sum(totals.values())
    print(f"TOTAL active: city={totals['city']} virtual={totals['virtual']} "
          f"unknown={totals['unknown']}"
          + (f"  ({100*totals['city']//tot}% located)" if tot else ""))


if __name__ == "__main__":
    main()
