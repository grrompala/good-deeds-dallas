// OpportunityTable — the scannable list of opportunities under the hero.
// Each row: city badge + title + org + cause tags + when + apply link.
// Filter bar above: city, cause, virtual toggle, sort.
//
// To change the row layout, edit <Row /> at the bottom.

import { useMemo, useState } from 'react'
import CityBadge, { detectCity } from './CityBadge'

const SORT_OPTIONS = [
  { id: 'recent', label: 'Recently added' },
  { id: 'title',  label: 'A → Z' },
  { id: 'needed', label: 'Most needed' },
]

// Anything containing these keywords as a "city" is junk metadata, not a location.
const BAD_CITY = /^(confidential|virtual|n\/?a|none|tbd|various|multiple|online|remote)$/i

function cleanCity(raw) {
  if (!raw || typeof raw !== 'string') return null
  const c = raw.trim()
  if (!c) return null
  if (BAD_CITY.test(c)) return null
  // Strip trailing state abbreviations like ", TX" — we display it separately
  return c.replace(/,?\s*(TX|Texas)$/i, '').trim() || null
}

export default function OpportunityTable({ opportunities }) {
  const [city,    setCity]    = useState('all')
  const [cause,   setCause]   = useState('all')
  const [virtual, setVirtual] = useState(false)
  const [sort,    setSort]    = useState('recent')

  // ── Derive city + cause filter options ────────────────────────────────────
  const cityOptions = useMemo(() => {
    const counts = { richardson: 0, garland: 0, dallas: 0, other: 0 }
    opportunities.forEach(o => {
      const match = detectCity(cleanCity(o.address?.city))
      if (match)      counts[match.name.toLowerCase()]++
      else            counts.other++
    })
    return [
      { id: 'all',        label: 'All cities',  count: opportunities.length },
      { id: 'dallas',     label: 'Dallas',      count: counts.dallas },
      { id: 'richardson', label: 'Richardson',  count: counts.richardson },
      { id: 'garland',    label: 'Garland',     count: counts.garland },
      { id: 'other',      label: 'Other DFW',   count: counts.other },
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
        .slice(0, 12)
        .map(([id, count]) => ({ id, label: id.replace(/_/g, ' '), count }))
    ]
  }, [opportunities])

  // ── Apply filters + sort ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = opportunities

    if (city !== 'all') {
      rows = rows.filter(o => {
        const m = detectCity(cleanCity(o.address?.city))
        if (city === 'other') return !m
        return m && m.name.toLowerCase() === city
      })
    }
    if (cause !== 'all') {
      rows = rows.filter(o => (o.cause_tags || []).some(t => t === cause))
    }
    if (virtual) {
      rows = rows.filter(o => o.is_virtual)
    }

    if (sort === 'recent') {
      rows = [...rows].sort((a, b) => (b.last_scraped || '').localeCompare(a.last_scraped || ''))
    } else if (sort === 'title') {
      rows = [...rows].sort((a, b) => (a.opportunity_title || '').localeCompare(b.opportunity_title || ''))
    } else if (sort === 'needed') {
      rows = [...rows].sort((a, b) => (b.volunteers_needed || 0) - (a.volunteers_needed || 0))
    }
    return rows
  }, [opportunities, city, cause, virtual, sort])

  return (
    <section id="opportunities" className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-10 py-10 sm:py-12 lg:py-16">

      {/* ── Heading + count ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h2 className="text-h2 font-bold text-ink">Browse opportunities</h2>
          <p className="mt-1.5 text-base text-muted">
            Filter by city, cause, or whether it's virtual.
          </p>
        </div>
        <div className="text-sm font-mono text-muted tabular-nums">
          <span className="text-ink font-bold">{filtered.length}</span> of {opportunities.length} shown
        </div>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-line rounded-2xl shadow-card p-4 sm:p-5 mb-6 space-y-4">
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

      {/* ── Results list ─────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-line rounded-2xl py-20 text-center">
          <p className="text-base text-muted">No opportunities match those filters.</p>
          <button
            onClick={() => { setCity('all'); setCause('all'); setVirtual(false) }}
            className="mt-3 text-brand font-semibold hover:text-brandDark"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="bg-white border border-line rounded-2xl shadow-card divide-y divide-lineSoft overflow-hidden">
          {filtered.map(row => <Row key={row.id} data={row} />)}
        </div>
      )}
    </section>
  )
}

function FilterRow({ label, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
      <div className="shrink-0 sm:w-16 pt-0.5 sm:pt-1.5 text-xs font-mono uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {children}
      </div>
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

function Row({ data }) {
  const {
    opportunity_title,
    org_name,
    description_short,
    cause_tags = [],
    schedule,
    address,
    volunteers_needed,
    source_url,
    is_virtual,
  } = data

  const cleanedCity = cleanCity(address?.city)

  return (
    <div className="group relative p-4 sm:p-5 lg:p-6 hover:bg-canvas transition-colors">
      {/* Mobile: city badge stacks above title. Desktop: stays inline. */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">

        {/* City badge */}
        <div className="shrink-0 sm:pt-1">
          <CityBadge city={cleanedCity} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider truncate">
            {org_name || 'Independent'}
          </div>

          <h3 className="mt-1 font-bold text-ink text-base sm:text-lg leading-snug">
            <a
              href={source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-brand transition-colors after:absolute after:inset-0"
            >
              {opportunity_title}
            </a>
          </h3>

          {description_short && (
            <p className="mt-2 text-sm sm:text-base text-inkSoft leading-relaxed line-clamp-2">
              {description_short}
            </p>
          )}

          {/* Metadata row — chips + meta */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs sm:text-sm text-muted">
            {schedule?.date && <Meta icon="calendar">{schedule.date}</Meta>}
            {schedule?.duration && <Meta icon="clock">{schedule.duration}</Meta>}
            {volunteers_needed > 0 && (
              <Meta icon="users">
                {volunteers_needed.toLocaleString()} needed
              </Meta>
            )}
            {is_virtual && (
              <span className="px-2 py-0.5 rounded-md bg-accentSoft text-accent text-xs font-semibold">
                Virtual
              </span>
            )}
            {cause_tags.slice(0, 3).map((t, i) => (
              <span key={i} className="px-2 py-0.5 rounded-md bg-brandSoft text-brand text-xs font-medium capitalize">
                {typeof t === 'string' ? t.replace(/_/g, ' ') : t}
              </span>
            ))}
          </div>
        </div>

        {/* External link arrow — hidden on mobile to save horizontal space */}
        <div className="hidden sm:block shrink-0 self-center text-subtle group-hover:text-brand transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
            <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
        {icons[icon]}
      </svg>
      {children}
    </span>
  )
}
