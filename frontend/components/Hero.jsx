// Hero — compact landing banner: wordmark + tagline + global search.
// Kept intentionally short so the three section panels (Opportunities,
// Organizations, Community) appear above the fold on desktop.
//
// To change copy: edit the <h1> and <p> below.

export default function Hero({ search, setSearch, totalOpps, totalOrgs, totalNews, onWordmarkClick }) {
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

      <div className="relative max-w-7xl mx-auto px-5 sm:px-6 lg:px-10 pt-8 pb-6 sm:pt-10 sm:pb-8 lg:pt-12 lg:pb-10">

        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          {/* Wordmark — clickable to return to home state */}
          <div className="lg:max-w-md">
            <button
              onClick={onWordmarkClick}
              className="text-left hover:opacity-80 transition-opacity"
              aria-label="Return to home"
            >
              <h1 className="font-display font-extrabold text-4xl sm:text-5xl text-ink leading-none">
                Y'all <span className="text-brand">Volunteer</span>
              </h1>
            </button>
            <p className="mt-3 text-base sm:text-lg text-inkSoft leading-snug font-medium">
              The source for giving back across Greater Dallas.
            </p>
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
                  w-full pl-14 pr-5 py-4 text-base sm:text-lg
                  bg-white border border-line rounded-2xl
                  shadow-searchbar
                  focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand/40
                  placeholder:text-subtle
                "
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <Stat value={totalOpps} label="opportunities" />
              <span className="text-line">·</span>
              <Stat value={totalOrgs} label="organizations" />
              <span className="text-line">·</span>
              <Stat value={totalNews} label="discussions" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Stat({ value, label }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="font-display font-bold text-ink tabular-nums">{value}</span>
      <span>{label}</span>
    </span>
  )
}
