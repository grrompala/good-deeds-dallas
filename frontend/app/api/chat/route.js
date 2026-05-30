// /api/chat — the RAG endpoint behind "Advanced Search".
//   GET  -> summary of what's currently indexed (types + counts + models).
//   POST -> { query } : embed the query, retrieve the closest entries across
//           listings / chatter / organizations, build a grounded prompt, and
//           return the LLM's answer plus what was retrieved.
//
// Runs on the Node runtime because store.js reads data files from disk.
//
// Guardrails (best-effort, prototype-grade):
//   • Query length cap so a user can't paste a novel and run up token cost.
//   • A soft per-client daily quota keyed by IP. NOTE: serverless instances
//     don't share memory, so this only limits within a single warm instance —
//     it is a speed bump, not a real quota. A durable limit needs a shared
//     store (KV/Redis). Good enough to keep casual abuse down for now.

import { embed, chat } from '../../../lib/rag/openai'
import { retrieve, indexSummary } from '../../../lib/rag/store'
import { RAG_CONFIG } from '../../../lib/rag/config'

export const runtime = 'nodejs'

// ── Guardrail config ─────────────────────────────────────────────────────────
const MAX_QUERY_CHARS = 300
const DAILY_LIMIT = 100
const RETRIEVE_K = Math.max(RAG_CONFIG.topK, 4) // pull a few so domains can mix

// Per-IP counters: ip -> { day: 'YYYY-MM-DD', count }. Module-level, so it
// lives only as long as this warm serverless instance.
const _quota = new Map()

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

// Returns { ok, remaining } and increments on success.
function checkAndCount(ip) {
  const today = new Date().toISOString().slice(0, 10)
  const rec = _quota.get(ip)
  if (!rec || rec.day !== today) {
    _quota.set(ip, { day: today, count: 1 })
    return { ok: true, remaining: DAILY_LIMIT - 1 }
  }
  if (rec.count >= DAILY_LIMIT) return { ok: false, remaining: 0 }
  rec.count += 1
  return { ok: true, remaining: DAILY_LIMIT - rec.count }
}

export async function GET() {
  try {
    const summary = await indexSummary()
    return Response.json(summary)
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const { query } = await request.json()

    // ── Validate input ──────────────────────────────────────────────────────
    if (!query || !query.trim()) {
      return Response.json({ error: 'Empty query' }, { status: 400 })
    }
    if (query.length > MAX_QUERY_CHARS) {
      return Response.json(
        { error: `Query too long (max ${MAX_QUERY_CHARS} characters).` },
        { status: 400 }
      )
    }

    // ── Rate limit ──────────────────────────────────────────────────────────
    const ip = clientIp(request)
    const { ok, remaining } = checkAndCount(ip)
    if (!ok) {
      return Response.json(
        { error: `Daily limit of ${DAILY_LIMIT} searches reached. Try again tomorrow.` },
        { status: 429 }
      )
    }

    // 1. Embed the question with the SAME model used for the entries.
    const queryVector = await embed(query)

    // 2. Retrieve the closest entries across all domains.
    const hits = await retrieve(queryVector, RETRIEVE_K)
    const context = hits
      .map((h, i) => `[${i + 1}] (${h.type}) ${h.text}`)
      .join('\n\n')

    // 3. Build a grounded prompt and generate the answer.
    const system = [
      'You are a helpful assistant for a Dallas-area volunteer website.',
      'Answer the user using ONLY the items provided in CONTEXT, which may be',
      'volunteer listings, organizations, or community (Reddit) posts.',
      'If the context has no relevant item, say you could not find a match —',
      'do not invent anything. Be concise and name the organization, opportunity,',
      'or post you are drawing from.',
    ].join(' ')

    const user = `CONTEXT:\n${context}\n\nUSER QUESTION: ${query}`

    const answer = await chat([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ])

    return Response.json({
      answer,
      remaining,
      retrieved: hits.map(h => ({
        type: h.type,
        score: Number(h.score.toFixed(4)),
        title: h.ref.title,
        org: h.ref.org || null,
      })),
    })
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
