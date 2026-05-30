// cleanText — tiny utilities for sanitizing scraped string fields at render
// time. Use these as a safety net so messy data from older scraper runs
// doesn't bleed into the UI.

// Strip Galaxy Digital UI labels ("Posted By", "Agency", etc.) that
// occasionally end up appended to an org name when the scraper grabs a
// too-greedy parent element.
const ORG_SUFFIX_NOISE = /\s*(Posted By|Agency|Brought To You By|Get Connected)\s*$/i

export function cleanOrgName(raw) {
  if (!raw || typeof raw !== 'string') return raw
  let t = raw.trim()
  // Run the strip up to 3 times to catch concatenations like
  // "Foo BarPosted ByPosted By".
  for (let i = 0; i < 3 && ORG_SUFFIX_NOISE.test(t); i++) {
    t = t.replace(ORG_SUFFIX_NOISE, '').trim()
  }
  return t || null
}
