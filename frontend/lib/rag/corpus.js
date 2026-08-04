// corpus.js — builds the set of things we embed for Smart Search, from the
// listing JSON files. Shared by the offline indexer (scripts/build-rag-index.mjs)
// and kept dependency-free so it runs under plain `node` too.
//
// What goes in the corpus: every active, Texas-area LISTING, plus one entry per
// derived ORGANIZATION. (Chatter is intentionally excluded for now.)

import fs from 'node:fs'
import path from 'node:path'
import { cityName } from '../city.js'

// ── Structured signal extractors ─────────────────────────────────────────────
// These pull the fields that Smart Search now filters on (city, causes, virtual,
// date) out of the messy per-source shapes, so both the embedded text AND the
// SQL columns are populated from one place.

// A listing is virtual if either the top-level flag or the curated location
// sub-object says so.
export function listingIsVirtual(o) {
  if (o?.is_virtual === true) return true
  const loc = o?.location
  return !!(loc && typeof loc === 'object' && loc.virtual === true)
}

// The date a one-time event actually happens ('YYYY-MM-DD'), or null. We only
// trust expiry.ends_on for a genuine one_time occurrence — the same signal the
// frontend card trusts. Recurring/ongoing roles have no fixed date (they're
// available anytime), so they return null and read as "not date-bound".
export function listingEventDate(o) {
  const e = o?.expiry || {}
  if (e.kind === 'one_time' && /^\d{4}-\d{2}-\d{2}$/.test(e.ends_on || '')) {
    return e.ends_on
  }
  return null
}

// The unified taxonomy tags (falls back to raw cause_tags only for the chunk
// text; the causes[] column stores unified tags only, since that's what the
// query parser emits).
function listingCauses(o) {
  return Array.isArray(o?.unified_tags) ? o.unified_tags : []
}

const LISTING_FILES = [
  'public/data/volops_garland.json',
  'public/data/volops_mckinney.json',
  'public/data/volops_voly.json',
  'public/data/volops_idealist.json',
  'public/data/volops_curated.json',
  'public/data/volops_dallasdoinggood.json',
]

// Mirror of the client-side Texas filter in app/page.js: keep a listing if its
// address shows a DFW/Texas signal, or if it has no parseable location at all.
const TX_SIGNAL = /\bTX\b|\bTexas\b|Dallas|Garland|McKinney|Plano|Irving|Arlington|Fort Worth|Frisco|Richardson|Denton|Carrollton|Mesquite|Allen|Rockwall|Wylie|Addison|Grapevine|Lewisville|Rowlett|Sachse|Murphy|Collin|Tarrant|DFW|Metroplex/i

// Mirror of the OTHER_CITY_SIGNAL check in app/page.js — see that file for why.
const OTHER_CITY_SIGNAL = /\bBoston\b|\bChicago\b|\bNew York\b|\bNYC\b|\bLos Angeles\b|\bSeattle\b|\bAtlanta\b|\bMiami\b|\bDenver\b|\bPhoenix\b|\bSan Francisco\b|\bPhiladelphia\b|\bPortland\b|\bNashville\b|\bWashington,?\s*D\.?C\.?\b|\bMinneapolis\b|\bDetroit\b|\bBaltimore\b|\bCharlotte\b|\bOrlando\b|\bTampa\b|\bLas Vegas\b|\bSan Diego\b|\bColumbus\b|\bIndianapolis\b/i

export function isTexasListing(o) {
  const title = o.opportunity_title || ''
  if (OTHER_CITY_SIGNAL.test(title) && !TX_SIGNAL.test(title)) return false

  const a = o.address || {}
  const blob = [a.full, a.city, a.state, o.city, o.state].filter(Boolean).join(' ').trim()
  if (!blob) return true
  return TX_SIGNAL.test(blob)
}

function readJson(file) {
  const raw = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
  return JSON.parse(raw)
}

// ── Chunk builders: the text we actually embed for each entry ────────────────
// A human-readable "when" line so the timing is present in both the embedding
// and the answer context (a dated event shows its date; anything not
// date-bound reads as "Available: ongoing").
function whenLine(o) {
  const d = listingEventDate(o)
  if (d) return `When: ${d} (one-time event)`
  if (o?.expiry?.kind === 'ongoing') return 'Availability: ongoing'
  return null
}

export function chunkListing(o) {
  const tags = (o.unified_tags?.length ? o.unified_tags : o.cause_tags) || []
  // Prefer the geocoder's clean city (cityName reads geo.city first) over the
  // raw, often-missing address.city.
  const city = cityName(o)
  return [
    o.opportunity_title,
    o.org_name && `Organization: ${o.org_name}`,
    city && `Location: ${city}`,
    listingIsVirtual(o) && 'Format: virtual / remote',
    tags.length && `Causes: ${tags.join(', ')}`,
    whenLine(o),
    o.description_long || o.description_short,
  ]
    .filter(Boolean)
    .join('\n')
}

export function chunkOrg(org) {
  return [
    `Organization: ${org.name}`,
    org.cities?.length && `Location: ${org.cities.join(', ')}`,
    org.causes?.length && `Causes: ${org.causes.join(', ')}`,
    org.count && `${org.count} listed opportunit${org.count === 1 ? 'y' : 'ies'}`,
  ]
    .filter(Boolean)
    .join('\n')
}

// Group listings into org records (mirrors components/orgs.js, server-side).
export function deriveOrgs(listings) {
  const byKey = new Map()
  for (const o of listings) {
    const name = (o.org_name || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (!byKey.has(key)) {
      byKey.set(key, { key, name, cities: new Set(), causes: new Set(), count: 0 })
    }
    const rec = byKey.get(key)
    rec.count += 1
    const city = cityName(o)
    if (city) rec.cities.add(city)
    const tags = (o.unified_tags?.length ? o.unified_tags : o.cause_tags) || []
    tags.forEach(t => rec.causes.add(t))
  }
  return [...byKey.values()].map(r => ({
    key: r.key,
    name: r.name,
    cities: [...r.cities],
    causes: [...r.causes],
    count: r.count,
  }))
}

// The structured columns Smart Search filters on, extracted per entry. Kept
// alongside the embedded text so retrieval can use meaning AND facts. A null
// event_date means "not date-bound" (ongoing/undated) — those always satisfy a
// date-window filter; a real date is matched against the window and dropped
// when it's already past.
export function listingMeta(o) {
  return {
    city: cityName(o) || null,
    causes: listingCauses(o),
    is_virtual: listingIsVirtual(o),
    event_date: listingEventDate(o),        // 'YYYY-MM-DD' | null
  }
}

function orgMeta(org) {
  return {
    city: org.cities?.[0] || null,
    causes: org.causes || [],
    is_virtual: false,
    event_date: null,
  }
}

// Load every source, filter, and return [{ type, item, text, meta }] ready to
// embed + upsert. `meta` holds the structured columns (see listingMeta).
export function buildCorpusEntries() {
  const listings = LISTING_FILES.flatMap(f => {
    try {
      return readJson(f)
    } catch {
      return [] // a missing source file is fine — just skip it
    }
  }).filter(o => o.status !== 'inactive' && o.qc?.status !== 'rejected' && isTexasListing(o))

  const entries = []
  for (const o of listings) {
    entries.push({ type: 'listing', item: o, text: chunkListing(o), meta: listingMeta(o) })
  }
  for (const org of deriveOrgs(listings)) {
    entries.push({ type: 'organization', item: org, text: chunkOrg(org), meta: orgMeta(org) })
  }
  return entries
}
