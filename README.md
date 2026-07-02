# Good Deeds Dallas

A volunteer-opportunity index for Greater Dallas. Python scrapers pull from
several local sources, an LLM step assigns unified categories, and a Next.js
frontend serves the result. A **Smart Search** feature adds semantic
(natural-language) search over the opportunities, backed by embeddings stored
in Supabase (pgvector).

```
┌──────────────┐   ┌──────────────────┐   ┌────────────────┐
│ Python       │   │ JSON files       │   │ Next.js app    │
│ scrapers     ├──►│ in public/data   ├──►│ (browse + UI)  │
│ + classifier │   │                  │   │                │
└──────────────┘   └─────────┬────────┘   └───────┬────────┘
                             │                     │
                   ┌─────────▼─────────┐   ┌───────▼────────┐
                   │ build-rag-index   │   │ /api/chat      │
                   │ embeds → Supabase ├──►│ retrieve + LLM │
                   │ (pgvector)        │   │ → Smart Search │
                   └───────────────────┘   └────────────────┘
```

Browsing the site is read-only over the JSON files. **Smart Search** is the one
server-backed feature: it needs the Next.js API routes (so the app is no longer
a pure static export) plus a Supabase project holding the embeddings.

---

## Quick start

```powershell
# 1. One-time Python setup (scrapers + classifier)
cd C:\Users\grrom\volunteer_hub
pip install requests beautifulsoup4 lxml python-dotenv openai
echo "OPEN_AI_KEY=sk-..." > .env       # used by fetch_curated + classify_listings

# 2. Scrape (each is independent; re-run whenever)
python fetch_garland.py        # → frontend/public/data/volops_garland.json
python fetch_mckinney.py       # → frontend/public/data/volops_mckinney.json
python fetch_voly.py           # → frontend/public/data/volops_voly.json
python fetch_idealist.py       # → frontend/public/data/volops_idealist.json
python fetch_reddit.py         # → frontend/public/data/reddit_raw.json

# 3. Add unified category tags (idempotent — only touches new records)
python classify_listings.py

# 4. Serve the site
cd frontend
npm install                    # first time only
npm run dev                    # http://localhost:3000
```

