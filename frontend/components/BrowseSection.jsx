// BrowseSection — the full opportunity index with cause-tag filtering.
// Receives an already-filtered (search-applied) list and renders a grid plus
// a horizontal pill row of available cause filters.

import { useMemo, useState } from 'react'
import OpportunityCard from './OpportunityCard'

export default function BrowseSection({ opportunities }) {
  const [activeTag, setActiveTag] = useState(null)

  // Collect all unique cause tags across the data and sort by frequency.
  const tagCounts = useMemo(() => {
    const counts = new Map()
    opportunities.forEach(o => {
      (o.cause_tags || []).forEach(t => {
        const tag = typeof t === 'string' ? t : String(t)
        counts.set(tag, (counts.get(tag) || 0) + 1)
      })
    })
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
  }, [opportunities])

  const filtered = activeTag
    ? opportunities.filter(o => (o.cause_tags || []).some(t => t === activeTag))
    : opportunities

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="text-eyebrow uppercase text-muted mb-3">
            The Full Index
          </div>
          <h2 className="font-serif text-headline font-medium text-ink">
            Every opportunity, one place
          </h2>
        </div>
        <div className="font-mono text-sm text-muted">
          {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
        </div>
      </div>

      {/* Cause filter pills */}
      {tagCounts.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mb-8 -mx-1 px-1">
          <FilterPill
            label="All causes"
            active={!activeTag}
            onClick={() => setActiveTag(null)}
          />
          {tagCounts.map(([tag, count]) => (
            <FilterPill
              key={tag}
              label={typeof tag === 'string' ? tag.replace(/_/g, ' ') : tag}
              count={count}
              active={activeTag === tag}
              onClick={() => setActiveTag(tag)}
            />
          ))}
        </div>
      )}

      {/* Results grid */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center text-muted">
          No opportunities match the current filters.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(item => (
            <OpportunityCard key={item.id} data={item} />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterPill({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`
        shrink-0 px-4 py-2 text-sm rounded-full border transition-colors whitespace-nowrap
        ${active
          ? 'bg-ink text-paper border-ink'
          : 'bg-white text-inkSoft hairline hover:border-ink/40 hover:text-ink'
        }
      `}
    >
      {label}
      {count !== undefined && (
        <span className={`ml-2 font-mono text-xs ${active ? 'text-paper/70' : 'text-muted'}`}>
          {count}
        </span>
      )}
    </button>
  )
}
