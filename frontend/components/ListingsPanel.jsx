// ListingsPanel — the scannable list of concrete volunteer slots.
// Filters: Source + Cause + City are multi-select; the City row is collapsed
// behind a toggle and the whole filter block is hideable (hidden by default
// on phones). Results paginate via infinite scroll.
//
// Org names are clickable (open the org summary) and each card has a
// "Read more" that opens the full description in a modal — no leaving the site.

import { useEffect, useMemo, useRef, useState } from 'react'
import SourceBox, { sourceLabel, sourceInfo } from './SourceBox'
import SectionShell from './SectionShell'
import TagChip from './TagChip'
import { getTags } from './sanitizeTag'
import { cleanOrgName } from './cleanText'
import { orgKey } from './orgs'
import { cityName } from '../lib/city'

// Sources that feed this panel — add new ones here and they'll appear as
// filter pills automatically.
// Same biggest/most-Dallas-first ordering as the home page sources list.
const SOURCES = ['voly_dallas', 'idealist', 'volunteermckinney', 'volunteergarland', 'curated']

// How many rows to reveal per "page" as the user scrolls (non-compact only).
const PAGE_SIZE = 12

// City pills: only cities with at least this many listings, capped.
const CITY_MIN_COUNT = 3
const CITY_MAX_PILLS = 18

