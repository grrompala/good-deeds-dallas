// StaticListingCard — server-renderable listing card for the crawlable
// /volunteer pages. No hooks, no client JS: plain links so search engines and
// AI crawlers (which don't execute JavaScript) see the full content.

import { tagMeta } from './tagMeta'
import { sourceLabel } from './SourceBox'
import { cityName } from '../lib/listings'

export default function StaticListingCard({ listing }) {
  const {
    opportunity_title, org_name, description_short, description_long,
    source_url, source, is_virtual,
  } = listing
  const desc = description_short || description_long || ''
  const city = cityName(listing)
  const tags = listing.unified_tags || []
  const src = sourceLabel(source)

  return (
    <div className="p-4 lg:p-5">
      <h3 className="font-bold text-ink text-base leading-snug">
        <a
          href={source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-brand transition-colors"
        >
          {opportunity_title}
        </a>
      </h3>
      <p className="mt-0.5 text-xs font-semibold text-muted uppercase tracking-wider">
        {org_name || 'Independent'}
        {city && <span className="normal-case font-normal"> · {city}, TX</span>}
        {is_virtual && <span className="normal-case font-normal"> · Virtual</span>}
      </p>
      {desc && (
        <p className="mt-1.5 text-sm text-inkSoft leading-relaxed line-clamp-3">{desc}</p>
      )}
      <p className="mt-2 text-xs text-muted">
        {tags.slice(0, 4).map(t => tagMeta(t).label).join(' · ')}
        {src && <span>{tags.length ? ' — ' : ''}via {src}</span>}
      </p>
    </div>
  )
}
