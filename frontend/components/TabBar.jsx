// TabBar — sticky section nav.
// Two renderings from one component:
//   • sm and up: the original single row — Home link, divider, four tabs.
//   • below sm (phones): "Opportunities / Organizations / Reddit Threads /
//     Smart Search" can't fit one row legibly on a ~375px screen, so the
//     tabs become a 2×2 grid next to an icon-only Home button.

const TABS = [
  { id: 'listings',      label: 'Opportunities' },
  { id: 'organizations', label: 'Organizations' },
  { id: 'chatter',       label: 'Reddit Threads' },
  { id: 'search',        label: 'Smart Search' },
]

function HomeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinejoin="round" />
      <path d="M9 22V12h6v10" strokeLinejoin="round" />
    </svg>
  )
}

export default function TabBar({ active, onChange, counts = {}, onHome }) {
  return (
    <div className="sticky top-0 z-30 bg-canvas/95 backdrop-blur-md border-b border-line">
      <div className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-10">

        {/* ── Phone layout: icon Home + 2×2 tab grid ─────────────────────── */}
        <nav className="sm:hidden flex items-stretch gap-2 py-1.5">
          <button
            onClick={onHome}
            className="shrink-0 flex items-center px-2 text-muted hover:text-ink transition-colors"
            aria-label="Return to home"
          >
            <HomeIcon className="w-5 h-5" />
          </button>

          <span className="self-stretch my-2 w-px bg-line" />

          <div className="flex-1 grid grid-cols-2 gap-x-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className={`
                  flex items-center justify-center gap-1.5 px-1 py-2 text-xs font-medium
                  border-b-2 transition-colors whitespace-nowrap
                  ${active === tab.id
                    ? 'border-brand text-ink'
                    : 'border-transparent text-muted'
                  }
                `}
              >
                {tab.label}
                {counts[tab.id] !== undefined && (
                  <span className={`font-mono text-[10px] ${active === tab.id ? 'text-brand' : 'text-subtle'}`}>
                    {counts[tab.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </nav>

        {/* ── sm and up: the original single row ─────────────────────────── */}
        <nav className="hidden sm:flex items-stretch gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
          {/* Home button */}
          <button
            onClick={onHome}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-3 text-sm font-medium text-muted hover:text-ink border-b-2 border-transparent transition-colors whitespace-nowrap"
            aria-label="Return to home"
          >
            <HomeIcon className="w-4 h-4" />
            Home
          </button>

          <span className="self-center mx-1 h-5 w-px bg-line" />

          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`
                shrink-0 inline-flex items-center gap-2 px-4 py-3 text-sm font-medium
                border-b-2 transition-colors whitespace-nowrap
                ${active === tab.id
                  ? 'border-brand text-ink'
                  : 'border-transparent text-muted hover:text-ink'
                }
              `}
            >
              {tab.label}
              {counts[tab.id] !== undefined && (
                <span className={`font-mono text-xs ${active === tab.id ? 'text-brand' : 'text-subtle'}`}>
                  {counts[tab.id]}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
