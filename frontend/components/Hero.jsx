// Hero — landing banner: wordmark + tagline + global search. Lives inside the
// sticky app header (see HomeClient), so once the user scrolls it collapses to
// a slim bar (`compact`) that keeps the wordmark + search pinned without eating
// the viewport.
//
// To change copy: edit the <h1> and <p> below.

export default function Hero({ search, setSearch, onWordmarkClick, compact = false }) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-gradient-to-br from-brandSoft via-white to-accentSoft">
      <div
        aria-hidden
        className={`absolute inset-0 transition-opacity duration-200 ${compact ? 'opacity-0' : 'opacity-[0.04]'}`}
        style={{
          backgroundImage: 'radial-gradient(circle, #0B1220 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className={`relative max-w-7xl mx-auto px-5 sm:px-6 lg:px-10 transition-all duration-200
        ${compact ? 'py-2.5' : 'pt-8 pb-6 sm:pt-10 sm:pb-8 lg:pt-12 lg:pb-10'}`}>

        <div className={`flex flex-col lg:flex-row lg:items-center lg:justify-between
          ${compact ? 'gap-2 lg:gap-4' : 'gap-6 lg:items-end'}`}>
          {/* Wordmark — clickable to return to home state */}
          <div className={compact ? 'shrink-0' : 'lg:max-w-md'}>
            <button
              onClick={onWordmarkClick}
              className="text-left hover:opacity-80 transition-opacity"
              aria-label="Return to home"
            >
              <h1 className={`font-display font-extrabold text-ink leading-none transition-all duration-200
                ${compact ? 'text-xl sm:text-2xl' : 'text-4xl sm:text-5xl'}`}>
                Good Deeds <span className="text-brand">Dallas</span>
              </h1>
            </button>
            {!compact && (
              <p className="mt-3 text-base sm:text-lg text-inkSoft leading-snug font-medium">
                Pay it forward in The Big D
              </p>
            )}
          </div>

          {/* Search bar */}
          <div className="lg:flex-1 lg:max-w-2xl">
            <label htmlFor="hub-search" className="sr-only">Search</label>
            <div className="relative">
              <svg
                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.25"
                className={`absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted pointer-events-none
                  ${compact ? 'sm:left-4' : ''}`}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
              <input
                id="hub-search"
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search across all sections…"
                className={`
                  w-full pl-14 pr-5 bg-white border border-line rounded-2xl
                  shadow-searchbar transition-all duration-200
                  focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand/40
                  placeholder:text-subtle
                  ${compact ? 'py-2.5 text-base sm:pl-12' : 'py-4 text-base sm:text-lg'}
                `}
              />
            </div>

          </div>
        </div>
      </div>
    </section>
  )
}
