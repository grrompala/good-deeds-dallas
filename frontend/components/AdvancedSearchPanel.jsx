// AdvancedSearchPanel — the in-app face of the RAG chatbot.
//
// Unlike the keyword search in the hero, this asks a natural-language question
// and gets a grounded answer synthesized from the indexed content (listings,
// organizations, and community chatter). It talks to /api/chat.
//
// NOTE: while we finish cleaning up opportunity descriptions, the index is a
// small SEED (a couple of entries per domain) — enough to prove the loop works
// end to end. Answers will get much better once the full corpus is embedded.

'use client'

import { useEffect, useRef, useState } from 'react'
import SectionShell from './SectionShell'

const MAX_CHARS = 300

const TYPE_LABEL = {
  listing: 'Listing',
  organization: 'Organization',
  chatter: 'Chatter',
}

export default function AdvancedSearchPanel() {
  const [info, setInfo] = useState(null)
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState([]) // { role, content, retrieved? }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const endRef = useRef(null)

  useEffect(() => {
    fetch('/api/chat')
      .then(r => r.json())
      .then(d => (d.error ? null : setInfo(d)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(e) {
    e.preventDefault()
    const text = query.trim()
    if (!text || loading) return
    setMessages(m => [...m, { role: 'user', content: text }])
    setQuery('')
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
      setMessages(m => [
        ...m,
        { role: 'assistant', content: data.answer, retrieved: data.retrieved },
      ])
    } catch (err) {
      setError(String(err.message || err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <SectionShell
      title="Advanced Search"
      subtitle="Ask a question in plain English and get an answer drawn from listings, organizations, and local chatter."
      count={info ? `${info.total} indexed` : undefined}
    >
      {/* Prototype notice */}
      <div className="mb-5 rounded-lg border border-line bg-brandSoft/40 px-4 py-3 text-sm text-inkSoft">
        <span className="font-semibold text-ink">Preview.</span>{' '}
        This is wired to a small seed index while we finish cleaning up the data —
        answers will improve a lot once everything is indexed.
      </div>

      {/* Conversation */}
      {messages.length > 0 && (
        <div className="space-y-3 mb-5">
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
              <div
                className={`inline-block max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-brand text-white'
                    : 'bg-white border border-line text-ink'
                }`}
              >
                <p className="whitespace-pre-line">{m.content}</p>
                {m.retrieved && m.retrieved.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-line/60 text-xs text-muted space-y-0.5">
                    {m.retrieved.map((r, j) => (
                      <div key={j}>
                        <span className="font-mono uppercase tracking-wide text-subtle">
                          {TYPE_LABEL[r.type] || r.type}
                        </span>{' '}
                        <span className="font-medium text-inkSoft">{r.title}</span>{' '}
                        <span className="font-mono">({r.score})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && <p className="text-sm text-muted">Thinking…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div ref={endRef} />
        </div>
      )}

      {messages.length === 0 && (
        <div className="mb-5 text-sm text-muted">
          Try: <em>"weekend opportunities helping with food in Garland"</em> or{' '}
          <em>"which orgs work with kids?"</em>
        </div>
      )}

      {/* Input */}
      <form onSubmit={send} className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value.slice(0, MAX_CHARS))}
          maxLength={MAX_CHARS}
          placeholder="Ask about volunteering near Dallas…"
          className="flex-1 rounded-lg border border-line px-3 py-2.5 text-sm focus:outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-lg bg-accent text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-50"
        >
          Ask
        </button>
      </form>
      <div className="mt-1.5 text-right text-xs text-subtle tabular-nums">
        {query.length}/{MAX_CHARS}
      </div>
    </SectionShell>
  )
}
