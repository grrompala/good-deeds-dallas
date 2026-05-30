// SourceBadge — annotates each opportunity row with where it came from.
// "Volunteer Garland", "Voly Dallas", etc. Subtle by design.

const SOURCES = {
  garland:          { label: 'Volunteer Garland', color: 'text-emerald-700 bg-emerald-50 ring-emerald-200' },
  voly_dallas:      { label: 'Voly Dallas',       color: 'text-violet-700 bg-violet-50 ring-violet-200' },
  curated:          { label: 'Curated',           color: 'text-slate-700 bg-slate-100 ring-slate-200' },
}

export default function SourceBadge({ source }) {
  const def = SOURCES[source]
  if (!def) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider font-semibold ring-1 ${def.color}`}>
      via {def.label}
    </span>
  )
}
