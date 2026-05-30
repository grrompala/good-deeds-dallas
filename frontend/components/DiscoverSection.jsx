// DiscoverSection — the landing-page editorial view. Shows:
//   1. A featured/recent opportunity (largest card)
//   2. A grid of recent opportunities
//   3. A small "from the community" preview of news
//
// To change how many items appear in each, adjust the slice() calls below.

import OpportunityCard from './OpportunityCard'

export default function DiscoverSection({ opportunities, news, onShowAll }) {
  // "Recent" = sort by last_scraped desc (newest first), fall back to title order
  const recent = [...opportunities]
    .sort((a, b) => {
      const da = a.last_scraped || ''
      const db = b.last_scraped || ''
      return db.localeCompare(da)
    })

  const [feature, ...rest] = recent
  const grid = rest.slice(0, 6)
  const newsPreview = news.slice(0, 3)

  if (!feature) {
    return (
      <div className="py-20 text-center text-muted">
        No opportunities loaded yet.
      </div>
    )
  }

  return (
    <div className="space-y-20">

      {/* ── Featured opportunity ─────────────────────────────────────── */}
      <section>
        <SectionHeader
          eyebrow="Now Open"
          title="Recent listings"
          subtitle="Fresh opportunities posted in the last few days"
        />
        <div className="grid lg:grid-cols-3 gap-6 mt-10">
          <div className="lg:col-span-2">
            <OpportunityCard data={feature} variant="feature" />
          </div>
          <div className="space-y-6">
            {rest.slice(0, 2).map(item => (
              <OpportunityCard key={item.id} data={item} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Grid of recent ───────────────────────────────────────────── */}
      {grid.length > 2 && (
        <section>
          <div className="flex items-end justify-between mb-8">
            <h2 className="font-serif text-headline font-medium text-ink">
              More to explore
            </h2>
            <button
              onClick={() => onShowAll('browse')}
              className="text-sm font-medium text-ink hover:text-accent transition-colors inline-flex items-center gap-1"
            >
              Browse all
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {grid.slice(2).map(item => (
              <OpportunityCard key={item.id} data={item} />
            ))}
          </div>
        </section>
      )}

      {/* ── From the community preview ───────────────────────────────── */}
      {newsPreview.length > 0 && (
        <section>
          <div className="flex items-end justify-between mb-8">
            <div>
              <div className="text-eyebrow uppercase text-muted mb-3">
                From The Community
              </div>
              <h2 className="font-serif text-headline font-medium text-ink">
                What neighbors are saying
              </h2>
            </div>
            <button
              onClick={() => onShowAll('news')}
              className="text-sm font-medium text-ink hover:text-accent transition-colors inline-flex items-center gap-1"
            >
              All discussions
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <ul className="divide-y hairline border-t border-b hairline">
            {newsPreview.map(post => (
              <li key={post.id}>
                <a
                  href={post.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block py-5 hover:bg-paperAlt/40 transition-colors -mx-4 px-4 rounded"
                >
                  <div className="flex items-baseline gap-3 text-eyebrow uppercase text-muted mb-2">
                    <span>r/{post.subreddit}</span>
                    <span>·</span>
                    <span>{new Date(post.created_utc).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                  <h3 className="font-serif text-lg text-ink leading-snug group-hover:text-accent transition-colors">
                    {post.title}
                  </h3>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function SectionHeader({ eyebrow, title, subtitle }) {
  return (
    <div>
      <div className="text-eyebrow uppercase text-muted mb-3">
        {eyebrow}
      </div>
      <h2 className="font-serif text-headline font-medium text-ink">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-2 text-muted max-w-prose">{subtitle}</p>
      )}
    </div>
  )
}