export default function ListingsPanel({ listings, compact = false, initialCauses = [], initialCities = [], initialVisible = PAGE_SIZE, onExpand, onSelectOrg, onSelectListing }) {
  // Multi-select: empty array = "All". Otherwise the listing must match ANY
  // selected site and ANY selected cause (OR within a group, AND across groups).
  // initialCauses / initialCities let the pre-filtered /volunteer routes start
  // with a filter already selected — the pills behave normally from there.
  const [sources, setSources] = useState([])
  const [causes,  setCauses]  = useState(initialCauses)
  const [cities,  setCities]  = useState(initialCities)

  // The City pill row stays collapsed until asked for (screen-space thrift);
  // starts open when a city filter arrives pre-applied.
  const [cityRowOpen, setCityRowOpen] = useState(initialCities.length > 0)

  // Whole-block visibility. null = "auto" (CSS shows it sm+ and hides it on
  // phones, keeping server and client HTML identical); resolved to a real
  // boolean from viewport width after mount, then the toggle owns it.
  const [filtersOpen, setFiltersOpen] = useState(null)
  useEffect(() => {
    setFiltersOpen(window.matchMedia('(min-width: 640px)').matches)
  }, [])
  const filtersVisibleClass =
    filtersOpen === null ? 'hidden sm:block' : filtersOpen ? 'block' : 'hidden'
  const activeFilterCount = sources.length + causes.length + cities.length

  // Toggle a value in/out of a selection array.
  function toggle(setter, value) {
    setter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])
  }

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

  // Cause filter options (unified tags only — these come from classify_listings.py)
  const causeOptions = useMemo(() => {
    const counts = new Map()
    listings.forEach(o => getTags(o).forEach(t => {
      counts.set(t, (counts.get(t) || 0) + 1)
    }))
    return [
      { id: 'all', label: 'All causes', count: listings.length },
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, compact ? 6 : 14)
        .map(([id, count]) => ({ id, count })),
    ]
  }, [listings, compact])

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

  const filtered = useMemo(() => {
    let rows = listings
    if (sources.length) rows = rows.filter(o => sources.includes(o.source))
    if (causes.length)  rows = rows.filter(o => getTags(o).some(t => causes.includes(t)))
    if (cities.length)  rows = rows.filter(o => cities.includes(cityName(o)))
    // Fixed order: most recently added first.
    return [...rows].sort((a, b) => (b.last_scraped || '').localeCompare(a.last_scraped || ''))
  }, [listings, sources, causes, cities])

  // ── Infinite scroll (non-compact) ─────────────────────────────────────────
  // Reveal rows a page at a time; a sentinel near the bottom loads more as
  // it scrolls into view — the pattern common on mobile feeds. The
  // pre-filtered /volunteer routes pass a larger initialVisible so their
  // server-rendered HTML contains the listings (crawlers can't scroll).
  const [visibleCount, setVisibleCount] = useState(initialVisible)
  const sentinelRef = useRef(null)

  // Reset the window whenever the result set changes (filters/sort).
  useEffect(() => { setVisibleCount(initialVisible) }, [sources, causes, cities, listings, initialVisible])

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
      {!compact && (
        <>
          {/* Filters toggle — the only always-visible filter UI on phones */}
          <button
            onClick={() => setFiltersOpen(prev => (prev === null ? !window.matchMedia('(min-width: 640px)').matches : !prev))}
            className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-sm font-medium text-inkSoft hover:border-brand/40 hover:text-brand transition-colors"
            aria-expanded={filtersOpen !== false}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M3 5h18M6 12h12M10 19h4" strokeLinecap="round" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="font-mono text-xs text-brand">{activeFilterCount}</span>
            )}
          </button>

          <div className={`${filtersVisibleClass} bg-white border border-line rounded-2xl shadow-card p-4 sm:p-5 mb-5 space-y-4`}>
            <FilterRow label="Source">
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
            </FilterRow>

            <FilterRow label="Cause">
              <SitePill active={causes.length === 0} count={causeOptions[0]?.count} onClick={() => setCauses([])}>
                All causes
              </SitePill>
              {causeOptions.slice(1).map(o => (
                <TagChip
                  key={o.id}
                  id={o.id}
                  count={o.count}
                  active={causes.includes(o.id)}
                  onClick={() => toggle(setCauses, o.id)}
                  variant="filter"
                />
              ))}
            </FilterRow>

            {/* City row — collapsed by default to keep the block lean */}
            <FilterRow label="City">
              {cityRowOpen || cities.length > 0 ? (
                <>
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
                  <button
                    onClick={() => { setCityRowOpen(false); setCities([]) }}
                    className="px-2 py-1.5 text-xs text-muted hover:text-ink transition-colors"
                    aria-label="Collapse city filters"
                  >
                    hide ▲
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setCityRowOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-dashed border-line bg-white text-muted hover:border-brand/40 hover:text-brand transition-colors"
                >
                  Filter by city ▾
                </button>
              )}
            </FilterRow>
          </div>
        </>
      )}

      {visible.length === 0 ? (
        <div className="bg-white border border-line rounded-2xl py-12 text-center">
          <p className="text-sm text-muted">No matches.</p>
          <button
            onClick={() => { setSources([]); setCauses([]); setCities([]) }}
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

function FilterRow({ label, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
      <div className="shrink-0 sm:w-16 pt-0.5 sm:pt-1.5 text-xs font-mono uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

// Plain "site" pill (no icon) — used for Source and "All" buttons
function SitePill({ children, count, active, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
        border transition-colors whitespace-nowrap
        ${active
          ? 'bg-brand text-white border-brand'
          : 'bg-white text-inkSoft border-line hover:border-brand/40 hover:text-brand'
        }
      `}
    >
      {children}
      {count !== undefined && (
        <span className={`font-mono text-xs ${active ? 'text-white/75' : 'text-subtle'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

export function ListingRow({ data, compact, onSelectOrg, onSelectListing }) {
  const {
    opportunity_title, org_name, description_short, description_long,
    schedule, address, volunteers_needed, source_url, is_virtual, source,
    published,
  } = data

  // Visible city label (was a hover-only pin). McKinney's city field is too
  // noisy to trust, so it stays suppressed for that source.
  const city      = source !== 'volunteermckinney' ? cityName(data) : null
  const cleanTags = getTags(data)
  const orgLabel  = cleanOrgName(org_name)
  const orgK      = orgKey(org_name)

  // The 2-line teaser; "Read more" opens the full text in a modal.
  const desc    = description_short || description_long || ''
  const hasMore = !!desc && (
    (description_long && description_long.length > (description_short || '').length + 10) ||
    desc.length > 140
  )

  // Pretty "Posted Mar 14" style for the published date
  const postedLabel = published
    ? new Date(published).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

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
            {schedule?.date && !schedule?.recurring && <Meta icon="calendar">{schedule.date}</Meta>}
            {postedLabel        && <Meta icon="posted">Posted {postedLabel}</Meta>}
            {schedule?.duration && <Meta icon="clock">{schedule.duration}</Meta>}
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
    clock:    <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" strokeLinecap="round"/></>,
    users:    <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    posted:   <><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/></>,
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">{icons[icon]}</svg>
      {children}
    </span>
  )
}
