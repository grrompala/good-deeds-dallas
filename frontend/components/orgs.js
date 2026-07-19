// Organization helpers — organizations are DERIVED from listings (there is no
// separate curated orgs source anymore). The display name produced by
// cleanOrgName() doubles as an organization's identity/key, so the same name
// groups listings consistently whether we're in the Listings panel, the
// Organizations panel, or a modal.

import { cleanOrgName } from './cleanText'
import { getTags } from './sanitizeTag'
import { cityName } from '../lib/city'

// Canonical identity for an org. We match case-insensitively so "Wilkinson
// Center" and "wilkinson center" collapse together, but we keep a display name.
export function orgKey(rawName) {
  const name = cleanOrgName(rawName)
  return name ? name.toLowerCase() : null
}

// All listings belonging to one organization, matched by orgKey.
export function listingsForOrg(opportunities, key) {
  if (!key) return []
  return opportunities.filter(o => orgKey(o.org_name) === key)
}

// Build an aggregated record for a single org from its listings.
//   { key, name, count, causes[], cities[], url, sources[] }
export function summarizeOrg(entries) {
  const first = entries[0] || {}
  const name = cleanOrgName(first.org_name) || 'Independent'

  const causeCounts = new Map()
  const cities = new Set()
  const sources = new Set()
  let url = null

  entries.forEach(o => {
    getTags(o).forEach(t => causeCounts.set(t, (causeCounts.get(t) || 0) + 1))
    const city = cityName(o)   // normalized; raw address junk never surfaces
    if (city) cities.add(city)
    if (o.source) sources.add(o.source)
    if (!url && o.org_url) url = o.org_url
  })

  return {
    key:    orgKey(first.org_name),
    name,
    count:  entries.length,
    causes: [...causeCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t),
    cities: [...cities],
    sources: [...sources],
    url,
    entries,
  }
}

// Group an entire listings array into summarized org records.
export function buildOrgs(opportunities) {
  const byKey = new Map()
  opportunities.forEach(o => {
    const key = orgKey(o.org_name)
    if (!key) return
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(o)
  })
  return [...byKey.values()].map(summarizeOrg)
}
