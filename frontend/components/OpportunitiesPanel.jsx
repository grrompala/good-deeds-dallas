// OpportunitiesPanel — the opportunity list.
// `compact` mode (used in the 3-column "Everything" view) hides filters and
// limits to the first 8 rows. Full mode shows all filters and the full list.

import { useMemo, useState } from 'react'
import CityBadge, { cleanCity, cityKey } from './CityBadge'
import SourceBadge from './SourceBadge'
import SectionShell from './SectionShell'

const SORT_OPTIONS = [
  { id: 'recent',  label: 'Recently added' },
  { id: 'date',    label: 'Date (soonest)' },
  { id: 'title',   label: 'A → Z' },
  { id: 'needed',  label: 'Most needed' },
]

const DATE_RANGES = [
  { id: 'all',     label: 'Any time' },
  { id: 'week',    label: 'This week' },
  { id: 'month',   label: 'This month' },
  { id: 'dated',   label: 'Dated only' },
]

// Parse a free-form date string like "May 24, 2026" into a Date, or null.
function parseDate(str) {
  if (!str) return null
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

function withinRange(opp, range) {
  const d = parseDate(opp.schedule?.date)
  if (range === 'dated') return d !== null
  if (range === 'all')   return true
  if (!d) return false
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const dayMs  = 1000 * 60 * 60 * 24
  if (range === 'week')  return diffMs >= -dayMs && diffMs <= 7 * dayMs
  if (range === 'month') return diffMs >= -dayMs && diffMs <= 31 * dayMs
  return true
}

export default function OpportunitiesPanel({ opportunities, compact = false, onExpand }) {
  const [city,    setCity]    = useState('all')
  const [cause,   setCause]   = useState('all')
  const [virtual, setVirtual] = useState(false)
  const [range,   setRange]   = useState('all')
  const [sort,    setSort]    = useState('recent')

  // City options come from real city names in the data, sorted by frequency.
  const cityOptions = useMemo(() => {
    const counts = new Map()
    opportunities.forEach(o => {
      const k = cityKey(o.address?.city)
      if (k) counts.set(k, (counts.get(k) || 0) + 1)
    })
    return [
      { id: 'all', label: 'All cities', count: opportunities.length },
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, c]) => ({
          id: k,
          label: k.charAt(0).toUpperCase() + k.slice(1),
          count: c
        }))
    ]
  }, [opportunities])

  const causeOptions = useMemo(() => {
    const counts = new Map()
    opportunities.forEach(o => (o.cause_tags || []).forEach(t => {
      if (typeof t === 'string') counts.set(t, (counts.get(t) || 0) + 1)
    }))
    return [
      { id: 'all', label: 'All causes', count: opportunities.length },
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, compact ? 6 : 12)
        .map(([id, count]) => ({ id, label: id.replace(/_/g, ' '), count }))
    ]
  }, [opportunities, compact])

  const filtered = useMemo(() => {
    let rows = opportunities
    if (city !== 'all') {
      rows = rows.filter(o => cityKey(o.address?.city) === city)
    }
    if (cause !== 'all') {
      rows = rows.filter(o => (o.cause_tags || []).some(t => t === cause))
    }
    if (virtual) {
      rows = rows.filter(o => o.is_virtual)
    }
    if (range !== 'all') {
      rows = rows.filter(o => withinRange(o, range))
    }
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
  }, [opportunities, city, cause, virtual, range, sort])

  const visible = compact ? filtered.slice(0, 8) : filtered

  return (
    <SectionShell
      title="Opportunities"
      subtitle="Volunteer gigs from Garland, Voly, and curated DFW nonprofits."
      count={`${filtered.length} of ${opportunities.length}`}
      compact={compact}
      onExpand={onExpand}
    >
      {/* Filters — hidden in compact mode */}
      {!compact && (
        <div className="bg-white border border-line rounded-2xl shadow-card p-4 sm:p-5 mb-5 space-y-4">
          <FilterRow label="City">
            {cityOptions.map(o => (
              <Pill key={o.id} active={city === o.id} count={o.count} onClick={() => setCity(o.id)}>
                {o.label}
              </Pill>
            ))}
          </FilterRow>
          <FilterRow label="Cause">
            {causeOptions.map(o => (
              <Pill key={o.id} active={cause === o.id} count={o.count} onClick={() => setCause(o.id)}>
                {o.label}
              </Pill>
            ))}
          </FilterRow>
          <FilterRow label="When">
            {DATE_RANGES.map(o => (
              <Pill key={o.id} active={range === o.id} onClick={() => setRange(o.id)}>
                {o.label}
              </Pill>
            ))}
          </FilterRow>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-sm text-inkSoft cursor-pointer select-none">
              <input
                type="checkbox"
                checked={virtual}
                onChange={e => setVirtual(e.target.checked)}
                className="h-4 w-4 rounded border-line text-brand focus:ring-brand/30"
              />
              Virtual only
            </label>
            <div className="flex items-center gap-2 text-sm">
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
        </div>
      )}

      {/* Results */}
      {visible.length === 0 ? (
        <EmptyState onReset={() => { setCity('all'); setCause('all'); setVirtual(false); setRange('all') }} />
      ) : (
        <div className="bg-white border border-line rounded-2xl shadow-card divide-y divide-lineSoft overflow-hidden">
          {visible.map(row => <Row key={row.id} data={row} compact={compact} />)}
        </div>
      )}

      {compact && filtered.length > 8 && (
        <SeeMoreFooter total={filtered.length} onExpand={onExpand} />
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

function Pill({ children, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
        border transition-colors
        ${active
          ? 'bg-brand text-white border-brand'
          : 'bg-white text-inkSoft border-line hover:border-brand/40 hover:text-brand'
        }
      `}
    >
      <span className="capitalize">{children}</span>
      {count !== undefined && (
        <span className={`font-mono text-xs ${active ? 'text-white/80' : 'text-subtle'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

function Row({ data, compact }) {
  const {
    opportunity_title, org_name, description_short, cause_tags = [],
    schedule, address, volunteers_needed, source_url, is_virtual, source,
  } = data

  return (
    <div className="group relative p-4 lg:p-5 hover:bg-canvas transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
        <div className="shrink-0 sm:pt-0.5 flex flex-wrap items-center gap-2">
          <CityBadge city={address?.city} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider truncate max-w-full">
              {org_name || 'Independent'}
            </span>
            <SourceBadge source={source} />
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
            {schedule?.date    && <Meta icon="calendar">{schedule.date}</Meta>}
            {schedule?.duration && <Meta icon="clock">{schedule.duration}</Meta>}
            {volunteers_needed > 0 && <Meta icon="users">{volunteers_needed.toLocaleString()} needed</Meta>}
            {is_virtual && (
              <span className="px-2 py-0.5 rounded-md bg-accentSoft text-accent text-xs font-semibold">Virtual</span>
            )}
            {!compact && cause_tags.slice(0, 3).map((t, i) => (
              <span key={i} className="px-2 py-0.5 rounded-md bg-brandSoft text-brand text-xs font-medium capitalize">
                {typeof t === 'string' ? t.replace(/_/g, ' ') : t}
              </span>
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
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">{icons[icon]}</svg>
      {children}
    </span>
  )
}

function EmptyState({ onReset }) {
  return (
    <div className="bg-white border border-line rounded-2xl py-12 text-center">
      <p className="text-sm text-muted">No matches.</p>
      <button onClick={onReset} className="mt-2 text-brand text-sm font-semibold hover:text-brandDark">
        Reset filters
      </button>
    </div>
  )
}

function SeeMoreFooter({ total, onExpand }) {
  return (
    <button
      onClick={onExpand}
      className="mt-4 w-full text-center text-sm text-brand font-semibold hover:text-brandDark py-2"
    >
      See all {total} opportunities →
    </button>
  )
}
