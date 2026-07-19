// SmartSearchPanel — the in-app face of the RAG chatbot.
//
// Ask a natural-language question and get TWO renderings of one retrieval:
// (1) a grounded prose answer from the LLM, and (2) the closest LISTINGS,
// ranked best-match-first. The ranking is the retrieval's cosine order — no
// model decides which cards to show, and no score is shown to the user.
//
// Focused on listings for now (orgs/chatter are indexed but not surfaced).
//
// NOTE: while we finish cleaning up opportunity descriptions, the index is a
// small SEED, so results look similar across queries. The cards always show the
// CLOSEST listings even when nothing truly fits — the written answer is what
// tells the user whether any are a real match.

'use client'

import { useEffect, useState } from 'react'
import SectionShell from './SectionShell'
import { ListingRow } from './ListingsPanel'

const MAX_CHARS = 300

// The last Q&A survives leaving the tab (component unmount) and page
// refreshes via sessionStorage; it clears when the browser tab closes.
const STORAGE_KEY = 'gdd-smart-search-result'

export default function AdvancedSearchPanel({
  onSelectOrg,
  onSelectListing,
}) {
  const [limit, setLimit] = useState(null)
  const [remaining, setRemaining] = useState(null)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null) // { question, answer, listings }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Restore the previous conversation on mount (sessionStorage is browser-only,
  // so this runs in an effect rather than as the initial state to keep the
  // server-rendered markup consistent).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) setResult(JSON.parse(saved))
    } catch {
      // corrupt/unavailable storage — start fresh
    }
  }, [])

  // Persist each new result.
  useEffect(() => {
    try {
      if (result) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result))
    } catch {
      // storage full/unavailable — losing persistence is fine
    }
  }, [result])

  useEffect(() => {
    fetch('/api/chat')
      .then(r => r.json())
      .then(d => {
        if (d.error) return
        if (typeof d.dailyLimit === 'number') {
          setLimit(d.dailyLimit)
          // GET reports this client's actual remaining quota (searches used
          // earlier today survive leaving and re-entering this tab).
          setRemaining(typeof d.remaining === 'number' ? d.remaining : d.dailyLimit)
        }
      })
      .catch(() => {})
  }, [])

  async function send(e) {
    e.preventDefault()
    const text = query.trim()
    if (!text || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setResult({ question: text, answer: data.answer, listings: data.listings || [] })
      if (typeof data.remaining === 'number') setRemaining(data.remaining)
      if (typeof data.limit === 'number') setLimit(data.limit)
      setQuery('')
    } catch (err) {
      setError(String(err.message || err))
    } finally {
      setLoading(false)
    }
  }

  const listings = result?.listings || []
  const outOfQuota = remaining === 0

  return (
    <SectionShell
      title="Smart Search"
      subtitle="AI query feature."
      count={
        limit !== null
          ? `${remaining ?? limit}/${limit} searches left today`
          : undefined
      }
    >

      {/* Input */}
      <form onSubmit={send} className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value.slice(0, MAX_CHARS))}
          maxLength={MAX_CHARS}
          placeholder="e.g. weekend food-pantry help in Garland"
          disabled={outOfQuota}
          className="flex-1 rounded-lg border border-line px-3 py-2.5 text-sm focus:outline-none focus:border-brand disabled:bg-canvas disabled:text-muted"
        />
        <button
          type="submit"
          disabled={loading || !query.trim() || outOfQuota}
          className="rounded-lg bg-accent text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Ask'}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {(result || loading) && (
        <div className="mt-6 space-y-4">
          {/* User's question — chat bubble */}
          {result && (
            <div className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand text-white px-4 py-2.5 text-sm leading-relaxed">
                {result.question}
              </div>
            </div>
          )}

          {/* Assistant answer — chat bubble with rendered formatting */}
          {result && (
            <div className="flex gap-3">
              <Avatar />
              <div className="flex-1 min-w-0 rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3 shadow-card text-[15px] text-ink leading-relaxed">
                <FormattedAnswer text={result.answer} />
              </div>
            </div>
          )}

          {/* Thinking indicator */}
          {loading && (
            <div className="flex gap-3">
              <Avatar />
              <div className="rounded-2xl rounded-tl-md border border-line bg-white px-4 py-3.5 shadow-card">
                <span className="flex gap-1">
                  <Dot /> <Dot /> <Dot />
                </span>
              </div>
            </div>
          )}

          {/* Ranked opportunities (best match first). Always shown when present. */}
          {result && listings.length > 0 && (
            <div className="pt-4">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-bold text-ink text-lg">Best opportunities</h3>
                <span className="text-xs font-mono text-muted tabular-nums">
                  {listings.length}
                </span>
              </div>
              <div className="bg-white border border-line rounded-2xl shadow-card divide-y divide-lineSoft overflow-hidden">
                {listings.map((r, i) => (
                  <ListingRow
                    key={r.item.id || i}
                    data={r.item}
                    onSelectOrg={onSelectOrg}
                    onSelectListing={onSelectListing}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!result && !loading && (
        <div className="mt-6 text-sm text-muted">
          Try: <em>"help cleaning up parks and litter in Garland"</em> or{' '}
          <em>"weekend food-pantry volunteering"</em>
        </div>
      )}
    </SectionShell>
  )
}

// ── Assistant avatar (sparkle) ───────────────────────────────────────────────
function Avatar() {
  return (
    <div className="shrink-0 w-8 h-8 rounded-full bg-brandSoft text-brand flex items-center justify-center">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
        <path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7z" />
      </svg>
    </div>
  )
}

// Animated typing dot.
function Dot() {
  return <span className="w-1.5 h-1.5 rounded-full bg-subtle animate-pulse" />
}

// ── Minimal markdown: paragraphs, **bold**, and clean list rendering, with
// stray [n] citations removed. Numbered/bulleted items get real list markup
// (one item per line) instead of running together in a paragraph.
const NUM_ITEM = /^\s*\d{1,2}[.)]\s+/
const BULLET_ITEM = /^\s*[-•*]\s+/

// The model is prompted to put each numbered item on its own line, but if an
// enumeration arrives inline ("... 1. thing 2. thing"), break it apart. Only
// fires when a sequential "1." and "2." both appear, so prose like
// "meet on July 4." can't trigger it.
function explodeInlineNumbers(block) {
  if (block.includes('\n')) return block
  if (!/(?:^|[\s:])1[.)]\s/.test(block) || !/\s2[.)]\s/.test(block)) return block
  let out = block
  for (let n = 1; n <= 20; n++) {
    const re = new RegExp(`(?:^|[\\s:])${n}[.)]\\s`)
    if (!re.test(out)) break
    out = out.replace(re, `\n${n}. `)
  }
  return out
}

