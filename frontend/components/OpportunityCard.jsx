// OpportunityCard — the standard listing card used everywhere opportunities
// are shown (Discover, Browse, search results). Editorial typography on a
// raised card with a thin hairline rule and a subtle hover lift.
//
// `variant="feature"` makes the card larger for the Discover page hero list.

export default function OpportunityCard({ data, variant = 'standard' }) {
  const {
    opportunity_title,
    org_name,
    description_short,
    description_long,
    cause_tags = [],
    schedule,
    address,
    volunteers_needed,
    source_url,
    is_virtual,
  } = data

  const location = is_virtual
    ? 'Virtual'
    : address?.full
      ? `${address.city || ''}${address.city ? ', ' : ''}${address.state || ''}`.trim().replace(/,$/, '')
      : address?.city
        ? `${address.city}, ${address.state || 'TX'}`
        : null

  const isFeature = variant === 'feature'

  return (
    <a
      href={source_url}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        group relative block bg-white border hairline rounded-2xl overflow-hidden
        transition-all duration-200
        hover:border-ink/30 hover:shadow-[0_8px_30px_rgba(15,27,45,0.08)]
        hover:-translate-y-0.5
        ${isFeature ? 'p-7 lg:p-8' : 'p-6'}
      `}
    >
      {/* Eyebrow: org name + virtual flag */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="text-eyebrow uppercase text-muted truncate">
          {org_name || 'Independent'}
        </div>
        {is_virtual && (
          <span className="shrink-0 px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium text-accent bg-accentSoft rounded">
            Virtual
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className={`
        font-serif font-medium text-ink leading-tight tracking-tight
        ${isFeature ? 'text-2xl lg:text-3xl' : 'text-xl'}
        group-hover:text-accent transition-colors
      `}>
        {opportunity_title}
      </h3>

      {/* Description */}
      {(description_short || description_long) && (
        <p className={`
          mt-3 text-inkSoft leading-relaxed
          ${isFeature ? 'text-base' : 'text-sm'}
        `}>
          {description_short || description_long?.slice(0, 180) + '…'}
        </p>
      )}

      {/* Cause tags */}
      {cause_tags.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {cause_tags.slice(0, 4).map((tag, i) => (
            <span
              key={i}
              className="px-2.5 py-1 text-xs text-muted bg-paperAlt rounded-md"
            >
              {typeof tag === 'string' ? tag.replace(/_/g, ' ') : tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer metadata */}
      <div className="mt-5 pt-4 border-t hairline flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-mono text-muted">
        {schedule?.date && (
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" />
            </svg>
            {schedule.date}
          </span>
        )}
        {schedule?.duration && (
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" strokeLinecap="round" />
            </svg>
            {schedule.duration}
          </span>
        )}
        {location && (
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <path d="M12 22s8-7.5 8-13a8 8 0 1 0-16 0c0 5.5 8 13 8 13z" />
              <circle cx="12" cy="9" r="3" />
            </svg>
            {location}
          </span>
        )}
        {volunteers_needed && (
          <span className="inline-flex items-center gap-1.5 ml-auto">
            {volunteers_needed} needed
          </span>
        )}
      </div>
    </a>
  )
}
