// ListingsPanel — the scannable list of concrete volunteer slots.
// Filters: Source + Cause + City are multi-select; the City row is collapsed
// behind a toggle and the whole filter block is hideable (hidden by default
// on phones). Results paginate via infinite scroll.
//
// Org names are clickable (open the org summary) and each card has a
// "Read more" that opens the full description in a modal — no leaving the site.

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import SourceBox, { sourceLabel, sourceInfo } from './SourceBox'
import SectionShell from './SectionShell'
import TagChip from './TagChip'
import { getTags } from './sanitizeTag'
import { CANONICAL_TAGS } from './tagMeta'
import FilterDrawer, { FilterGroup, SitePill } from './FilterDrawer'
import LocationPrompt from './LocationPrompt'
import { cleanOrgName } from './cleanText'
import { orgKey } from './orgs'
import { cityName, geoCoords, haversineMiles, cityCentroids } from '../lib/city'

// Leaflet touches `window` at import, so the map is client-only — never
// server-rendered. A lightweight placeholder holds the space while it loads.
const OpportunityMap = dynamic(() => import('./OpportunityMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-2xl border border-line bg-canvas text-sm text-muted" style={{ minHeight: '60vh' }}>
      Loading map…
    </div>
  ),
})

// Sources that feed this panel — add new ones here and they'll appear as
// filter pills automatically.
// Same biggest/most-Dallas-first ordering as the home page sources list.
const SOURCES = ['voly_dallas', 'idealist', 'dallasdoinggood', 'volunteermckinney', 'volunteergarland', 'curated']

// How many rows to reveal per "page" as the user scrolls (non-compact only).
const PAGE_SIZE = 12

// City pills: only cities with at least this many listings, capped.
const CITY_MIN_COUNT = 3
const CITY_MAX_PILLS = 18

// A listing is a dated "event" only if it's a one-time occurrence AND carries a
// real end date. one_time-without-a-date is a classifier mis-flag (common on
// sources with no schedule field) — it can't go on a calendar, so it isn't an
// event here. Kept in one place so the filter, the count, and the card agree.
function isEvent(o) {
  return o.expiry?.kind === 'one_time' && !!o.expiry?.ends_on
}

// Format a date for a card, adding the year only when it isn't the current one.
// '' on anything unparseable. `d` is a local Date.
function fmtDay(d) {
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  })
}

// Format an ISO date ('YYYY-MM-DD') as 'Jul 20'. '' on anything unparseable.
function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  if (!m) return ''
  return fmtDay(new Date(+m[1], +m[2] - 1, +m[3]))
}

// Like fmtDate but also accepts Voly's human 'Mon DD, YYYY' ('Jul 23, 2026').
// '' on anything unparseable.
function fmtLoose(v) {
  if (typeof v !== 'string' || !v) return ''
  const iso = fmtDate(v)          // ISO first (avoids Date()'s UTC parsing)
  if (iso) return iso
  const d = new Date(v)           // 'Jul 23, 2026' -> local midnight
  return isNaN(d.getTime()) ? '' : fmtDay(d)
}

// The date label for a card. Voly carries a concrete date in its own schedule,
// but only trust it for genuine one-time events: a recurring Voly opp's date is
// just a rolling next-occurrence that goes stale between weekly scrapes and
// reads as expired, so we suppress it (the recurring flag is Voly's own signal).
// Other sources have no schedule.date, so we fall back to the parsed cross-source
// expiry stamp: a one-time event shows its date, a bounded/seasonal ongoing
// program shows when it stops ('Through Jul 24'). null when there's no date.
function scheduleDateLabel(o) {
  const s = o.schedule || {}
  if (s.date && s.recurring !== true) {
    const own = fmtLoose(s.date)
    if (own) return own
  }
  const ends = o.expiry?.ends_on
  if (ends) {
    const t = fmtDate(ends)
    if (t) return o.expiry.kind === 'one_time' ? t : `Through ${t}`
  }
  return null
}

