// TabBar — sticky section nav. One centered, wrapping row for every screen:
// on desktop all five items sit in a single centered line; on phones the row
// wraps into two centered lines (the four tab labels can't fit one legible
// row on a ~375px screen). Home is icon-only below sm to save width.

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
      <nav className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-10 flex flex-wrap items-center justify-center gap-x-0.5 sm:gap-x-1">
        {/* Home */}
        <button
          onClick={onHome}
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2.5 sm:py-3 text-xs sm:text-sm font-medium text-muted hover:text-ink border-b-2 border-transparent transition-colors whitespace-nowrap"
          aria-label="Return to home"
        >
          <HomeIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Home</span>
        </button>

        <span className="hidden sm:block self-center mx-1 h-5 w-px bg-line" />

        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`
              inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2.5 sm:py-3
              text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap
              ${active === tab.id
                ? 'border-brand text-ink'
                : 'border-transparent text-muted hover:text-ink'
              }
            `}
          >
            {tab.label}
            {counts[tab.id] !== undefined && (
              <span className={`font-mono text-[10px] sm:text-xs ${active === tab.id ? 'text-brand' : 'text-subtle'}`}>
                {counts[tab.id]}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}
