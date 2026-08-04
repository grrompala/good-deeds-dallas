// Hero — landing banner: logo wordmark + global search. Lives inside the
// sticky app header (see HomeClient). One fixed, medium size throughout — it
// does not grow/shrink on scroll (that caused layout jitter).
//
// The title + tagline are baked into /public/logo.png (a transparent wordmark
// reading "Good Deeds Dallas — Pay it forward in The Big D"). To change the
// wordmark, swap that image; the footer keeps the text version.

export default function Hero({ search, setSearch, onWordmarkClick }) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-gradient-to-br from-brandSoft via-white to-accentSoft">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle, #0B1220 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-5 sm:px-6 lg:px-10 py-5 sm:py-6 lg:py-7">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6">
          {/* Logo wordmark — clickable to return to home state. The title and
              tagline live in the image itself (see note at top of file). */}
          <div className="shrink-0 lg:max-w-md">
            <button
              onClick={onWordmarkClick}
              className="block text-left hover:opacity-80 transition-opacity"
              aria-label="Good Deeds Dallas — return to home"
            >
              <img
                src="/logo.png"
                alt="Good Deeds Dallas — Pay it forward in The Big D"
                width={782}
                height={192}
                className="h-14 sm:h-16 w-auto max-w-full"
              />
            </button>
          </div>

          {/* Search bar */}
          <div className="lg:flex-1 lg:max-w-2xl">
            <label htmlFor="hub-search" className="sr-only">Search</label>
            <div className="relative">
              <svg
                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.25"
                className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted pointer-events-none"
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
                className="
                  w-full pl-14 pr-5 py-3.5 text-base sm:text-lg
                  bg-white border border-line rounded-2xl shadow-searchbar
                  focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand/40
                  placeholder:text-subtle
                "
              />
            </div>

          </div>
        </div>
      </div>
    </section>
  )
}
