// ListingsPanel — the scannable list of concrete volunteer slots.
// Filters: Source (which scraper site) + Cause (colorful tag pills) + sort.
// City is shown as a hover-only map pin (parsing is unreliable for filtering).

import { useMemo, useState } from 'react'
import CityBadge from './CityBadge'
import SourceBox, { sourceLabel, sourceInfo } from './SourceBox'
import SectionShell from './SectionShell'
import TagChip from './TagChip'
import { getTags } from './sanitizeTag'
import { cleanOrgName } from './cleanText'

const SORT_OPTIONS = [
  { id: 'recent', label: 'Recently added' },
  { id: 'date',   label: 'Date (soonest)' },
  { id: 'title',  label: 'A → Z' },
  { id: 'needed', label: 'Most needed' },
]

// Sources that feed this panel — add new ones here and they'll appear as
// filter pills automatically.
const SOURCES = ['volunteergarland', 'volunteermckinney', 'voly_dallas', 'idealist']

function parseDate(str) {
  if (!str) return null
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

export default function ListingsPanel({ listings, compact = false, onExpand }) {
  const [source, setSource] = useState('all')
  const [cause,  setCause]  = useState('all')
  const [sort,   setSort]   = useState('recent')

  // Source filter options + counts
  const sourceOptions = useMemo(() => {
    const counts = new Map()
    listings.forEach(o => counts.set(o.source, (counts.get(o.source) || 0) + 1))
    return [
      { id: 'all', label: 'All sites', count: listings.length },
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

  const filtered = useMemo(() => {
    let rows = listings
    if (source !== 'all') rows = rows.filter(o => o.source === source)
    if (cause  !== 'all') rows = rows.filter(o => getTags(o).includes(cause))

    if (sort === 'recent') {
      rows = [...rows].sort((a, b) => (b.last_scraped || '').localeCompare(a.last_scraped || ''))
    } else if (sort === 'date') {
      rows = [...rows].sort((a, b) => {
        const da = parseDate(a.schedule?.date)
        const db = parseDate(b.schedule?.date)
        if (!da && !db) return 0
        if (!da) return 1
        if (!db) return -1
        return da - db
      })
    } else if (sort === 'title') {
      rows = [...rows].sort((a, b) => (a.opportunity_title || '').localeCompare(b.opportunity_title || ''))
    } else if (sort === 'needed') {
      rows = [...rows].sort((a, b) => (b.volunteers_needed || 0) - (a.volunteers_needed || 0))
    }
    return rows
  }, [listings, source, cause, sort])

  const visible = compact ? filtered.slice(0, 8) : filtered

  return (
    <SectionShell
      title="Listings"
      subtitle={!compact && <SourcesBlurb />}
      count={`${filtered.length} of ${listings.length}`}
      compact={compact}
      onExpand={onExpand}
    >
      {!compact && (
        <div className="bg-white border border-line rounded-2xl shadow-card p-4 sm:p-5 mb-5 space-y-4">
          <FilterRow label="Site">
            {sourceOptions.map(o => (
              <SitePill key={o.id} active={source === o.id} count={o.count} onClick={() => setSource(o.id)}>
                {o.label}
              </SitePill>
            ))}
          </FilterRow>

          <FilterRow label="Cause">
            <SitePill active={cause === 'all'} count={causeOptions[0]?.count} onClick={() => setCause('all')}>
              All causes
            </SitePill>
            {causeOptions.slice(1).map(o => (
              <TagChip
                key={o.id}
                id={o.id}
                count={o.count}
                active={cause === o.id}
                onClick={() => setCause(o.id)}
                variant="filter"
              />
            ))}
          </FilterRow>

          <div className="flex items-center justify-end gap-2 text-sm pt-1">
            <span className="text-muted">Sort</span>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="px-3 py-1.5 rounded-md border border-line bg-white text-inkSoft focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              {SORT_OPTIONS.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="bg-white border border-line rounded-2xl py-12 text-center">
          <p className="text-sm text-muted">No matches.</p>
          <button
            onClick={() => { setSource('all'); setCause('all') }}
            className="mt-2 text-brand text-sm font-semibold hover:text-brandDark"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="bg-white border border-line rounded-2xl shadow-card divide-y divide-lineSoft overflow-hidden">
          {visible.map(row => <Row key={row.id} data={row} compact={compact} />)}
        </div>
      )}

      {compact && filtered.length > 8 && (
        <button onClick={onExpand} className="mt-4 w-full text-center text-sm text-brand font-semibold hover:text-brandDark py-2">
          See all {filtered.length} listings →
        </button>
      )}
    </SectionShell>
  )
}

// ── Subtitle block: explains each currently-supported source ────────────────
function SourcesBlurb() {
  return (
    <div className="mt-2">
      <p className="text-sm sm:text-base text-muted mb-3">
        Listings are pulled from these volunteer sites:
      </p>
      <ul className="space-y-2">
        {SOURCES.map(s => {
          const info = sourceInfo(s)
          if (!info) return null
          return (
            <li key={s} className="flex items-start gap-2.5 text-sm leading-relaxed">
              <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${info.dot}`} aria-hidden />
              <span>
                <a
                  href={info.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-ink hover:text-brand transition-colors"
                >
                  {info.fullName}
                </a>
                <span className="text-muted font-mono text-xs ml-1.5">({info.domain})</span>
                <span className="block sm:inline sm:ml-2 text-inkSoft">— {info.summary}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
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
function SitePill({ children, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
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

function Row({ data, compact }) {
  const {
    opportunity_title, org_name, description_short,
    schedule, address, volunteers_needed, source_url, is_virtual, source,
    published,
  } = data

  const showPin   = source !== 'volunteermckinney'
  const cleanTags = getTags(data)

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
            <span className="text-xs font-semibold text-muted uppercase tracking-wider truncate">
              {cleanOrgName(org_name) || 'Independent'}
            </span>
            {showPin && <CityBadge city={address?.city} />}
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
          {!compact && description_short && (
            <p className="mt-1.5 text-sm text-inkSoft leading-relaxed line-clamp-2">
              {description_short}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
            {schedule?.date     && <Meta icon="calendar">{schedule.date}</Meta>}
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
