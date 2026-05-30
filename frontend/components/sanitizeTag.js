// Tag utilities.
//
// Records may have two tag fields:
//   - `unified_tags`: LLM-assigned from a fixed taxonomy (preferred — already clean)
//   - `cause_tags`:   raw scraped tags (messy — needs sanitizing)
//
// Use `getTags(record)` everywhere in the UI. It returns the cleanest available.

const SOCIAL = new Set(['instagram', 'facebook', 'twitter', 'linkedin', 'tiktok', 'youtube', 'snapchat', 'pinterest', 'threads'])
const JUNK_WORDS = /\b(posted by|agency|see more|sign up|click here|share opportunity|respond|calendar|icon)\b/i

export function sanitizeTag(tag) {
  if (!tag || typeof tag !== 'string') return null
  const t = tag.trim()
  if (!t) return null
  if (t.length > 40) return null
  if (SOCIAL.has(t.toLowerCase())) return null
  if (JUNK_WORDS.test(t)) return null
  if (/[a-z][A-Z]/.test(t)) return null
  return t
}

export function sanitizeTags(tags) {
  if (!Array.isArray(tags)) return []
  const out = []
  const seen = new Set()
  for (const raw of tags) {
    const t = sanitizeTag(raw)
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase())
      out.push(t)
    }
  }
  return out
}

// Single source of truth for which tags to show on a record.
// Prefers LLM-assigned unified_tags; falls back to sanitized scraped tags.
export function getTags(record) {
  if (Array.isArray(record?.unified_tags) && record.unified_tags.length > 0) {
    return record.unified_tags
  }
  return sanitizeTags(record?.cause_tags || [])
}
