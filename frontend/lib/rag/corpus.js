// corpus.js — builds the set of things we embed for Smart Search, from the
// listing JSON files. Shared by the offline indexer (scripts/build-rag-index.mjs)
// and kept dependency-free so it runs under plain `node` too.
//
// What goes in the corpus: every active, Texas-area LISTING, plus one entry per
// derived ORGANIZATION. (Chatter is intentionally excluded for now.)

import fs from 'node:fs'
import path from 'node:path'

const LISTING_FILES = [
  'public/data/volops_garland.json',
  'public/data/volops_mckinney.json',
  'public/data/volops_voly.json',
  'public/data/volops_idealist.json',
  'public/data/volops_curated.json',
]

// Mirror of the client-side Texas filter in app/page.js: keep a listing if its
// address shows a DFW/Texas signal, or if it has no parseable location at all.
const TX_SIGNAL = /\bTX\b|\bTexas\b|Dallas|Garland|McKinney|Plano|Irving|Arlington|Fort Worth|Frisco|Richardson|Denton|Carrollton|Mesquite|Allen|Rockwall|Wylie|Addison|Grapevine|Lewisville|Rowlett|Sachse|Murphy|Collin|Tarrant|DFW|Metroplex/i

export function isTexasListing(o) {
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
export function chunkListing(o) {
  const tags = (o.unified_tags?.length ? o.unified_tags : o.cause_tags) || []
  return [
    o.opportunity_title,
    o.org_name && `Organization: ${o.org_name}`,
    o.address?.city && `Location: ${o.address.city}`,
    tags.length && `Causes: ${tags.join(', ')}`,
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
    if (o.address?.city) rec.cities.add(o.address.city)
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

// Load every source, filter, and return [{ type, item, text }] ready to embed.
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
    entries.push({ type: 'listing', item: o, text: chunkListing(o) })
  }
  for (const org of deriveOrgs(listings)) {
    entries.push({ type: 'organization', item: org, text: chunkOrg(org) })
  }
  return entries
}
