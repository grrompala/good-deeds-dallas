// /chat — a throwaway test page for the RAG prototype. It is intentionally
// separate from the main site so we can validate the loop on a single indexed
// listing before wiring a chatbot into the real UI.
//
// On load it asks /api/chat (GET) which listing is indexed, so you can tailor
// a query to it. Each send hits /api/chat (POST) and shows the answer plus
// what was retrieved and its similarity score.

'use client'

import { useEffect, useRef, useState } from 'react'

export default function ChatTestPage() {
  const [info, setInfo] = useState(null)
  const [infoError, setInfoError] = useState(null)
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState([]) // { role, content, retrieved? }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const endRef = useRef(null)

  useEffect(() => {
    fetch('/api/chat')
      .then(r => r.json())
      .then(d => (d.error ? setInfoError(d.error) : setInfo(d)))
      .catch(e => setInfoError(String(e)))
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(e) {
    e.preventDefault()
    const q = query.trim()
    if (!q || loading) return
    setMessages(m => [...m, { role: 'user', content: q }])
    setQuery('')
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
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
    <main className="max-w-2xl mx-auto px-5 py-10">
      <header className="mb-6">
        <h1 className="font-display font-bold text-2xl text-ink">RAG chatbot — test bench</h1>
        <p className="mt-1 text-sm text-muted">
          Prototype indexing a single listing. Ask something related to it and watch
          retrieval + the grounded answer.
        </p>
      </header>

      {/* Which listing is indexed */}
      <section className="mb-6 rounded-xl border border-line bg-white p-4">
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted mb-2">
          Currently indexed
        </h2>
        {infoError ? (
          <p className="text-sm text-red-600">{infoError}</p>
        ) : info ? (
          <div className="text-sm text-inkSoft">
            <p className="font-semibold text-ink">{info.indexedListing.title}</p>
            <p className="text-muted">{info.indexedListing.org}</p>
            <p className="mt-2 text-xs text-subtle">
              models: {info.models.embedModel} · {info.models.chatModel} · top-k {info.models.topK}
            </p>
            <details className="mt-2">
              <summary className="text-xs text-brand cursor-pointer">view embedded chunk</summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-muted">
                {info.indexedListing.chunkPreview}…
              </pre>
            </details>
          </div>
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
      </section>

      {/* Conversation */}
      <section className="space-y-3 mb-4">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div
              className={`inline-block max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-brand text-white'
                  : 'bg-canvas border border-line text-ink'
              }`}
            >
              <p className="whitespace-pre-line">{m.content}</p>
              {m.retrieved && m.retrieved.length > 0 && (
                <div className="mt-2 pt-2 border-t border-line/60 text-xs text-muted">
                  {m.retrieved.map((r, j) => (
                    <div key={j}>
                      retrieved: <span className="font-medium text-inkSoft">{r.title}</span>{' '}
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
      </section>

      {/* Input */}
      <form onSubmit={send} className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Ask about the indexed opportunity…"
          className="flex-1 rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-lg bg-accent text-white text-sm font-semibold px-4 py-2 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </main>
  )
}
