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

import { useEffect, useRef, useState } from 'react'
import SectionShell from './SectionShell'
import { ListingRow } from './ListingsPanel'

const MAX_CHARS = 300

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
  const endRef = useRef(null)

  useEffect(() => {
    fetch('/api/chat')
      .then(r => r.json())
      .then(d => {
        if (d.error) return
        if (typeof d.dailyLimit === 'number') {
          setLimit(d.dailyLimit)
          setRemaining(d.dailyLimit)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [result, loading])

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
      subtitle="Ask a question in plain English. You'll get a written answer plus the closest listings, ranked by match."
      count={
        limit !== null
          ? `${remaining ?? limit}/${limit} searches left today`
          : undefined
      }
    >
      {/* Prototype notice */}
      <div className="mb-5 rounded-lg border border-line bg-brandSoft/40 px-4 py-3 text-sm text-inkSoft">
        <span className="font-semibold text-ink">Preview.</span>{' '}
        Wired to a small seed index while we finish cleaning up the data — results
        will look similar across queries until the full set is indexed.
      </div>

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
      <div className="mt-1.5 flex items-center justify-between text-xs text-subtle tabular-nums">
        <span>
          {limit !== null &&
            (outOfQuota
              ? 'Daily limit reached — try again tomorrow.'
              : `${remaining ?? limit} of ${limit} searches left today`)}
        </span>
        <span>{query.length}/{MAX_CHARS}</span>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-6">
          {/* Echo the user's question, then the answer */}
          <div className="rounded-2xl border border-line bg-white p-5">
            <p className="text-sm font-semibold text-ink">
              <span className="text-muted font-normal">You asked: </span>
              {result.question}
            </p>
            <div className="mt-3 border-t border-lineSoft pt-3">
              <div className="text-xs font-mono uppercase tracking-wider text-muted mb-2">
                Answer
              </div>
              <p className="whitespace-pre-line text-sm sm:text-base text-ink leading-relaxed">
                {result.answer}
              </p>
            </div>
          </div>

          {/* Ranked listings (best match first). Always shown when present. */}
          {listings.length > 0 && (
            <div className="mt-8">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-bold text-ink text-lg">Best listings</h3>
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

      <div ref={endRef} />
    </SectionShell>
  )
}
