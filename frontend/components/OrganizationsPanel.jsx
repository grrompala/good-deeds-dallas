// OrganizationsPanel — directory of organizations DERIVED from the listings.
// There is no separate curated source anymore: every org here is built from
// the same opportunities shown in the Listings panel (see orgs.js). Clicking
// an org opens the OrgModal summary of all its listings.

import { useMemo, useState } from 'react'
import SectionShell from './SectionShell'
import TagChip from './TagChip'
import { buildOrgs } from './orgs'

export default function OrganizationsPanel({ listings = [], compact = false, searchActive = false, onExpand, onSelectOrg }) {
  const [cause, setCause] = useState('all')

  // ── Derive orgs from listings ────────────────────────────────────────────
  const orgs = useMemo(() => buildOrgs(listings), [listings])

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
    return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [orgs, cause])

  const visible = compact ? filtered.slice(0, 8) : filtered

  return (
    <SectionShell
      title="Organizations"
      subtitle="Every organization we've found across the Dallas listings, and what they need help with."
      count={`${filtered.length} of ${orgs.length}`}
      compact={compact}
      onExpand={onExpand}
    >
      {!compact && (
        <div className="bg-white border border-line rounded-2xl shadow-card p-4 sm:p-5 mb-5">
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
