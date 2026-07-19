// listings.js — server-side listing access for the crawlable /volunteer pages.
// Reads the same JSON files the client SPA fetches, applies the same
// active/QC/Texas filters, and exposes grouped views (by cause tag, by city).
// Runs at build time on Vercel, so pages regenerate on every deploy — including
// the weekly automated data-refresh commits.

import fs from 'node:fs'
import path from 'node:path'
import { isTexasListing } from './rag/corpus'
import { cityName, citySlug } from './city'

export { cityName, citySlug } // re-export for existing importers

const LISTING_FILES = [
  'public/data/volops_garland.json',
  'public/data/volops_mckinney.json',
  'public/data/volops_voly.json',
  'public/data/volops_idealist.json',
  'public/data/volops_curated.json',
]

// Minimum listings for a city to get its own page (avoids thin pages).
const CITY_PAGE_MIN = 8

let _cache = null

export function loadListings() {
  if (_cache) return _cache
  _cache = LISTING_FILES.flatMap(file => {
    try {
      const raw = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
      return JSON.parse(raw)
    } catch {
      return [] // a missing source file is fine — just skip it
    }
  }).filter(o =>
    o.status !== 'inactive' && o.qc?.status !== 'rejected' && isTexasListing(o)
  )
  return _cache
}

// ── Cause tags ────────────────────────────────────────────────────────────────

export function tagSlug(tag) {
  return tag.replace(/_/g, '-')
}

export function slugToTag(slug) {
  return slug.replace(/-/g, '_')
}

export function listingsByTag(tag) {
  return loadListings().filter(o => (o.unified_tags || []).includes(tag))
}

// [{ tag, count }] for every tag that has at least one listing, biggest first.
export function tagCounts() {
  const counts = new Map()
  for (const o of loadListings()) {
    for (const t of o.unified_tags || []) counts.set(t, (counts.get(t) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }))
}

// ── Cities ────────────────────────────────────────────────────────────────────

// [{ city, slug, count }] for cities with enough listings for their own page.
export function cityCounts() {
  const counts = new Map()
  for (const o of loadListings()) {
    const c = cityName(o)
    if (c) counts.set(c, (counts.get(c) || 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= CITY_PAGE_MIN)
    .sort((a, b) => b[1] - a[1])
    .map(([city, count]) => ({ city, slug: citySlug(city), count }))
}

export function listingsByCitySlug(slug) {
  return loadListings().filter(o => {
    const c = cityName(o)
    return c && citySlug(c) === slug
  })
}

// Slim version of a listing for embedding in a pre-rendered page's payload.
// Drops the bulky fields (full description, QC audit trail) — the client
// fetch swaps in complete records right after hydration, so nothing that
// needs them (detail modals etc.) misses out for more than a moment.
export function lightenListing(o) {
  const { description_long, qc, contact, ...rest } = o
  return rest
}