function Block({ text }) {
  const lines = explodeInlineNumbers(text)
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const isNumbered = lines.filter(l => NUM_ITEM.test(l)).length >= 2
  const isBulleted = !isNumbered && lines.filter(l => BULLET_ITEM.test(l)).length >= 2

  if (!isNumbered && !isBulleted) {
    return <p>{renderInline(lines.join(' '))}</p>
  }

  const marker = isNumbered ? NUM_ITEM : BULLET_ITEM
  const intro = []
  const items = []
  for (const line of lines) {
    if (marker.test(line)) items.push(line.replace(marker, ''))
    else if (!items.length) intro.push(line)
    else items[items.length - 1] += ' ' + line // wrapped continuation line
  }
  const ListTag = isNumbered ? 'ol' : 'ul'
  return (
    <div>
      {intro.length > 0 && <p className="mb-1.5">{renderInline(intro.join(' '))}</p>}
      <ListTag className={`${isNumbered ? 'list-decimal' : 'list-disc'} pl-5 space-y-1.5`}>
        {items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ListTag>
    </div>
  )
}

function FormattedAnswer({ text }) {
  const clean = String(text || '').replace(/\s*\[\d+\]/g, '')
  const blocks = clean.trim().split(/\n{2,}/)
  return (
    <div className="space-y-2.5">
      {blocks.map((block, i) => (
        <Block key={i} text={block} />
      ))}
    </div>
  )
}

function renderInline(s) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? (
      <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}
