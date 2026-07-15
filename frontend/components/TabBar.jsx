// TabBar — section nav.
//   • sm and up: sticky single centered row — Home, divider, four tabs.
//   • below sm: the tabs stack vertically, full-width and centered — the
//     only layout that centers cleanly at phone widths. The stacked bar is
//     NOT sticky (five rows would eat half the viewport while scrolling);
//     it scrolls away naturally like the hero.

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
    <div className="sm:sticky sm:top-0 z-30 bg-canvas/95 backdrop-blur-md border-b border-line">

      {/* ── Phone: vertical stack, every row full-width and centered ─────── */}
      <nav className="sm:hidden flex flex-col gap-0.5 px-4 py-2">
        <button
          onClick={onHome}
          className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium text-muted"
          aria-label="Return to home"
        >
          <HomeIcon className="w-4 h-4" />
          Home
        </button>

        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`
              flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium
              transition-colors
              ${active === tab.id
                ? 'bg-brandSoft text-ink'
                : 'text-muted'
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
