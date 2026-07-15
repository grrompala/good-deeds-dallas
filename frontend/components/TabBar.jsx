// TabBar — sticky section nav.
//   • sm and up: one centered row — Home, divider, four tabs.
//   • below sm: a centered 2×2 grid of the four tabs. The Home button is
//     absolutely positioned in the left corner, OUTSIDE the flow — every
//     in-flow variant skewed the grid off the screen's true centerline.

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

      {/* ── Phone: centered 2×2 grid; Home floats in the corner ──────────── */}
      <nav className="sm:hidden relative px-12">
        <button
          onClick={onHome}
          className="absolute left-2 top-1/2 -translate-y-1/2 p-2.5 text-muted hover:text-ink transition-colors"
          aria-label="Return to home"
        >
          <HomeIcon className="w-5 h-5" />
        </button>

        <div className="max-w-xs mx-auto grid grid-cols-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`
                inline-flex items-center justify-center gap-1.5 px-1 py-2 text-xs font-medium
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

      {/* ── sm and up: one centered row ──────────────────────────────────── */}
      <nav className="hidden sm:flex max-w-6xl mx-auto px-6 lg:px-10 items-stretch justify-center gap-1">
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
  )
}