That's enough to browse Opportunities / Organizations / Chatter. To also light up
**Smart Search**, do the [Smart Search setup](#smart-search-rag) below.

---

## Repo layout

```
volunteer_hub/
├── README.md                        ← this file
├── orgs.json                        ← curated nonprofit list (input to fetch_curated)
├── .env                             ← Python API keys (gitignored)
│
├── fetch_garland.py                 ← Galaxy Digital scraper (volunteergarland.org)
├── fetch_mckinney.py                ← Galaxy Digital scraper (volunteermckinney.galaxydigital.com)
├── fetch_voly.py                    ← Voly scraper (dallas.voly.org)
├── fetch_idealist.py                ← Idealist (Dallas slice via public Algolia search)
├── fetch_curated.py                 ← LLM-extracts opportunities from org websites (orgs.json)
├── fetch_reddit.py                  ← volunteer-related posts from local subreddits
├── classify_listings.py             ← LLM step assigning unified category tags
│
└── frontend/                        ← Next.js 15 / React 18 / Tailwind
    ├── app/
    │   ├── layout.js                ← fonts + page shell + browser title
    │   ├── page.js                  ← main page; data load, Texas filter, section routing
    │   └── api/chat/route.js        ← Smart Search endpoint (retrieve + LLM)
    ├── components/
    │   ├── Hero.jsx                 ← wordmark + tagline + global search bar
    │   ├── TabBar.jsx               ← Opportunities / Organizations / Chatter / Smart Search nav
    │   ├── SectionShell.jsx         ← shared panel header (title + count + expand)
    │   ├── ListingsPanel.jsx        ← Opportunities section (+ exported ListingRow)
    │   ├── OrganizationsPanel.jsx   ← Organizations section (DERIVED from listings)
    │   ├── CommunityPanel.jsx       ← Chatter section (Reddit)
    │   ├── AdvancedSearchPanel.jsx  ← Smart Search UI (chat answer + ranked results)
    │   ├── SourcesBlurb.jsx         ← per-source descriptions (shown on home)
    │   ├── OrgModal.jsx             ← all opportunities for one org
    │   ├── ListingDetailModal.jsx   ← full opportunity description
    │   ├── Modal.jsx                ← shared modal primitive
    │   ├── orgs.js                  ← buildOrgs(): derive org records from listings
    │   ├── SourceBox.jsx            ← colored source tile + sourceInfo()
    │   └── sanitizeTag.js           ← getTags() helper + raw-tag sanitizer
    ├── lib/rag/                     ← Smart Search (RAG) internals
    │   ├── config.js                ← model + dimensions config (env-driven)
    │   ├── openai.js                ← embed / embedBatch / chat (fetch wrappers)
    │   ├── corpus.js                ← builds the embed corpus (TX-filtered listings + orgs)
    │   ├── supabase.js              ← server-side Supabase client (secret key)
    │   └── store.js                 ← retrieve() via match_opportunities RPC
    ├── scripts/
    │   └── build-rag-index.mjs      ← offline indexer: embed corpus → upsert to Supabase
    ├── supabase/
    │   └── schema.sql               ← opportunities table + hnsw index + match RPC
    ├── public/data/                 ← scraper output, served at /data/*.json
    ├── .env.local.example           ← env template (copy to .env.local)
    ├── tailwind.config.js           ← palette, fonts, display sizes
    ├── next.config.js               ← static export disabled (API routes need a server)
    └── package.json
```

---

## Data sources

Each scraper writes its own JSON file; the frontend loads and merges them.
Records share a common shape (see [Record schema](#record-schema)) though
populated fields vary by source.

| Source | Script | Output | Notes |
|--------|--------|--------|-------|
| volunteergarland.org | `fetch_garland.py` | `volops_garland.json` | Galaxy Digital. Parses **only the opportunity description + location**, stripping page chrome (see below). |
| volunteermckinney.galaxydigital | `fetch_mckinney.py` | `volops_mckinney.json` | Same platform/cleanup as Garland. |
| dallas.voly.org | `fetch_voly.py` | `volops_voly.json` | Voly AJAX search + detail pages. |
| Idealist (Dallas) | `fetch_idealist.py` | `volops_idealist.json` | Dallas-metro slice via Idealist's public Algolia search. |
| Curated nonprofits | `fetch_curated.py` | `volops_curated.json` | LLM-extracts from org websites in `orgs.json`. *(Not currently loaded by the frontend.)* |
| Local subreddits | `fetch_reddit.py` | `reddit_raw.json` | r/Dallas, r/Garland, r/plano, r/Richardson, r/DFW. |

The frontend loads **garland + mckinney + voly + idealist** as Opportunities and
**reddit** as Chatter. Organizations are *derived* from the loaded opportunities
(no separate curated source in the UI).

### Galaxy Digital description/location cleanup

Garland and McKinney detail pages wrap the real content in UI chrome (button
labels, icon captions, schedule widgets). `fetch_garland.py` and
`fetch_mckinney.py` share a set of cleaners (`clean_description`,
`clean_location`) that keep only the opportunity body (anchored on the
"Opportunity Description" heading) and a real street address — dropping calendar
blocks that aren't addresses. If you re-scrape, output is clean automatically.

### Texas filtering

National sources (Idealist, Voly) occasionally surface out-of-metro listings.
`frontend/app/page.js` filters them at load (`isTexasListing`): a listing is kept
if its address shows a DFW/Texas signal, or if it has no parseable location;
it's dropped only when it names a place with no Texas signal.

### Re-running

Scrapers are **incremental** — they load existing records and only re-fetch
what changed. Delisted listings are marked `status: "inactive"`, not deleted.
Recommended cadence: weekly. **After re-scraping, rebuild the Smart Search index**
(see below) so embeddings reflect the new data.

---

## The unified-tags pipeline

Native category labels vary across sites, so `classify_listings.py` assigns
**consistent filterable tags** from a fixed taxonomy. It walks every JSON file,
finds records missing `unified_tags`, and asks an LLM to assign 1–4 tags:

```python
TAXONOMY = [
    "seniors", "children", "food_security", "education", "animals",
    "environment", "housing", "health", "legal", "arts", "community",
    "crisis_support", "foster_care", "disabilities", "mental_health",
    "immigration", "civic", "veterans",
]
```

**Add a category:** edit `TAXONOMY`, then `python classify_listings.py --reclassify`.
**Cost:** ~$0.05 for a full first pass on GPT-4o-mini; later runs only hit new
records. The frontend reads `unified_tags` first via `getTags()`
(`sanitizeTag.js`), falling back to a heuristic over raw `cause_tags`.

---

## Smart Search (RAG)

Natural-language search over opportunities. Pipeline:

```
corpus.js (TX listings + derived orgs)
   → build-rag-index.mjs: embed each (text-embedding-3-small @ 256 dims)
   → Supabase: opportunities table (pgvector)
   → /api/chat: embed query → match_opportunities() top-k → LLM grounded answer
   → AdvancedSearchPanel: chat answer + ranked opportunity cards
```

Retrieval order **is** the ranking (cosine similarity, computed in Postgres via
an HNSW index). The LLM only writes the prose answer; it doesn't pick the cards.
Smart Search currently surfaces **opportunities only** (orgs are embedded but not
shown).

### Setup

```powershell
cd frontend
npm install @supabase/supabase-js          # one-time
```

1. **Supabase project** → SQL Editor → paste & run `frontend/supabase/schema.sql`
   (enable Row Level Security when prompted; the server uses the secret key, which
   bypasses RLS — leave the table with no policies so the public key is locked out).
2. **`frontend/.env.local`** (copy from `.env.local.example`, never commit real keys):
   ```
   OPENAI_API_KEY=sk-...
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...        # the SECRET key, not publishable
   RAG_EMBED_MODEL=text-embedding-3-small
   RAG_CHAT_MODEL=gpt-4o-mini
   RAG_EMBED_DIMS=256                        # must match vector(N) in schema.sql
   RAG_TOP_K=8
   ```
3. **Build the index** (embeds ~2k entries, ~1¢, upserts to Supabase):
   ```powershell
   node scripts/build-rag-index.mjs
   ```
4. `npm run dev`, open the **Smart Search** tab.

### Swapping models

- **Chat model:** change `RAG_CHAT_MODEL` and restart. **No re-index needed.**
- **Embedding model or dimensions:** change `RAG_EMBED_MODEL` / `RAG_EMBED_DIMS`,
  update `vector(N)` in `schema.sql` to match, re-run the schema, then re-run
  `build-rag-index.mjs` (query and document vectors must come from the same model
  + dimensions).

### Guardrails

`app/api/chat/route.js` enforces a 300-char query cap and a soft per-IP daily
limit (`DAILY_LIMIT`, currently 5). The per-IP limit is best-effort — serverless
instances don't share memory, so it's a speed bump, not a hard quota (a durable
limit needs a shared store like KV/Redis).

### Cost / scale notes

text-embedding-3-small at 256 dims keeps the index tiny and recall is plenty at
this scale (~2k vectors). Supabase's free tier (pgvector included) covers this
comfortably; free projects pause after ~1 week idle and wake on the next query.

---

## Record schema

```jsonc
{
  "id":                "voly_116506",
  "source":            "voly_dallas",            // volunteergarland / volunteermckinney / idealist / ...
  "source_url":        "https://...",
  "org_name":          "SoupMobile, Inc.",
  "org_url":           "https://...",
  "opportunity_title": "Feed the Homeless",
  "description_short": "Feeding the homeless in Dallas, Texas.",
  "description_long":  "...",
  "cause_tags":        ["Food/Hunger"],          // raw, source-specific
  "unified_tags":      ["food_security"],        // LLM-assigned (after classify_listings.py)
  "is_virtual":        false,
  "schedule":          { "date": "May 24, 2026", "duration": "2.5 Hours", "raw": "..." },
  "volunteers_needed": 600,
  "address":           { "full": "...", "city": "Dallas", "state": "TX", "zip": "75201" },
  "contact":           { "email": "...", "phone": "...", "info": null },
  "status":            "active",                 // or "inactive" if delisted upstream
  "last_scraped":      "2026-05-24T13:36:01+00:00"
}
```

Reddit posts (`reddit_raw.json`) have a different shape — see `fetch_reddit.py`.
They're keyword-scored; the frontend keeps posts with `relevance.total >= 2`.

---

## Frontend overview

Single-page Next.js app. Four tabs:

| Tab | Source |
|-----|--------|
| **Opportunities** | Garland + McKinney + Voly + Idealist (concrete volunteer slots) |
| **Organizations** | Derived from the loaded opportunities (`buildOrgs` in `orgs.js`) |
| **Chatter** | Reddit posts |
| **Smart Search** | Semantic search (see above) |

### Behavior

- **Default state:** empty home with hero, search bar, suggestion chips, source
  descriptions, and a Smart Search callout.
- **Type in the search bar:** Opportunities / Organizations / Chatter appear
  stacked, filtered by the query; tabs become smooth-scroll anchors.
- **Click a tab without searching:** focuses that section full-width.
- **Smart Search** is its own mode (independent of the keyword search).
- **Home button** or the **Good Deeds Dallas** wordmark returns to the empty state.

The Opportunities panel filters by **Source** and **Cause** (multi-select);
ordering is fixed to most-recently-added (the old sort dropdown was removed).
Org names and "Read more" open modals (`OrgModal` / `ListingDetailModal`)
without leaving the site.

### Styling

Editable in `tailwind.config.js`: `colors.brand` (indigo accent), `colors.accent`
(orange highlight), `colors.canvas` / `surface`. Source colors live in
`SourceBox.jsx`. City names parse unreliably, so the city shows only as a
hover map pin (`CityBadge.jsx`).

---

## Deploying

The app is **not** a pure static export anymore — `output: 'export'` is disabled
in `next.config.js` because Smart Search needs the `/api/chat` route to run on a
server. Deploy on Vercel (Next.js runs API routes as serverless functions
natively). Set the same env vars (`OPENAI_API_KEY`, `SUPABASE_URL`,
`SUPABASE_SECRET_KEY`, `RAG_*`) in the Vercel project settings. The Smart Search
index lives in Supabase, so no large file ships with the build.

---

## Common workflows

### "I want fresh data"
```powershell
python fetch_garland.py; python fetch_mckinney.py; python fetch_voly.py
python fetch_idealist.py; python fetch_reddit.py
python classify_listings.py
cd frontend; node scripts/build-rag-index.mjs   # refresh Smart Search embeddings
```

### "I want to add a new scraper source"
1. Create `fetch_<name>.py`; write to `frontend/public/data/volops_<name>.json`
   with a unique `source` value.
2. Add the path to `LISTING_FILES` in `classify_listings.py` **and** in
   `frontend/lib/rag/corpus.js` (so Smart Search indexes it).
3. In `frontend/app/page.js`, add a `fetch('/data/volops_<name>.json')` to the
   `Promise.all` and include it in the `setOpportunities` merge.
4. Add a source color/label in `frontend/components/SourceBox.jsx`.

### "I want to add a cause-tag category"
Edit `TAXONOMY` in `classify_listings.py`, then
`python classify_listings.py --reclassify`. Filter pills update automatically.

### "I want to test a different chat LLM"
Change `RAG_CHAT_MODEL` in `frontend/.env.local`, restart `npm run dev`. No
re-index needed.

---

## Known issues / TODO

* Voly org addresses still parse poorly (multi-line / non-address blocks).
* City-name casing is inconsistent across sources (some all-caps).
* Per-IP rate limit is in-memory only — needs a shared store to be durable.
* 27 MB-era concern is gone (Supabase), but free Supabase projects pause when idle.
* Nice-to-haves: GIFs/memes on the empty state; threshold weak Smart Search
  matches so a "no match" answer shows fewer cards.
