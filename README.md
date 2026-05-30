# Y'all Volunteer

A volunteer-opportunity index for Greater Dallas. Python scrapers pull from
several local sources, an LLM step assigns unified categories, and a Next.js
frontend serves the result as a static site.

```
┌─────────────────┐    ┌──────────────────┐    ┌────────────────┐
│  Python         │    │  JSON files      │    │  Next.js       │
│  scrapers       │ ─► │  in public/data  │ ─► │  static site   │
│  + classifier   │    │                  │    │                │
└─────────────────┘    └──────────────────┘    └────────────────┘
```

The frontend is read-only — it loads the JSON files at runtime. No backend,
no database. Updates happen by re-running the scrapers and refreshing.

---

## Quick start

```powershell
# 1. Set up environment (one-time)
cd C:\Users\grrom\volunteer_hub
pip install requests beautifulsoup4 lxml python-dotenv openai
echo "OPEN_AI_KEY=sk-..." > .env       # used by fetch_curated + classify_listings

# 2. Scrape (run whenever you want fresh data — each is independent)
python fetch_garland.py        # → frontend/public/data/volops_garland.json
python fetch_mckinney.py       # → frontend/public/data/volops_mckinney.json
python fetch_voly.py           # → frontend/public/data/volops_voly.json
python fetch_curated.py        # → frontend/public/data/volops_curated.json
python fetch_reddit.py         # → frontend/public/data/reddit_raw.json

# 3. Add unified category tags (idempotent — only touches new records)
python classify_listings.py

# 4. Serve the site
cd frontend
npm install                    # first time only
npm run dev                    # http://localhost:3000
```

To deploy as a static site: `npm run build` writes to `frontend/out/`.

---

## Repo layout

```
volunteer_hub/
├── README.md                        ← this file
├── orgs.json                        ← curated list of nonprofits (input to fetch_curated)
├── .env                             ← API keys (gitignored)
│
├── fetch_garland.py                 ← Galaxy Digital scraper for volunteergarland.org
├── fetch_mckinney.py                ← Galaxy Digital scraper for volunteermckinney.galaxydigital.com
├── fetch_voly.py                    ← Voly scraper for dallas.voly.org
├── fetch_curated.py                 ← Reads orgs.json, LLM-extracts opportunities from each org website
├── fetch_reddit.py                  ← Pulls volunteer-related posts from local subreddits
├── fetch_idealist.py                ← (stub — needs Idealist API key)
├── classify_listings.py             ← LLM step that assigns unified category tags to all records
│
└── frontend/                        ← Next.js 15 / React 18 / Tailwind
    ├── app/
    │   ├── layout.js                ← font loading + page shell
    │   ├── page.js                  ← main page; data fetching + section routing
    │   └── globals.css              ← Tailwind directives + base styles
    ├── components/
    │   ├── Hero.jsx                 ← wordmark + tagline + global search bar
    │   ├── TabBar.jsx               ← sticky Listings / Organizations / Chatter nav + Home
    │   ├── SectionShell.jsx         ← shared wrapper for panel header + count + expand link
    │   ├── ListingsPanel.jsx        ← Listings section (Garland + McKinney + Voly)
    │   ├── OrganizationsPanel.jsx   ← Organizations section (curated only)
    │   ├── CommunityPanel.jsx       ← Chatter section (Reddit)
    │   ├── SourceBox.jsx            ← colored square tile per listing source
    │   ├── CityBadge.jsx            ← hover-tooltip map pin
    │   └── sanitizeTag.js           ← getTags() helper + raw-tag sanitizer
    ├── public/
    │   └── data/                    ← scraper output, served at /data/*.json
    │       ├── volops_garland.json
    │       ├── volops_mckinney.json
    │       ├── volops_voly.json
    │       ├── volops_curated.json
    │       └── reddit_raw.json
    ├── tailwind.config.js           ← palette, fonts, display sizes
    ├── next.config.js
    └── package.json
```

