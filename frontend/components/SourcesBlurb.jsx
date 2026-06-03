// SourcesBlurb — explains each volunteer site we aggregate. Shown on the home
// (empty) state so the Listings panel itself can stay lean.

import { sourceInfo } from './SourceBox'

const SOURCES = ['volunteergarland', 'volunteermckinney', 'voly_dallas', 'idealist']

export default function SourcesBlurb() {
  return (
    <div className="mt-2 text-left">
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
                <a
                  href={info.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-ink hover:text-brand transition-colors"
                >
                  {info.fullName}
                </a>
                <span className="text-muted font-mono text-xs ml-1.5">({info.domain})</span>
                <span className="block sm:inline sm:ml-2 text-inkSoft">— {info.summary}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
