// SourceBox — square tile on the left of each listing row.
// For now: shows the listing-site name as stacked text. Later you can
// drop in a logo image by editing the LOGOS map below.
//
// To add a logo: place an image at /public/sources/<key>.svg and add to LOGOS.

const SOURCES = {
  volunteergarland: {
    name:        'Volunteer Garland',
    fullName:    'Volunteer Garland',
    url:         'https://www.volunteergarland.org',
    domain:      'volunteergarland.org',
    summary:     "The City of Garland's official volunteer portal — concrete shifts and projects posted directly by Garland-area nonprofits.",
    short:       ['Volunteer', 'Garland'],
    bg:          'bg-emerald-50',
    text:        'text-emerald-700',
    border:      'border-emerald-200',
    dot:         'bg-emerald-500',
  },
  volunteermckinney: {
    name:        'Volunteer McKinney',
    fullName:    'Volunteer McKinney',
    url:         'https://volunteermckinney.galaxydigital.com',
    domain:      'volunteermckinney.galaxydigital.com',
    summary:     "McKinney's local volunteer hub — pulls together specific opportunities from nonprofits across the McKinney area.",
    short:       ['Volunteer', 'McKinney'],
    bg:          'bg-rose-50',
    text:        'text-rose-700',
    border:      'border-rose-200',
    dot:         'bg-rose-500',
  },
  voly_dallas: {
    name:        'Voly Dallas',
    fullName:    'VOLY · Dallas',
    url:         'https://dallas.voly.org',
    domain:      'dallas.voly.org',
    summary:     'A Dallas-area volunteer matching network listing hundreds of opportunities from agencies across the metro.',
    short:       ['Voly', 'Dallas'],
    bg:          'bg-violet-50',
    text:        'text-violet-700',
    border:      'border-violet-200',
    dot:         'bg-violet-500',
  },
  idealist: {
    name:        'Idealist',
    fullName:    'Idealist',
    url:         'https://www.idealist.org',
    domain:      'idealist.org',
    summary:     "A nationwide volunteer + nonprofit-jobs board — we pull the Dallas-metro slice via their public Algolia search.",
    short:       ['Idealist'],
    bg:          'bg-sky-50',
    text:        'text-sky-700',
    border:      'border-sky-200',
    dot:         'bg-sky-500',
  },
  curated: {
    name:        'Curated',
    fullName:    'Curated nonprofits',
    url:         null,
    domain:      null,
    summary:     'Hand-picked DFW nonprofits whose volunteer pages we extract directly with an LLM.',
    short:       ['Curated'],
    bg:          'bg-amber-50',
    text:        'text-amber-700',
    border:      'border-amber-200',
    dot:         'bg-amber-500',
  },
}

export function sourceInfo(source) {
  return SOURCES[source] || null
}

const LOGOS = {
  // volunteergarland:  '/sources/garland.svg',
  // volunteermckinney: '/sources/mckinney.svg',
  // voly_dallas:       '/sources/voly.svg',
}

export function sourceLabel(source) {
  return SOURCES[source]?.name || null
}

export default function SourceBox({ source }) {
  // Curated entries are blended in without a source tile — they're hand-picked,
  // not pulled from one of the aggregator sites, so they get no square icon.
  if (source === 'curated') return null

  const def = SOURCES[source]
  if (!def) {
    return (
      <div className="shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center">
        <span className="text-xs font-mono text-muted">—</span>
      </div>
    )
  }

  const logo = LOGOS[source]

  return (
    <div
      className={`shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl ${def.bg} ${def.text} border ${def.border} flex items-center justify-center text-center p-1.5`}
      title={`Source: ${def.name}`}
      aria-label={`Source: ${def.name}`}
    >
      {logo ? (
        <img src={logo} alt={def.name} className="max-w-full max-h-full object-contain" />
      ) : (
        <div className="leading-tight">
          {def.short.map((word, i) => (
            <div
              key={i}
              className={`font-bold ${def.short.length > 1 ? 'text-[10px] sm:text-xs' : 'text-xs sm:text-sm'} uppercase tracking-wider`}
            >
              {word}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
