// OrganizationsPanel — directory of organizations DERIVED from the listings.
// There is no separate curated source anymore: every org here is built from
// the same opportunities shown in the Listings panel (see orgs.js). Clicking
// an org opens the OrgModal summary of all its listings.

import { useEffect, useMemo, useRef, useState } from 'react'
import SectionShell from './SectionShell'
import TagChip from './TagChip'
import { buildOrgs } from './orgs'
import { CANONICAL_TAGS } from './tagMeta'
import FilterDrawer, { FilterGroup, SitePill } from './FilterDrawer'

// City pills: keep the list bounded, most-common first.
const CITY_MAX_PILLS = 20

export default function OrganizationsPanel({ listings = [], compact = false, searchActive = false, onExpand, onSelectOrg }) {
  // Multi-select, mirroring the Opportunities panel: empty array = "All".
  const [causes, setCauses] = useState([])
  const [cities, setCities] = useState([])

  // ── Derive orgs from listings ────────────────────────────────────────────
  const orgs = useMemo(() => buildOrgs(listings), [listings])

  // Cause facet — canonical taxonomy only (see tagMeta), so raw scraped tags
  // don't leak in. Sorted by how many orgs work in each cause.
  const causeOptions = useMemo(() => {
    const counts = new Map()
    orgs.forEach(o => o.causes.forEach(t => {
      if (CANONICAL_TAGS.has(t)) counts.set(t, (counts.get(t) || 0) + 1)
    }))
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, count }))
  }, [orgs])

  const cityOptions = useMemo(() => {
    const counts = new Map()
    orgs.forEach(o => o.cities.forEach(c => { if (c) counts.set(c, (counts.get(c) || 0) + 1) }))
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, CITY_MAX_PILLS)
      .map(([id, count]) => ({ id, count }))
  }, [orgs])

  const filtered = useMemo(() => {
    let rows = orgs
    if (causes.length) rows = rows.filter(o => o.causes.some(c => causes.includes(c)))
    if (cities.length) rows = rows.filter(o => o.cities.some(c => cities.includes(c)))
    return [...rows].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [orgs, causes, cities])

  const visible = compact ? filtered.slice(0, 8) : filtered

  function toggle(setter, value) {
    setter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])
  }
  function resetFilters() { setCauses([]); setCities([]) }
  const activeFilterCount = causes.length + cities.length

  // Jump back to the top of the list whenever a filter changes (skips first
  // render so pre-filtered routes don't auto-scroll on load).
  const topRef = useRef(null)
  const filtersMounted = useRef(false)
  useEffect(() => {
    if (!filtersMounted.current) { filtersMounted.current = true; return }
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [causes, cities])

  return (
    <SectionShell
      title="Organizations"
      subtitle="Every organization we've found across the Dallas listings, and what they need help with."
      count={`${filtered.length} of ${orgs.length}`}
      compact={compact}
      onExpand={onExpand}
    >
      {/* Scroll anchor for auto-scroll-to-top on filter change. */}
      <div ref={topRef} aria-hidden className="h-0" style={{ scrollMarginTop: 'var(--app-header-h, 96px)' }} />

      {!compact && (
        <FilterDrawer
          activeCount={activeFilterCount}
          resultCount={filtered.length}
          resultNoun="organization"
          onReset={resetFilters}
        >
          <FilterGroup label="Cause">
            <SitePill active={causes.length === 0} count={orgs.length} onClick={() => setCauses([])}>
              All causes
            </SitePill>
            {causeOptions.map(o => (
              <TagChip
                key={o.id}
                id={o.id}
                count={o.count}
                active={causes.includes(o.id)}
                onClick={() => toggle(setCauses, o.id)}
                variant="filter"
              />
            ))}
          </FilterGroup>

          {cityOptions.length > 0 && (
            <FilterGroup label="City">
              <SitePill active={cities.length === 0} onClick={() => setCities([])}>
                All cities
              </SitePill>
              {cityOptions.map(o => (
                <SitePill
                  key={o.id}
                  active={cities.includes(o.id)}
                  count={o.count}
                  onClick={() => toggle(setCities, o.id)}
                >
                  {o.id}
                </SitePill>
              ))}
            </FilterGroup>
          )}
        </FilterDrawer>
      )}

      {visible.length === 0 ? (
        <div className="bg-white border border-line rounded-2xl py-12 text-center">
          <p className="text-sm text-muted">No organizations match.</p>
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="mt-2 text-brand text-sm font-semibold hover:text-brandDark"
            >
              Reset filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-line rounded-2xl shadow-card divide-y divide-lineSoft overflow-hidden">
          {visible.map(o => (
            <OrgRow
              key={o.key}
              org={o}
              compact={compact}
              onSelectOrg={onSelectOrg}
            />
          ))}
        </div>
      )}

      {compact && filtered.length > 8 && (
        <button onClick={onExpand} className="mt-4 w-full text-center text-sm text-brand font-semibold hover:text-brandDark py-2">
          See all {filtered.length} organizations →
        </button>
      )}
    </SectionShell>
  )
}

export function OrgRow({ org, compact, onSelectOrg }) {
  const count = org.count

  return (
    <button
      onClick={() => onSelectOrg?.(org.key)}
      className="w-full text-left p-4 lg:p-5 hover:bg-canvas transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-ink text-base leading-snug group-hover:text-brand">
            {org.name}
          </h3>

          <div className="mt-1 text-xs text-muted">
            <span className="font-semibold text-ink">{count}</span>{' '}
            way{count === 1 ? '' : 's'} to help
            {org.cities.length > 0 && <> · {org.cities.slice(0, 3).join(', ')}</>}
          </div>

          {!compact && org.causes.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {org.causes.slice(0, 4).map(t => (
                <TagChip key={t} id={t} />
              ))}
            </div>
          )}
        </div>

        <span className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-brand bg-brandSoft/60">
          View {count}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" className="w-3.5 h-3.5">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </button>
  )
}

