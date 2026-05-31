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
const DAILY_LIMIT = 5
// Pull enough that each domain (listings / orgs / chatter) can contribute a
// few cards. With the full corpus this is where you'd cap per-group instead.
const RETRIEVE_K = Math.max(RAG_CONFIG.topK, 12)

// Smart Search is focused on LISTINGS for now. We keep only listing hits,
// sorted best-match-first (cosine order). No score is surfaced to the client —
// the ORDER is the ranking. (Orgs/chatter are still indexed but not returned.)
function rankedListingHits(hits) {
  return hits
    .filter(h => h.type === 'listing')
    .sort((a, b) => b.score - a.score)
}

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
    return Response.json({ ...summary, dailyLimit: DAILY_LIMIT })
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

    // 2. Retrieve, then keep only listing hits, ranked best-match-first.
    const hits = await retrieve(queryVector, RETRIEVE_K)
    const listingHits = rankedListingHits(hits)
    const listings = listingHits.map(h => ({ item: h.item }))
    const context = listingHits
      .map((h, i) => `[${i + 1}] ${h.text}`)
      .join('\n\n')

    // 3. Build a grounded prompt and generate the answer. The cards still show
    // the closest listings even when nothing truly matches, so the answer is
    // what tells the user whether any are actually a good fit.
    const system = [
      'You are a helpful assistant for a Dallas-area volunteer website.',
      'Answer the user using ONLY the volunteer LISTINGS provided in CONTEXT.',
      'If none of the listings genuinely fit the request, say so plainly — e.g.',
      '"I could not find a strong match, but here are the closest listings" —',
      'and do not invent opportunities. Be concise and name the listings you cite.',
    ].join(' ')

    const user = `CONTEXT:\n${context}\n\nUSER QUESTION: ${query}`

    const answer = await chat([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ])

    // The prose `answer` and the ranked `listings` are two renderings of one
    // retrieval. We also echo the remaining quota and the daily limit.
    return Response.json({
      answer,
      remaining,
      limit: DAILY_LIMIT,
      listings,
    })
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