---

## Data sources

Each scraper writes to its own JSON file. The frontend loads all of them and
merges. Every record shares a common shape (see [Record schema](#record-schema)
below) but the fields populated vary by source.

| Source                          | Script                | Output                   | What it grabs |
|---------------------------------|-----------------------|--------------------------|---------------|
| volunteergarland.org            | `fetch_garland.py`    | `volops_garland.json`    | Galaxy Digital listings — paginated `/need/` index, then per-need detail pages |
| volunteermckinney.galaxydigital | `fetch_mckinney.py`   | `volops_mckinney.json`   | Same platform as Garland, different city |
| dallas.voly.org                 | `fetch_voly.py`       | `volops_voly.json`       | Voly AJAX endpoint at `/opportunities/search.html?skip=N` (offset pagination), then per-opportunity detail pages |
| Curated nonprofits              | `fetch_curated.py`    | `volops_curated.json`    | Reads `orgs.json`, fetches each org's volunteer URL, uses LLM to extract structured opportunities from the page text |
| r/Richardson, r/Garland, r/DFW, r/Dallas, r/plano | `fetch_reddit.py` | `reddit_raw.json` | Searches each subreddit for volunteer-related keywords using Reddit's public JSON API (no auth) |

### Re-running

All scrapers are **incremental** — they load existing records and only re-fetch
what's changed. Listings that disappear from the source are marked
`status: "inactive"` rather than deleted.

Run them whenever — independently or all at once. Recommended cadence: weekly.

---

## The unified-tags pipeline

Native cause/category labels vary wildly across sites (Galaxy Digital uses
short icon labels, Voly uses long category names, Reddit has none, curated
entries use an LLM-prompted taxonomy). To get **consistent filterable
categories**, run `classify_listings.py` after scraping.

It walks every JSON file, finds records missing `unified_tags`, and asks an
LLM to assign 1-4 tags from a fixed taxonomy defined at the top of the script:

```python
TAXONOMY = [
    "seniors", "children", "food_security", "education", "animals",
    "environment", "housing", "health", "legal", "arts", "community",
    "crisis_support", "foster_care", "disabilities", "mental_health",
    "immigration", "civic", "veterans",
]
```

**To add a new category:** edit `TAXONOMY` in `classify_listings.py`, then run
`python classify_listings.py --reclassify` to re-tag everything (a few cents).

**Cost:** ~$0.05 for a full ~500-record first pass on GPT-4o-mini. Subsequent
runs only hit new records.

The frontend reads `unified_tags` first via `getTags(record)` in
`sanitizeTag.js`, falling back to a heuristic sanitizer over the messy raw
`cause_tags` when no LLM tags exist yet. So you can run the classifier
incrementally without breaking the UI.

---

## Record schema

Every opportunity record looks roughly like this:

```jsonc
{
  "id":                "voly_116506",
  "source":            "voly_dallas",            // or volunteergarland / volunteermckinney / curated
  "source_url":        "https://...",            // link to original listing
  "org_name":          "SoupMobile, Inc.",
  "org_url":           "https://...",            // org's profile/website (when known)
  "opportunity_title": "Feed the Homeless",
  "description_short": "Feeding the homeless in Dallas, Texas.",
  "description_long":  "...",
  "cause_tags":        ["Food/Hunger"],          // raw, source-specific
  "unified_tags":      ["food_security"],        // LLM-assigned (only after classify_listings.py)
  "is_virtual":        false,
  "schedule": {
    "date":     "May 24, 2026",
    "time":     null,
    "duration": "2.5 Hours",
    "raw":      "May 24, 2026 | 2.5 Hours"
  },
  "volunteers_needed": 600,
  "address": {
    "full":  "1234 Main St, Dallas, TX 75201",
    "city":  "Dallas",
    "state": "TX",
    "postal":"75201"
  },
  "contact": { "email": "...", "phone": "...", "info": null },
  "status":       "active",                      // or "inactive" if delisted upstream
  "last_scraped": "2026-05-24T13:36:01+00:00"
}
```

Reddit posts (`reddit_raw.json`) have a different shape — see `fetch_reddit.py`
for fields. They're scored by keyword relevance; the frontend filters to
posts with `relevance.total >= 2`.

---

## Frontend overview

Single-page Next.js app. Three sections, each independently filterable:

| Section          | Source                                            |
|------------------|---------------------------------------------------|
| **Listings**     | Garland + McKinney + Voly (concrete volunteer slots) |
| **Organizations**| Curated nonprofits only (from `orgs.json` via fetch_curated) |
| **Chatter**      | Reddit posts                                      |

### Behavior

- **Default state**: empty home with hero + search bar + suggestion chips.
- **Type in the search bar**: all three sections appear stacked, each filtered
  by the query. Tabs become smooth-scroll anchors.
- **Click a tab without searching**: focuses that single section full-width
  with its filters.
- **Home button** (left of the tab bar) or clicking the **Y'all Volunteer**
  wordmark anywhere returns to the empty state.

### Styling

Editable in `tailwind.config.js`:
- `colors.brand` — indigo accent (buttons, active filters, search ring)
- `colors.accent` — orange highlight (virtual chip, sparingly used)
- `colors.canvas` / `surface` — page background and card background

Source colors live in `SourceBox.jsx` (emerald/rose/violet/amber per source).

City names parsing is unreliable across sources, so the city is shown only
as a hover-revealed map pin (`CityBadge.jsx`) — not as a filter. The pin is
hidden entirely for McKinney listings until parsing improves.

---

## Common workflows

### "I want fresh data"
```powershell
python fetch_garland.py
python fetch_mckinney.py
python fetch_voly.py
python fetch_curated.py
python fetch_reddit.py
python classify_listings.py
```
Refresh `http://localhost:3000`.

### "I want to add a new curated nonprofit"
Edit `orgs.json`. Each entry needs at minimum `id`, `name`, `volunteer_url`,
`active: true`. Run `python fetch_curated.py --org <id>` to test just that one.

### "I want to add a new scraper source"
1. Create `fetch_<name>.py` modeled on an existing scraper.
2. Write to `frontend/public/data/volops_<name>.json`. Use a unique
   `source` value so the frontend can identify it.
3. Add the file path to `LISTING_FILES` in `classify_listings.py`.
4. In `frontend/app/page.js`, add a `fetch('/data/volops_<name>.json')` to the
   `Promise.all` block and include it in the `setOpportunities` merge.
5. If you want a custom source box color/label, add an entry to `SOURCES` in
   `frontend/components/SourceBox.jsx`.

### "I want to add a new cause-tag category"
Edit `TAXONOMY` in `classify_listings.py`, then:
```powershell
python classify_listings.py --reclassify
```
Frontend filter pills update automatically.

### "I want to re-style the site"
Start in `frontend/tailwind.config.js` (palette) and `frontend/app/layout.js`
(fonts). Component-specific tweaks live in `frontend/components/*.jsx` — each
file has a header comment explaining what it does and where to edit.

---

## Known issues / TODO

- **McKinney address parsing** is unreliable; the city pin is hidden for that
  source until the scraper extracts addresses cleanly.
- **Garland scraper** uses older loose regex selectors (the same ones the
  McKinney scraper used to). Likely has similar dirt in `cause_tags`. The
  frontend `sanitizeTags` + `unified_tags` pipeline papers over this, but
  cleaning the source is worth a pass eventually — mirror the precise selectors
  from `fetch_mckinney.py` (`section.description div.section-content`,
  `div.agency .title`, `ul.interests-list li.interest`).
- **fetch_idealist.py** is a stub — needs an API key from support@idealist.org.
- **Voly cities** are accurate when present, but the Voly scraper sometimes
  returns no city (e.g. virtual opportunities) — handled gracefully by hiding
  the pin.
