// Keyword search helpers — turn a raw query box string into match terms.
//
// The search box is a whole-string `includes` by default, which fails the
// common cases: `dallas food` only matches when those words sit adjacent, and
// there's no way to pin an exact phrase. These two pure functions fix both:
//
//   parseQuery('"food pantry" plano')  -> ['food pantry', 'plano']
//   matchesQuery(hay, terms)           -> true only if hay contains ALL terms
//
// Semantics: quoted runs are one phrase term (kept verbatim, minus the quotes);
// everything else splits on whitespace; terms combine with AND. Relevance
// ranking is intentionally out of scope — this is a filter, not a ranker.

// Split a raw query into lowercased terms. A "quoted phrase" becomes a single
// term; bare words each become their own term. Empty input -> [].
export function parseQuery(raw) {
  const terms = []
  const re = /"([^"]+)"|(\S+)/g
  let m
  while ((m = re.exec(raw || '')) !== null) {
    const term = (m[1] ?? m[2]).trim().toLowerCase()
    if (term) terms.push(term)
  }
  return terms
}

// True when `hay` (a lowercased haystack string) contains every term.
// No terms means "no query" — callers should treat that as match-all.
export function matchesQuery(hay, terms) {
  return terms.every(t => hay.includes(t))
}
