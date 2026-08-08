// SourcesBlurb — two short star bullets on the home (empty) state: what the
// GDD Curated layer is, and how to act on a listing. What GDD is lives above
// the search prompt (see HomeClient). Stars use the brand indigo (the "Dallas"
// color in the wordmark); rows are simple left-aligned flex — no justify.

export const CONTACT_EMAIL = 'info@good-deeds-dallas.org'

function Star() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand">
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  )
}

export default function SourcesBlurb() {
  return (
    <ul className="mt-2 space-y-2.5 text-left text-sm text-inkSoft leading-relaxed">
      <li className="flex items-start gap-2.5">
        <Star />
        <span>
          <strong className="font-semibold text-ink">GDD Curated</strong> — opportunities
          from local nonprofits we follow directly, beyond the big volunteer portals.
        </span>
      </li>
      <li className="flex items-start gap-2.5">
        <Star />
        <span>
          <strong className="font-semibold text-ink">Ready to volunteer?</strong>{' '}
          Every listing links straight to its original posting.
        </span>
      </li>
    </ul>
  )
}
