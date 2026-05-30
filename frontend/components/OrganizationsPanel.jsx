// OrganizationsPanel — directory of curated nonprofits.
// Only sources from `orgs.json` (LLM-curated) live here. Listings from
// Garland/McKinney/Voly belong exclusively in the Listings panel.

import { useMemo, useState } from 'react'
import SectionShell from './SectionShell'
import { getTags } from './sanitizeTag'
import { cleanOrgName } from './cleanText'
import TagChip from './TagChip'

export default function OrganizationsPanel({ curated, compact = false, searchActive = false, onExpand }) {
  const [cause, setCause] = useState('all')
  const [userOpened, setUserOpened] = useState(new Set())
  const [userClosed, setUserClosed] = useState(new Set())

  // ── Aggregate curated entries by org_name ────────────────────────────────
  const orgs = useMemo(() => {
    const byName = new Map()
    curated.forEach(o => {
      const name = cleanOrgName(o.org_name)
      if (!name) return
      if (!byName.has(name)) {
        byName.set(name, {
          name,
          entries: [],
          causes:  new Map(),
          urls:    new Set(),
        })
      }
      const e = byName.get(name)
      e.entries.push(o)
      getTags(o).forEach(t => e.causes.set(t, (e.causes.get(t) || 0) + 1))
      if (o.org_url)         e.urls.add(o.org_url)
      else if (o.source_url) e.urls.add(o.source_url)
    })
    return [...byName.values()].map(o => ({
      ...o,
      causes: [...o.causes.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t),
      url:    [...o.urls][0] || null,
    }))
  }, [curated])

  const causeOptions = useMemo(() => {
    const counts = new Map()
    orgs.forEach(o => o.causes.forEach(t => counts.set(t, (counts.get(t) || 0) + 1)))
    return [
      { id: 'all', label: 'All causes', count: orgs.length },
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, compact ? 6 : 12)
        .map(([id, count]) => ({ id, label: id.replace(/_/g, ' '), count }))
    ]
  }, [orgs, compact])

  const filtered = useMemo(() => {
    let rows = orgs
    if (cause !== 'all') {
      rows = rows.filter(o => o.causes.includes(cause))
    }
    return rows.sort((a, b) => b.entries.length - a.entries.length || a.name.localeCompare(b.name))
  }, [orgs, cause])

  const visible = compact ? filtered.slice(0, 8) : filtered

  const defaultOpen = searchActive
  const isOpen = name => userOpened.has(name) ? true : userClosed.has(name) ? false : defaultOpen
  function toggle(name) {
    if (isOpen(name)) {
      setUserOpened(s => { const n = new Set(s); n.delete(name); return n })
      setUserClosed(s => new Set(s).add(name))
    } else {
      setUserClosed(s => { const n = new Set(s); n.delete(name); return n })
      setUserOpened(s => new Set(s).add(name))
    }
  }
  function expandAll()   { setUserClosed(new Set()); setUserOpened(new Set(visible.map(o => o.name))) }
  function collapseAll() { setUserOpened(new Set()); setUserClosed(new Set(visible.map(o => o.name))) }
  const openCount = visible.filter(o => isOpen(o.name)).length
  const allOpen   = visible.length > 0 && openCount === visible.length

  return (
    <SectionShell
      title="Organizations"
      subtitle="Curated DFW nonprofits and what they need help with."
      count={`${filtered.length} of ${orgs.length}`}
      compact={compact}
      onExpand={onExpand}
    >
      {!compact && (
        <div className="bg-white border border-line rounded-2xl shadow-card p-4 sm:p-5 mb-5 space-y-4">
          <FilterRow label="Cause">
            <Pill active={cause === 'all'} count={causeOptions[0]?.count} onClick={() => setCause('all')}>
              All causes
            </Pill>
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
          {visible.length > 0 && (
            <div className="flex items-center justify-end pt-1">
              <button
                onClick={allOpen ? collapseAll : expandAll}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brandDark"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                     className={`w-4 h-4 transition-transform ${allOpen ? 'rotate-180' : ''}`}>
                  <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {allOpen ? 'Collapse all opportunities' : 'Expand all opportunities'}
              </button>
            </div>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="bg-white border border-line rounded-2xl py-12 text-center">
          <p className="text-sm text-muted">No organizations match.</p>
        </div>
      ) : (
        <div className="bg-white border border-line rounded-2xl shadow-card divide-y divide-lineSoft overflow-hidden">
          {visible.map(o => (
            <OrgRow
              key={o.name}
              org={o}
              compact={compact}
              isOpen={isOpen(o.name)}
              onToggle={() => toggle(o.name)}
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

function OrgRow({ org, compact, isOpen, onToggle }) {
  const count = org.entries.length

  return (
    <div className="p-4 lg:p-5 hover:bg-canvas transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-ink text-base leading-snug">
            {org.url ? (
              <a
                href={org.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand transition-colors inline-flex items-center gap-1.5"
              >
                {org.name}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-subtle">
                  <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ) : org.name}
          </h3>

          <div className="mt-1 text-xs text-muted">
            <span className="font-semibold text-ink">{count}</span>{' '}
            way{count === 1 ? '' : 's'} to help
          </div>

          {!compact && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {org.causes.slice(0, 4).map(t => (
                <TagChip key={t} id={t} />
              ))}
            </div>
          )}
        </div>

        {count > 0 && (
          <button
            onClick={onToggle}
            className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-brand hover:bg-brandSoft transition-colors"
            aria-expanded={isOpen}
          >
            {isOpen ? 'Hide' : `View ${count}`}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"
                 className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {isOpen && count > 0 && (
        <ul className="mt-4 pl-0 sm:pl-3 space-y-3 border-l-2 border-brandSoft">
          {org.entries.map((opp, i) => (
            <li key={opp.id || i} className="pl-3 sm:pl-4">
              <a
                href={opp.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <div className="font-semibold text-ink text-sm group-hover:text-brand transition-colors">
                  {opp.opportunity_title}
                </div>
                {opp.description_short && (
                  <p className="mt-1 text-xs sm:text-sm text-muted leading-relaxed line-clamp-2">
                    {opp.description_short}
                  </p>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
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
