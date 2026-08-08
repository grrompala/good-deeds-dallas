// SourcesBlurb — a lean "how this site works" note shown on the home (empty)
// state. Deliberately minimal: what GDD is lives above the search prompt now
// (see HomeClient), so this just covers how to act on a listing and what the
// GDD Curated layer is.

export const CONTACT_EMAIL = 'info@good-deeds-dallas.org'

export default function SourcesBlurb() {
  return (
    <div className="mt-2 text-left">
      <h3 className="font-bold text-ink text-base mb-2">How this site works</h3>
      <ul className="space-y-2 text-sm text-inkSoft leading-relaxed">
        <li className="flex items-start gap-2.5">
          <span className="mt-1.5 h-2 w-2 rounded-full shrink-0 bg-brand" aria-hidden />
          <span>
            <strong className="font-semibold text-ink">GDD Curated</strong> — opportunities
            from local nonprofits we follow directly, beyond the big volunteer portals.
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="mt-1.5 h-2 w-2 rounded-full shrink-0 bg-brand" aria-hidden />
          <span>
            <strong className="font-semibold text-ink">Ready to volunteer?</strong>{' '}
            Every listing links straight to its original posting.
          </span>
        </li>
      </ul>
    </div>
  )
}
