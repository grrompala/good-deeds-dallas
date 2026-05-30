// Header — sticky masthead with city seals + serif wordmark + minimal nav.
// To restyle: edit the className strings. The seals live in
// /public/images/ and are referenced by relative path.

export default function Header({ activeSection, onNavigate }) {
  const NAV = [
    { id: 'discover', label: 'Discover' },
    { id: 'browse',   label: 'Browse' },
    { id: 'news',     label: 'Community' },
  ]

  return (
    <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md border-b hairline">
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">

          {/* ── Wordmark + city seals ────────────────────────────────────── */}
          <button
            onClick={() => onNavigate('discover')}
            className="flex items-center gap-4 group"
          >
            <div className="flex items-center gap-2">
              <img
                src="/images/richardson-seal.png"
                alt="Richardson, TX seal"
                className="h-9 w-9 object-contain opacity-90 group-hover:opacity-100 transition"
              />
              <img
                src="/images/garland-seal.png"
                alt="Garland, TX seal"
                className="h-9 w-9 object-contain opacity-90 group-hover:opacity-100 transition"
              />
            </div>
            <div className="hidden sm:block border-l hairline pl-4">
              <div className="font-serif text-lg font-semibold tracking-tight leading-none">
                The Volunteer Hub
              </div>
              <div className="text-eyebrow uppercase text-muted mt-1.5">
                Richardson · Garland
              </div>
            </div>
          </button>

          {/* ── Section nav ──────────────────────────────────────────────── */}
          <nav className="flex items-center gap-1">
            {NAV.map(item => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`
                  px-4 py-2 text-sm font-medium rounded-full transition-colors
                  ${activeSection === item.id
                    ? 'text-ink bg-paperAlt'
                    : 'text-muted hover:text-ink'
                  }
                `}
              >
                {item.label}
              </button>
            ))}
          </nav>

        </div>
      </div>
    </header>
  )
}
