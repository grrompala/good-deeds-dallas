// TabBar — section nav. Rendered inside the sticky app header (HomeClient).
//
// DESKTOP (lg+): the horizontal row below, exactly as before.
// MOBILE (<lg): this row is hidden; the same items live in the hamburger
// dropdown (MobileNav, exported below) so the sticky header stays compact
// (logo + hamburger, with the search bar underneath).

export const TABS = [
  { id: 'search',        label: 'Smart Search' },
  { id: 'listings',      label: 'Opportunities' },
  { id: 'organizations', label: 'Organizations' },
  { id: 'chatter',       label: 'Reddit Threads' },
]

export default function TabBar({ active, counts, onChange, onHome }) {
  return (
    <div className="hidden lg:block bg-canvas/95 backdrop-blur-md border-b border-line">
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

          {TABS.map(tab => {
            const count = counts?.[tab.id]
            return (
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
                {typeof count === 'number' && (
                  <span
                    className={`
                      inline-flex items-center justify-center min-w-[1.25rem] px-1.5 py-0.5
                      rounded-full text-[11px] font-mono leading-none
                      ${active === tab.id ? 'bg-brand text-white' : 'bg-lineSoft text-muted'}
                    `}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

// MobileNav — the hamburger dropdown (phones/tablets, hidden on lg+). Rendered
// as a fixed layer that starts just below the sticky header (via the
// --app-header-h CSS var HomeClient publishes), so it drops beneath the
// logo + search without covering them. Tapping the dimmed backdrop, or any
// item, closes it (HomeClient wraps the handlers to setMenuOpen(false)).
export function MobileNav({ open, active, counts, onChange, onHome, onClose }) {
  if (!open) return null
  const itemBase =
    'flex items-center gap-2 w-full px-2 py-3 text-left text-[15px] font-medium border-b border-lineSoft last:border-0 transition-colors'
  return (
    <div
      className="lg:hidden fixed inset-x-0 bottom-0 z-30"
      style={{ top: 'var(--app-header-h, 120px)' }}
    >
      {/* Dimmed backdrop — tap anywhere below the header to close. */}
      <button
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-black/20"
      />
      <div className="absolute top-0 left-0 right-0 bg-white border-b border-line shadow-lg">
        <nav className="max-w-6xl mx-auto px-5 py-1 flex flex-col">
          <button onClick={onHome} className={`${itemBase} text-muted hover:text-ink`}>
            <span className="inline-flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinejoin="round" />
                <path d="M9 22V12h6v10" strokeLinejoin="round" />
              </svg>
              Home
            </span>
          </button>
          {TABS.map(tab => {
            const count = counts?.[tab.id]
            return (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                aria-current={active === tab.id ? 'page' : undefined}
                className={`${itemBase} justify-between ${active === tab.id ? 'text-brand' : 'text-muted hover:text-ink'}`}
              >
                {tab.label}
                {typeof count === 'number' && (
                  <span className="inline-flex items-center justify-center min-w-[1.25rem] px-1.5 py-0.5 rounded-full text-[11px] font-mono leading-none bg-lineSoft text-muted">
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