export default function ListingsPanel({ listings, compact = false, initialCauses = [], initialCities = [], initialVisible = PAGE_SIZE, onExpand, onSelectOrg, onSelectListing }) {
  // Multi-select: empty array = "All". Otherwise the listing must match ANY
  // selected site and ANY selected cause (OR within a group, AND across groups).
  // initialCauses / initialCities let the pre-filtered /volunteer routes start
  // with a filter already selected — the pills behave normally from there.
  const [sources, setSources] = useState([])
  const [causes,  setCauses]  = useState(initialCauses)
  const [cities,  setCities]  = useState(initialCities)

  // Timing filter (single-select): 'all' | 'events' (one-time, dated) | 'ongoing'
  // (standing roles). Keyed on expiry.kind, the only cross-source timing signal.
  const [when, setWhen] = useState('all')
  // Result order: 'recent' (most recently added) | 'upcoming' (soonest end date)
  // | 'nearest' (distance from `origin`; only active once an origin is set).
  const [sort, setSort] = useState('recent')

  // List vs. map view of the same filtered results.
  const [view, setView] = useState('list')
  // Distance origin: null | { lat, lng, label }. Set via the LocationPrompt
  // (browser geolocation or a city pick) — never auto-requested.
  const [origin, setOrigin] = useState(null)
  const [mapPromptDismissed, setMapPromptDismissed] = useState(false)

  const activeFilterCount = sources.length + causes.length + cities.length + (when !== 'all' ? 1 : 0)

  // Toggle a value in/out of a selection array.
  function toggle(setter, value) {
    setter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])
  }

  // Clear every filter back to "all".
  function resetFilters() {
    setSources([]); setCauses([]); setCities([]); setWhen('all')
  }

  // Jump the list back to the top whenever a filter or the sort changes, so the
  // user lands on the new top results instead of staying deep in the old list.
  // (Skips the first render so pre-filtered /volunteer routes don't auto-scroll.)
  const topRef = useRef(null)
  const filtersMounted = useRef(false)
  useEffect(() => {
    if (!filtersMounted.current) { filtersMounted.current = true; return }
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [sources, causes, cities, when, sort, origin])

  // Source filter options + counts
  const sourceOptions = useMemo(() => {
    const counts = new Map()
    listings.forEach(o => counts.set(o.source, (counts.get(o.source) || 0) + 1))
    return [
      { id: 'all', label: 'All sources', count: listings.length },
      ...SOURCES
        .filter(s => counts.has(s))
        .map(s => ({ id: s, label: sourceLabel(s) || s, count: counts.get(s) })),
    ]
  }, [listings])

  // Cause filter options. ONLY the canonical unified taxonomy (see tagMeta) —
  // raw scraped `cause_tags` (getTags' fallback) otherwise leak ~100 messy
  // labels into the facet. Sorted by frequency; the drawer has room for all.
  const causeOptions = useMemo(() => {
    const counts = new Map()
    listings.forEach(o => getTags(o).forEach(t => {
      if (CANONICAL_TAGS.has(t)) counts.set(t, (counts.get(t) || 0) + 1)
    }))
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ id, count }))
  }, [listings])

  // City filter options + counts (normalized; junk city strings never surface)
  const cityOptions = useMemo(() => {
    const counts = new Map()
    listings.forEach(o => {
      const c = cityName(o)
      if (c) counts.set(c, (counts.get(c) || 0) + 1)
    })
    return [...counts.entries()]
      .filter(([, count]) => count >= CITY_MIN_COUNT)
      .sort((a, b) => b[1] - a[1])
      .slice(0, CITY_MAX_PILLS)
      .map(([id, count]) => ({ id, count }))
  }, [listings])

  // When filter counts. "Events" = a dated single occurrence — one_time AND an
  // actual date; a one_time with no date is a mis-flag, not something we can
  // put on a calendar, so it stays out of Events (and only shows under All).
  const whenOptions = useMemo(() => {
    let events = 0, ongoing = 0
    listings.forEach(o => {
      if (isEvent(o)) events++
      else if (o.expiry?.kind === 'ongoing') ongoing++
    })
    return { all: listings.length, events, ongoing }
  }, [listings])

  // Cities that have coordinates, for the "near which city?" picker. Built from
  // the listings' own geo (see cityCentroids) so no gazetteer ships to the client.
  const originCities = useMemo(() => {
    return [...cityCentroids(listings).entries()]
      .map(([name, v]) => ({ name, lat: v.lat, lng: v.lng, count: v.count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [listings])

  const filtered = useMemo(() => {
    let rows = listings
    if (sources.length) rows = rows.filter(o => sources.includes(o.source))
    if (causes.length)  rows = rows.filter(o => getTags(o).some(t => causes.includes(t)))
    if (cities.length)  rows = rows.filter(o => cities.includes(cityName(o)))
    if (when === 'events')  rows = rows.filter(isEvent)
    else if (when === 'ongoing') rows = rows.filter(o => o.expiry?.kind === 'ongoing')
    // Order: 'nearest' = closest to origin first, un-located listings last (only
    // when an origin is set, else falls through to 'recent'); 'upcoming' =
    // soonest end date first; 'recent' = most recently added first.
    if (sort === 'nearest' && origin) {
      const dist = o => {
        const c = geoCoords(o)
        return c ? haversineMiles(origin, c) : Infinity
      }
      return [...rows].sort((a, b) => dist(a) - dist(b))
    }
    return [...rows].sort((a, b) =>
      sort === 'upcoming'
        ? (a.expiry?.ends_on || '9999').localeCompare(b.expiry?.ends_on || '9999')
        : (b.last_scraped || '').localeCompare(a.last_scraped || '')
    )
  }, [listings, sources, causes, cities, when, sort, origin])

  // How many of the current results actually have a map location (the rest
  // aren't drawn on the map / sink to the bottom of a distance sort).
  const locatedCount = useMemo(() => filtered.filter(o => geoCoords(o)).length, [filtered])

  // ── Infinite scroll (non-compact) ─────────────────────────────────────────
  // Reveal rows a page at a time; a sentinel near the bottom loads more as
  // it scrolls into view — the pattern common on mobile feeds. The
  // pre-filtered /volunteer routes pass a larger initialVisible so their
  // server-rendered HTML contains the listings (crawlers can't scroll).
  const [visibleCount, setVisibleCount] = useState(initialVisible)
  const sentinelRef = useRef(null)

  // Reset the window whenever the result set changes (filters/sort).
  useEffect(() => { setVisibleCount(initialVisible) }, [sources, causes, cities, when, sort, origin, listings, initialVisible])

  useEffect(() => {
    if (compact) return
    const node = sentinelRef.current
    if (!node) return
    const io = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setVisibleCount(c => Math.min(c + PAGE_SIZE, filtered.length))
        }
      },
      { rootMargin: '400px' }   // start loading before it's fully in view
    )
    io.observe(node)
    return () => io.disconnect()
  }, [compact, filtered.length])

  const visible = compact ? filtered.slice(0, 8) : filtered.slice(0, visibleCount)
  const hasMore = !compact && visibleCount < filtered.length

  return (
    <SectionShell
      title="Opportunities"
      subtitle={!compact && 'Volunteer opportunities from across the Dallas metro.'}
      count={`${filtered.length} of ${listings.length}`}
      compact={compact}
      onExpand={onExpand}
    >
      {/* Scroll anchor for the auto-scroll-to-top on filter/sort change. */}
      <div ref={topRef} aria-hidden className="h-0" style={{ scrollMarginTop: 'var(--app-header-h, 96px)' }} />

      {!compact && (
        <FilterDrawer
          activeCount={activeFilterCount}
          resultCount={filtered.length}
          resultNoun="result"
          onReset={resetFilters}
          toolbarRight={
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex rounded-full border border-line bg-white p-0.5">
                {[['list', 'List'], ['map', 'Map']].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setView(id)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                      view === id ? 'bg-brand text-white' : 'text-inkSoft hover:text-brand'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="inline-flex rounded-full border border-line bg-white p-0.5">
                {[['recent', 'Recent'], ['upcoming', 'Upcoming'], ['nearest', 'Nearest']].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setSort(id)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                      sort === id ? 'bg-brand text-white' : 'text-inkSoft hover:text-brand'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          <FilterGroup label="Source">
            <SitePill active={sources.length === 0} count={sourceOptions[0]?.count} onClick={() => setSources([])}>
              All sources
            </SitePill>
            {sourceOptions.slice(1).map(o => (
              <SitePill
                key={o.id}
                active={sources.includes(o.id)}
                count={o.count}
                title={sourceInfo(o.id)?.summary}
                onClick={() => toggle(setSources, o.id)}
              >
                {o.label}
              </SitePill>
            ))}
          </FilterGroup>

          <FilterGroup label="Type">
            <SitePill active={when === 'all'} count={whenOptions.all} onClick={() => setWhen('all')}>Any</SitePill>
            <SitePill active={when === 'events'} count={whenOptions.events} onClick={() => setWhen('events')}>Event</SitePill>
            <SitePill active={when === 'ongoing'} count={whenOptions.ongoing} onClick={() => setWhen('ongoing')}>Ongoing</SitePill>
          </FilterGroup>

          <FilterGroup label="Cause">
            <SitePill active={causes.length === 0} count={listings.length} onClick={() => setCauses([])}>
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

      {/* Soft location prompt: shown when sorting by distance, or atop the map
          (until dismissed). Never auto-requests geolocation — the user opts in. */}
      {!compact && (sort === 'nearest' || (view === 'map' && !mapPromptDismissed)) && (
        <div className="mb-3">
          <LocationPrompt
            cities={originCities}
            origin={origin}
            onSetOrigin={setOrigin}
            onDismiss={view === 'map' && sort !== 'nearest' ? () => setMapPromptDismissed(true) : undefined}
          />
        </div>
      )}

      {view === 'map' && !compact ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-2xl border border-line shadow-card">
            <OpportunityMap
              listings={filtered}
              origin={origin}
              onSelectListing={onSelectListing}
            />
          </div>
          <p className="text-xs text-muted">
            Showing {locatedCount.toLocaleString()} of {filtered.length.toLocaleString()} on the map ·
            locations are approximate (city-level)
            {filtered.length - locatedCount > 0 &&
              ` · ${(filtered.length - locatedCount).toLocaleString()} without a mapped location aren’t shown`}.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white border border-line rounded-2xl py-12 text-center">
          <p className="text-sm text-muted">No matches.</p>
          <button
            onClick={resetFilters}
            className="mt-2 text-brand text-sm font-semibold hover:text-brandDark"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white border border-line rounded-2xl shadow-card divide-y divide-lineSoft overflow-hidden">
            {visible.map(row => (
              <ListingRow
                key={row.id}
                data={row}
                compact={compact}
                onSelectOrg={onSelectOrg}
                onSelectListing={onSelectListing}
              />
            ))}
          </div>

          {/* Infinite-scroll sentinel + loading hint (non-compact only) */}
          {hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
              <span className="inline-block h-4 w-4 rounded-full border-2 border-line border-t-brand animate-spin" aria-hidden />
              Loading more…
            </div>
          )}
        </>
      )}

      {compact && filtered.length > 8 && (
        <button onClick={onExpand} className="mt-4 w-full text-center text-sm text-brand font-semibold hover:text-brandDark py-2">
          See all {filtered.length} opportunities →
        </button>
      )}
    </SectionShell>
  )
}

export function ListingRow({ data, compact, onSelectOrg, onSelectListing }) {
  const {
    opportunity_title, org_name, description_short, description_long,
    address, volunteers_needed, source_url, is_virtual, source,
  } = data

  // Visible city label (was a hover-only pin). McKinney's city field is too
  // noisy to trust, so it stays suppressed for that source.
  const city      = source !== 'volunteermckinney' ? cityName(data) : null
  const dateLabel = scheduleDateLabel(data)
  // Only canonical taxonomy tags are UI-facing labels (raw scraped cause_tags
  // like "In-Kind"/"Skilled Labor" are not shown as chips).
  const cleanTags = getTags(data).filter(t => CANONICAL_TAGS.has(t))
  const orgLabel  = cleanOrgName(org_name)
  const orgK      = orgKey(org_name)

  // The 2-line teaser; "Read more" opens the full text in a modal.
  const desc    = description_short || description_long || ''
  const hasMore = !!desc && (
    (description_long && description_long.length > (description_short || '').length + 10) ||
    desc.length > 140
  )

  return (
    <div className="group relative p-4 lg:p-5 hover:bg-canvas transition-colors">
      <div className="flex items-start gap-4">
        <SourceBox source={source} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {orgLabel && onSelectOrg && orgK ? (
              <button
                onClick={() => onSelectOrg(orgK)}
                className="relative z-10 text-xs font-semibold text-muted hover:text-brand uppercase tracking-wider truncate max-w-full transition-colors"
                title={`See all listings from ${orgLabel}`}
              >
                {orgLabel}
              </button>
            ) : (
              <span className="text-xs font-semibold text-muted uppercase tracking-wider truncate">
                {orgLabel || 'Independent'}
              </span>
            )}
            {city && (
              <span className="inline-flex items-center gap-1 text-xs text-muted whitespace-nowrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <path d="M12 22s8-7.5 8-13a8 8 0 1 0-16 0c0 5.5 8 13 8 13z" />
                  <circle cx="12" cy="9" r="3" />
                </svg>
                {city}
              </span>
            )}
          </div>

          <h3 className="mt-0.5 font-bold text-ink text-base leading-snug">
            <a
              href={source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-brand transition-colors after:absolute after:inset-0"
            >
              {opportunity_title}
            </a>
          </h3>

          {!compact && desc && (
            <p className="mt-1.5 text-sm text-inkSoft leading-relaxed line-clamp-2">
              {desc}
            </p>
          )}
          {!compact && hasMore && onSelectListing && (
            <button
              onClick={() => onSelectListing(data)}
              className="relative z-10 mt-1 text-xs font-semibold text-brand hover:text-brandDark"
            >
              Read more
            </button>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
            {dateLabel && <Meta icon="calendar">{dateLabel}</Meta>}
            {volunteers_needed > 0 && <Meta icon="users">{volunteers_needed.toLocaleString()} needed</Meta>}
            {is_virtual && (
              <span className="px-2 py-0.5 rounded-md bg-accentSoft text-accent text-xs font-semibold">Virtual</span>
            )}
            {!compact && cleanTags.slice(0, 3).map((t, i) => (
              <TagChip key={i} id={t} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Meta({ icon, children }) {
  const icons = {
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round"/></>,
    users:    <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">{icons[icon]}</svg>
      {children}
    </span>
  )
}
