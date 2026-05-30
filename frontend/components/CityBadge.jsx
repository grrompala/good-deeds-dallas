// CityBadge — a small map-pin icon that reveals the city on hover.
// City parsing is unreliable across data sources so we no longer use the
// city as a primary visual or as a filter — just a hover-revealed hint.

const BAD_CITY = /^(confidential|virtual|n\/?a|none|tbd|various|multiple|online|remote|—|-)$/i
const TEXT_BLEED = /\b(needed|hours?|click|brought|location|center|rd|street|st|ave|blvd|opportunity|details|view)\b/i

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

export default function CityBadge({ city }) {
  const cleaned = cleanCity(city)
  if (!cleaned) return null

  return (
    <span
      title={cleaned}
      aria-label={`Location: ${cleaned}`}
      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-brand bg-brandSoft hover:bg-brand hover:text-white transition-colors cursor-help"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
        <path d="M12 22s8-7.5 8-13a8 8 0 1 0-16 0c0 5.5 8 13 8 13z" />
        <circle cx="12" cy="9" r="3" />
      </svg>
    </span>
  )
}
