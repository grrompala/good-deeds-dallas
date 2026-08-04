// parseQuery.js — query understanding for Smart Search.
//
// Turns a natural-language question into the structured filters that
// hybrid_search() applies as SQL WHERE clauses, so the parts of a query that
// are really constraints ("in Plano", "this weekend", "for kids", "remote")
// stop competing as fuzzy vibes inside the embedding and instead filter the
// candidate set directly. One cheap LLM call; degrades to "no filters" (pure
// semantic search) on any error — it must never break a search.
//
// Output shape (all fields optional / nullable):
//   { city, causes[], virtual, date_start, date_end, reason }

import { chat } from './openai.js'
import { TAG_META } from '../../components/tagMeta.js'

const TAXONOMY = Object.keys(TAG_META)

function systemPrompt(today) {
  return [
    'You extract structured search filters from a volunteer-opportunity query.',
    `Today is ${today} (America/Chicago). Use it to resolve relative dates.`,
    '',
    'Return ONLY a JSON object with these keys (no prose, no code fences):',
    '{',
    '  "city":       <a single specific city name if the user named one, else null>,',
    '  "causes":     <array of 0+ tags from the TAXONOMY below that the query is about>,',
    '  "virtual":    <true if they want remote/virtual, false if they want in-person, else null>,',
    '  "date_start": <"YYYY-MM-DD" start of any time window the query implies, else null>,',
    '  "date_end":   <"YYYY-MM-DD" end of that window, else null>',
    '}',
    '',
    `TAXONOMY (use these exact strings for "causes"): ${TAXONOMY.join(', ')}`,
    '',
    'Rules:',
    '- city: only when a specific city is named ("Plano", "Fort Worth"). For',
    '  "near me", "DFW", "the metroplex", "anywhere", or none named -> null.',
    '- causes: map plainly ("kids"->children, "food bank"->food_security,',
    '  "cleanup"->environment). Empty array if nothing in the taxonomy fits.',
    '- Date windows, resolved against today:',
    '    "soon" / "coming up"      -> today .. today+30 days',
    '    "this week"               -> today .. this Sunday',
    '    "this weekend"            -> the coming Saturday .. Sunday',
    '    "in <month>" / "<month>"  -> 1st..last of that month; if that month has',
    '                                 already passed this year, use next year',
    '    a specific date           -> that date as both start and end',
    '  If the query implies no timing, both dates are null.',
    '- Never invent a city or cause that the user did not imply.',
  ].join('\n')
}

// Strip code fences and parse; return {} on any failure.
function safeJson(raw) {
  let t = String(raw || '').trim()
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fence) t = fence[1].trim()
  try {
    const o = JSON.parse(t)
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

// Parse a query into filters. `today` is 'YYYY-MM-DD' in Dallas local time.
// Returns a filters object; on any failure returns all-null (no constraints).
export async function parseQuery(query, today) {
  const empty = { city: null, causes: [], virtual: null, date_start: null, date_end: null, reason: 'none' }
  try {
    const raw = await chat([
      { role: 'system', content: systemPrompt(today) },
      { role: 'user', content: query },
    ])
    const o = safeJson(raw)

    const city = typeof o.city === 'string' && o.city.trim() ? o.city.trim() : null
    const causes = Array.isArray(o.causes)
      ? [...new Set(o.causes.filter(c => TAXONOMY.includes(c)))]
      : []
    const virtual = typeof o.virtual === 'boolean' ? o.virtual : null
    const date_start = ISO.test(o.date_start || '') ? o.date_start : null
    let date_end = ISO.test(o.date_end || '') ? o.date_end : null
    // Guard against an inverted window.
    if (date_start && date_end && date_end < date_start) date_end = null

    return {
      city,
      causes,
      virtual,
      date_start,
      date_end,
      reason: [
        city && `city=${city}`,
        causes.length && `causes=${causes.join('/')}`,
        virtual != null && `virtual=${virtual}`,
        (date_start || date_end) && `dates=${date_start || '…'}..${date_end || '…'}`,
      ].filter(Boolean).join(' ') || 'none',
    }
  } catch {
    return empty
  }
}
