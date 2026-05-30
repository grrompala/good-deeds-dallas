# Volunteer Hub — Frontend

Editorial Next.js site for surfacing volunteer opportunities in Richardson,
Garland, and the wider DFW area. NYT-style aesthetic: warm off-white paper,
deep navy ink, serif headlines (Fraunces), Inter body, JetBrains Mono metadata,
hairline rules, a single burnt-orange accent.

---

## Getting Started

```powershell
cd frontend
npm install
npm run dev        # opens at http://localhost:3000
```

Build a deployable static version:
```powershell
npm run build      # outputs to frontend/out/
```

---

## Feeding Data Into the Site

The site reads four JSON files from `frontend/public/data/`:

| File                      | Source                | Produced by         |
| ------------------------- | --------------------- | ------------------- |
| `volops_garland.json`     | volunteergarland.org  | `fetch_garland.py`  |
| `volops_voly.json`        | dallas.voly.org       | `fetch_voly.py`     |
| `volops_curated.json`     | curated nonprofits    | `fetch_curated.py`  |
| `reddit_raw.json`         | local subreddits      | `fetch_reddit.py`   |

If a file is missing the section just shows fewer results — no crash.

---

## Page Structure

```
Header (sticky)         ← city seals + serif wordmark + section nav
Hero                    ← editorial headline + unified search bar
└── Discover            ← landing: featured + recent grid + news preview
    Browse              ← full opportunity index with cause filters
    Community           ← Reddit feed with subreddit filters
Footer
```

When the user types in the search bar, the app auto-switches to **Browse**
and filters across opportunities, organizations (via `org_name`), and news
in one go.

---

## Restyling Guide

### Palette
Edit `tailwind.config.js`. The editorial palette:

```js
colors: {
  paper:    '#FAF7F2',  // page background
  paperAlt: '#F1ECE2',  // raised cards / pill backgrounds
  ink:      '#0F1B2D',  // headlines, primary text
  inkSoft:  '#1F2A3D',  // body text alt
  muted:    '#6B6258',  // metadata, dates, secondary labels
  rule:     '#E2DACB',  // hairline borders
  accent:   '#C7501A',  // burnt orange (used sparingly)
  accentSoft:'#FBEDE2', // accent background tint
}
```

Save and the dev server hot-reloads.

### Type
Three fonts loaded in `app/layout.js`:

| Family               | Used for                              |
| -------------------- | ------------------------------------- |
| Fraunces (serif)     | Headlines, titles, brand              |
| Inter (sans)         | Body, UI text, buttons                |
| JetBrains Mono       | Metadata accents — dates, counts      |

Custom display sizes are defined in `tailwind.config.js` under `fontSize`:
- `text-display` — hero headline (responsive 2.5–4.5rem)
- `text-headline` — section titles (responsive)
- `text-eyebrow` — small uppercase labels with letter-spacing

### Imagery
City seals live at `public/images/`:
- `richardson-seal.png` — Wikimedia Commons
- `garland-seal.png` — Wikipedia

Swap files to update. Both are referenced from `components/Header.jsx`.

### Layout width
Every section uses `max-w-6xl mx-auto`. Change in:
- `app/page.js` (`<main>` and `<footer>`)
- `components/Header.jsx`
- `components/Hero.jsx`

### Card layout (grid columns)
In `BrowseSection.jsx` and `DiscoverSection.jsx`:

```jsx
<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
```

| Effect                | Class                                       |
| --------------------- | ------------------------------------------- |
| Always one column     | `grid grid-cols-1 gap-6`                    |
| Two on desktop        | `grid md:grid-cols-2 gap-6`                 |
| Three on desktop      | `grid md:grid-cols-2 lg:grid-cols-3 gap-6`  |

### Hero copy
`components/Hero.jsx` — edit the `<h1>` headline and `<p>` subhead.

### Section nav labels
`components/Header.jsx` — the `NAV` array near the top.

---

## File Map

```
frontend/
  app/
    layout.js              ← HTML shell, font imports, site metadata
    page.js                ← main: data loading + section routing + search state
    globals.css            ← background color, type rendering, scroll
  components/
    Header.jsx             ← sticky masthead with city seals
    Hero.jsx               ← landing headline + unified search input
    OpportunityCard.jsx    ← shared card (used by Discover + Browse)
    DiscoverSection.jsx    ← landing-page editorial layout
    BrowseSection.jsx      ← full opportunity index + cause filters
    NewsSection.jsx        ← Reddit feed with subreddit filters
  public/
    images/
      richardson-seal.png  ← city seal
      garland-seal.png     ← city seal
    data/
      volops_garland.json
      volops_voly.json
      volops_curated.json
      reddit_raw.json
  tailwind.config.js       ← palette, fonts, display sizes
  postcss.config.js
  next.config.js
  package.json
```

---

## Notes

- The old `ListingsSection.jsx` and `OrgsSection.jsx` components are no longer
  imported by `page.js`. They're harmless but can be deleted if you want a
  cleaner tree.
- "Recent" sort relies on the `last_scraped` field on each opportunity record.
  All four scrapers stamp this field automatically.
- The page-level search filters across `opportunity_title`, `org_name`,
  `description_short`, `description_long`, `cause_tags`, and `address.city`.
