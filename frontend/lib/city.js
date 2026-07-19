// city.js — the single source of truth for city normalization. Pure module
// (no fs, no React) so it's safe in both client components (filter pills,
// listing rows) and server code (lib/listings.js → /volunteer/in/[city]).
//
// City data quality varies a lot by source, so display/filtering only ever
// uses what survives cleanCity(); everything else is treated as "no city".

// Obvious non-city values.
const BAD_CITY = /^(confidential|virtual|n\/?a|none|tbd|various|multiple|online|remote|—|-)$/i
// Fragments of listing text that sometimes bleed into the city field.
const TEXT_BLEED = /\b(needed|hours?|click|brought|location|center|rd|street|st|ave|blvd|opportunity|details|view)\b/i

// Title-casing gets these wrong; fix known cases.
const CITY_DISPLAY_FIXES = {
  Mckinney: 'McKinney',
  Desoto: 'DeSoto',
}

// Raw city string -> trimmed city or null if it doesn't look like a city.
export function cleanCity(raw) {
  if (!raw || typeof raw !== 'string') return null
  let c = raw.trim()
  if (!c) return null
  if (BAD_CITY.test(c)) return null
  c = c.replace(/,?\s*(TX|Texas)$/i, '').trim()
  if (!c) return null
  if (c.length > 25) return null
  const words = c.split(/\s+/).filter(Boolean)
  if (words.length > 3) return null
  if (TEXT_BLEED.test(c)) return null
  if (/\d{3,}/.test(c)) return null
  return c
}

// Listing -> normalized display city ("Plano", "McKinney") or null.
export function cityName(listing) {
  const cleaned = cleanCity(listing?.address?.city)
  if (!cleaned) return null
  const titled = cleaned.toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase())
  return CITY_DISPLAY_FIXES[titled] || titled
}

// Display city -> URL slug ("North Richland Hills" -> "north-richland-hills").
export function citySlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-')
}
