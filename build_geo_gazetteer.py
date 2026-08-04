"""
Build geo_gazetteer.json: a static lookup of DFW-area city -> (lat, lng).

WHY A STATIC GAZETTEER: at city-level resolution the whole dataset only spans
~90 distinct North-Texas cities, so we geocode that fixed list ONCE here and
commit the result. geocode_listings.py then resolves every opportunity against
this table with zero per-listing API calls — deterministic, offline, free.

The city list below is ALSO the controlled vocabulary geocode_listings.py uses
to filter dirty location strings (Voly in particular emits mangled address
blobs): a resolved string only counts as a city if it matches an entry here.

Source: OpenStreetMap Nominatim (free, no key). Their usage policy asks for
<=1 request/second and a descriptive User-Agent, both honored below. Re-run
only when adding cities to CITIES — existing entries are cached and skipped.

Usage:
    python build_geo_gazetteer.py            # geocode any missing cities
    python build_geo_gazetteer.py --refresh  # re-geocode everything
"""

import argparse
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path("geo_gazetteer.json")
NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "good-deeds-dallas-geocoder/1.0 (grrompala@gmail.com)"
DELAY = 1.1  # seconds between requests (Nominatim policy: <=1/sec)

# Canonical DFW / North-Texas cities. Names here are the display form; matching
# in geocode_listings.py is case/space-insensitive. Add a city and re-run to
# extend coverage. Kept to the metro + near-metro that actually appears in the
# data plus common neighbors, so out-of-metro leakage resolves to "unknown".
CITIES = [
    # Dallas County
    "Dallas", "Irving", "Garland", "Mesquite", "Grand Prairie", "Carrollton",
    "Richardson", "Rowlett", "DeSoto", "Duncanville", "Cedar Hill", "Lancaster",
    "Balch Springs", "Farmers Branch", "Coppell", "Addison", "Sachse",
    "Seagoville", "Wilmer", "Hutchins", "Highland Park", "University Park",
    "Combine", "Glenn Heights", "Sunnyvale", "Cockrell Hill",
    # Tarrant County
    "Fort Worth", "Arlington", "Mansfield", "Euless", "Bedford", "Hurst",
    "Grapevine", "Keller", "Colleyville", "Southlake", "North Richland Hills",
    "Richland Hills", "Watauga", "Benbrook", "Burleson", "Haltom City",
    "Saginaw", "Crowley", "Kennedale", "Azle", "White Settlement", "Forest Hill",
    # Collin County
    "Plano", "McKinney", "Frisco", "Allen", "Wylie", "Prosper", "Celina",
    "Princeton", "Melissa", "Anna", "Farmersville", "Lucas", "Parker",
    "Murphy", "Fairview", "Van Alstyne", "Josephine",
    # Denton County
    "Denton", "Lewisville", "Flower Mound", "The Colony", "Little Elm",
    "Corinth", "Highland Village", "Sanger", "Aubrey", "Pilot Point",
    "Roanoke", "Argyle", "Krum", "Lake Dallas",
    # Rockwall / Kaufman
    "Rockwall", "Rowlett", "Heath", "Royse City", "Fate", "Terrell", "Forney",
    "Kaufman", "Combine",
    # Ellis County (south metro)
    "Waxahachie", "Midlothian", "Red Oak", "Ennis", "Ovilla", "Ferris",
    "Pecan Hill",
    # Grayson / Fannin (north edge)
    "Sherman", "Denison", "Bonham", "Gunter",
    # Parker / Hood (west edge)
    "Weatherford", "Willow Park", "Granbury", "Aledo",
]


def geocode(city: str):
    params = urllib.parse.urlencode({
        "city": city, "state": "Texas", "country": "USA",
        "format": "json", "limit": 1,
    })
    req = urllib.request.Request(f"{NOMINATIM}?{params}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.load(r)
    if not data:
        return None
    return round(float(data[0]["lat"]), 5), round(float(data[0]["lon"]), 5)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="re-geocode all cities")
    args = ap.parse_args()

    table = {}
    if OUT.exists() and not args.refresh:
        table = json.loads(OUT.read_text(encoding="utf-8"))

    # De-dupe CITIES while preserving order.
    seen = set()
    cities = [c for c in CITIES if not (c.lower() in seen or seen.add(c.lower()))]

    todo = [c for c in cities if c not in table]
    print(f"{len(cities)} cities · {len(todo)} to geocode")

    for i, city in enumerate(todo, 1):
        try:
            coords = geocode(city)
        except Exception as e:
            print(f"  [{i}/{len(todo)}] {city}: ERROR {e}")
            continue
        if coords:
            table[city] = {"lat": coords[0], "lng": coords[1]}
            print(f"  [{i}/{len(todo)}] {city}: {coords[0]}, {coords[1]}")
        else:
            print(f"  [{i}/{len(todo)}] {city}: no match")
        time.sleep(DELAY)

    # Stable, sorted output for clean diffs.
    ordered = {k: table[k] for k in sorted(table)}
    OUT.write_text(json.dumps(ordered, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nWrote {len(ordered)} cities -> {OUT}")


if __name__ == "__main__":
    main()
