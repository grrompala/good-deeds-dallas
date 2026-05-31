// TabBar — sticky section nav. Three sections.
// Also includes the "Home" link on the left so users can always return
// to the empty default state.

const TABS = [
  { id: 'listings',      label: 'Listings' },
  { id: 'organizations', label: 'Organizations' },
  { id: 'chatter',       label: 'Chatter' },
  { id: 'search',        label: 'Smart Search' },
]

export default function TabBar({ active, onChange, counts = {}, onHome }) {
  return (
    <div className="sticky top-0 z-30 bg-canvas/95 backdrop-blur-md border-b border-line">
      <div className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-10">
        <nav className="flex items-stretch gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
          {/* Home button */}
          <button
            onClick={onHome}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-3 text-sm font-medium text-muted hover:text-ink border-b-2 border-transparent transition-colors whitespace-nowrap"
            aria-label="Return to home"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinejoin="round" />
              <path d="M9 22V12h6v10" strokeLinejoin="round" />
            </svg>
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
