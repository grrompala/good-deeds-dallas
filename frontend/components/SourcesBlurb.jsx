// SourcesBlurb — how the site works (directory, not platform), followed by
// the volunteer sources we aggregate. Shown on the home (empty) state so the
// Listings panel itself can stay lean.

import { sourceInfo } from './SourceBox'

const SOURCES = ['volunteergarland', 'volunteermckinney', 'voly_dallas', 'idealist', 'curated']

export const CONTACT_EMAIL = 'info@good-deeds-dallas.org'

export default function SourcesBlurb() {
  return (
    <div className="mt-2 text-left">
      {/* How this site works — directory-not-platform expectations */}
      <div>
        <h3 className="font-bold text-ink text-base mb-2">How this site works</h3>
        <p className="text-sm text-inkSoft leading-relaxed mb-3">
          Good Deeds Dallas is a <strong className="font-semibold text-ink">volunteer directory</strong> for helping you <em>find</em> opportunities
          across the Dallas metro in one place. We don't handle signups,
          applications, or any communication with organizations.
        </p>
        <ul className="space-y-2 text-sm text-inkSoft leading-relaxed">
          <li className="flex items-start gap-2.5">
            <span className="mt-1.5 h-2 w-2 rounded-full shrink-0 bg-brand" aria-hidden />
            <span>
              <strong className="font-semibold text-ink">Ready to volunteer?</strong>{' '}
              Every listing links straight to its original posting. That's where you
              sign up, directly with the source or organization. We never sit in the
              middle, and you'll never need an account here.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="mt-1.5 h-2 w-2 rounded-full shrink-0 bg-brand" aria-hidden />
            <span>
              <strong className="font-semibold text-ink">Two kinds of listings.</strong>{' '}
              Most opportunities are pulled automatically from the volunteer portals
              listed below. <strong className="font-semibold text-ink">GDD Curated</strong>{' '}
              listings come from local nonprofits we follow directly. Same idea, just
              for organizations that don't always post to the big portals.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="mt-1.5 h-2 w-2 rounded-full shrink-0 bg-brand" aria-hidden />
            <span>
              <strong className="font-semibold text-ink">Check availability at the source.</strong>{' '}
              We refresh listings weekly and remove ones that disappear, but the
              original posting is always the source of truth. An opportunity shown
              here may have filled, changed, or expired since our last update, so the
              linked page has the current word.
            </span>
          </li>
        </ul>
        <br></br>
        <p className="mt-3 text-sm text-muted leading-relaxed">
          Spot something that looks wrong or out of date? The source link is the
          fastest way to verify, or you can let us know at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand font-semibold hover:text-brandDark">
            {CONTACT_EMAIL}
          </a>.
        </p>
      </div>

      {/* Where the listings come from */}
      <div className="mt-6 pt-5 border-t border-lineSoft">
        <p className="text-sm sm:text-base text-muted mb-3">
          Opportunities are pulled from these volunteer sources:
        </p>
        <ul className="space-y-2">
          {SOURCES.map(s => {
            const info = sourceInfo(s)
            if (!info) return null
            return (
              <li key={s} className="flex items-start gap-2.5 text-sm leading-relaxed">
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${info.dot}`} aria-hidden />
                <span>
                  {info.url ? (
                    <a
                      href={info.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-ink hover:text-brand transition-colors"
                    >
                      {info.fullName}
                    </a>
                  ) : (
                    <span className="font-semibold text-ink">{info.fullName}</span>
                  )}
                  {info.domain && <span className="text-muted font-mono text-xs ml-1.5">({info.domain})</span>}
                  <span className="block sm:inline sm:ml-2 text-inkSoft">— {info.summary}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
