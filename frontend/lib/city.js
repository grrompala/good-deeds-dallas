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

// Title-casing gets these wrong (plus known source-data typos); fix them.
const CITY_DISPLAY_FIXES = {
  Mckinney: 'McKinney',
  Desoto: 'DeSoto',
  Carrolltonm: 'Carrollton',
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
// The geocode step (geocode_listings.py) resolves an already-canonical city
// into the `geo` block, so trust that first — it's cleaner than re-parsing the
// raw fields and it agrees with the map/distance features. Fall back to the raw
// address.city / location.city heuristic for any record not yet geo-stamped.
export function cityName(listing) {
  const geoCity = listing?.geo?.city
  if (geoCity) return CITY_DISPLAY_FIXES[geoCity] || geoCity

  const raw = listing?.address?.city ?? listing?.location?.city
  const cleaned = cleanCity(raw)
  if (!cleaned) return null
  const titled = cleaned.toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase())
  return CITY_DISPLAY_FIXES[titled] || titled
}

// Listing -> { lat, lng } city centroid, or null. Only city-precision geo
// carries usable coordinates; virtual/unknown records return null (they're
// simply absent from the map and sink to the bottom of a distance sort).
export function geoCoords(listing) {
  const g = listing?.geo
  if (!g || g.precision !== 'city') return null
  if (typeof g.lat !== 'number' || typeof g.lng !== 'number') return null
  return { lat: g.lat, lng: g.lng }
}

// Great-circle distance in miles between two { lat, lng } points (Haversine).
export function haversineMiles(a, b) {
  if (!a || !b) return Infinity
  const R = 3958.8 // Earth radius, miles
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// Build { city -> { lat, lng, count } } centroids from a set of listings, using
// each listing's own geo. Lets the UI offer a "near which city?" picker without
// shipping the gazetteer to the browser — the coordinates are already in the data.
export function cityCentroids(listings) {
  const out = new Map()
  for (const o of listings || []) {
    const c = cityName(o)
    const coords = geoCoords(o)
    if (!c || !coords) continue
    if (!out.has(c)) out.set(c, { lat: coords.lat, lng: coords.lng, count: 0 })
    out.get(c).count += 1
  }
  return out
}

// Display city -> URL slug ("North Richland Hills" -> "north-richland-hills").
export function citySlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-')
}
