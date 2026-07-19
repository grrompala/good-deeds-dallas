// /api/chat — the RAG endpoint behind "Advanced Search".
//   GET  -> summary of what's currently indexed (types + counts + models).
//   POST -> { query } : embed the query, retrieve the closest entries across
//           listings / chatter / organizations, build a grounded prompt, and
//           return the LLM's answer plus what was retrieved.
//
// Runs on the Node runtime because store.js reads data files from disk.
//
// Guardrails:
//   • Query length cap so a user can't paste a novel and run up token cost.
//   • Durable rate limiting via Supabase (check_search_quota RPC): a rolling
//     24-hour window with a per-IP limit and a global limit, shared across
//     all serverless instances. IPs are SHA-256-hashed before they leave
//     this process, so no raw addresses are stored.

import { createHash } from 'node:crypto'
import { embed, chat } from '../../../lib/rag/openai'
import { retrieve, indexSummary } from '../../../lib/rag/store'
import { RAG_CONFIG } from '../../../lib/rag/config'
import { supa } from '../../../lib/rag/supabase'

export const runtime = 'nodejs'

// ── Guardrail config ─────────────────────────────────────────────────────────
const MAX_QUERY_CHARS = 300
const DAILY_LIMIT = Number(process.env.SEARCH_IP_LIMIT || 5)       // per IP / 24h
const GLOBAL_LIMIT = Number(process.env.SEARCH_GLOBAL_LIMIT || 50) // all users / 24h
// Pull enough candidates that the LLM screen (below) has real choices —
// unpicked ones are hidden, so over-retrieving is cheap and harmless.
const RETRIEVE_K = Math.max(RAG_CONFIG.topK, 16)

// Smart Search is focused on LISTINGS for now. We keep only listing hits,
// sorted best-match-first (cosine order). No score is surfaced to the client —
// the ORDER is the ranking. (Orgs/chatter are still indexed but not returned.)
function rankedListingHits(hits) {
  return hits
    .filter(h => h.type === 'listing')
    .sort((a, b) => b.score - a.score)
}

// Parse the model's JSON envelope {answer, picks}. Defensive by design: strip
// code fences if the model added them, validate picks are in-range CONTEXT
// numbers, and on any failure fall back to treating the whole reply as prose
// with no screening (cosine order, all cards) — a parse hiccup must never
// blank the answer or the card list.
function parseAnswerEnvelope(raw, listingCount) {
  let text = String(raw || '').trim()
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fence) text = fence[1].trim()
  try {
    const obj = JSON.parse(text)
    if (typeof obj?.answer === 'string' && obj.answer.trim()) {
      const picks = Array.isArray(obj.picks)
        ? [...new Set(obj.picks.map(Number))].filter(
            n => Number.isInteger(n) && n >= 1 && n <= listingCount
          )
        : []
      return { answer: obj.answer, picks }
    }
  } catch {
    // fall through to the plain-text fallback
  }
  return { answer: String(raw || ''), picks: [] }
}

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

// Durable check-and-count in Supabase (see check_search_quota in schema.sql).
// One round-trip: verifies the global limit, then the per-IP limit, and
// records the search only if both pass.
async function checkAndCount(ip) {
  const ipHash = createHash('sha256').update(ip).digest('hex')
  const { data, error } = await supa().rpc('check_search_quota', {
    client_ip_hash: ipHash,
    ip_limit: DAILY_LIMIT,
    global_limit: GLOBAL_LIMIT,
  })
  if (error) throw new Error(`Rate-limit check failed: ${error.message}`)
  return { ok: data.allowed, reason: data.reason, remaining: data.remaining }
}

export async function GET(request) {
  try {
    const summary = await indexSummary()

    // Read-only peek at this caller's remaining quota so the UI shows the
    // real count on mount. A plain count on search_log — no insert, so
    // checking never consumes a search.
    let remaining = null
    try {
      const ipHash = createHash('sha256').update(clientIp(request)).digest('hex')
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count, error } = await supa()
        .from('search_log')
        .select('*', { count: 'exact', head: true })
        .eq('ip_hash', ipHash)
        .gt('created_at', since)
      if (!error && typeof count === 'number') {
        remaining = Math.max(0, DAILY_LIMIT - count)
      }
    } catch {
      // quota peek is best-effort — the summary is still useful without it
    }

    return Response.json({ ...summary, dailyLimit: DAILY_LIMIT, remaining })
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
    const { ok, reason, remaining } = await checkAndCount(ip)
    if (!ok) {
      const message = reason === 'global'
        ? 'Smart Search is taking a breather — the sitewide daily search limit was reached. Try again later.'
        : `Daily limit of ${DAILY_LIMIT} searches reached. Try again tomorrow.`
      return Response.json({ error: message }, { status: 429 })
    }

    // 1. Embed the question with the SAME model used for the entries.
    const queryVector = await embed(query)

    // 2. Retrieve the closest LISTINGS (filtered + ranked in Postgres).
    const hits = await retrieve(queryVector, RETRIEVE_K, 'listing')
    const listingHits = rankedListingHits(hits)
    const context = listingHits
      .map((h, i) => `[${i + 1}] ${h.text}`)
      .join('\n\n')

    // 3. Build a grounded prompt and generate the answer. The cards still show
    // the closest listings even when nothing truly matches, so the answer is
    // what tells the user whether any are actually a good fit.
    const system = [
      'You are a helpful assistant for a Dallas-area volunteer website.',
      'Recommend volunteer opportunities using ONLY the LISTINGS provided in',
      'CONTEXT; never invent opportunities.',
      'Tone: factual and practical. No marketing language, no exclamation',
      'marks, no phrases like "excellent opportunity" or "make a meaningful',
      'difference". Do not open with a disclaimer about match quality either —',
      'lead with the best available options, and if the fit is only partial,',
      'say so plainly in one short closing note.',
      'When you mention more than one opportunity, format them as a numbered',
      'list with each item on its own line: the opportunity name and',
      'organization in **bold**, then one short factual sentence on what the',
      'role involves. Do NOT use bracketed reference numbers like [1] in the',
      'prose — the user cannot see those numbers.',
      'Return ONLY a JSON object (no code fences) shaped exactly like:',
      '{"answer": "<your answer; may contain markdown bold and numbered',
      'lines>", "picks": [<the CONTEXT numbers of the listings that genuinely',
      'fit the request, best first, e.g. [4, 1, 9]>]}',
      'Include a listing in picks only if it actually serves the request — a',
      'location match alone is not enough. picks may be empty.',
    ].join(' ')

    const user = `CONTEXT:\n${context}\n\nUSER QUESTION: ${query}`

    const raw = await chat([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ])

    // Screen the cards with the model's picks: chosen listings in the LLM's
    // order; everything else hidden. Empty/invalid picks -> cosine order.
    const { answer, picks } = parseAnswerEnvelope(raw, listingHits.length)
    const chosen = picks.length
      ? picks.map(n => listingHits[n - 1])
      : listingHits
    const screenedListings = chosen.map(h => ({ item: h.item }))

    // The prose `answer` and the screened `listings` are two renderings of one
    // retrieval. We also echo the remaining quota and the daily limit.
    return Response.json({
      answer,
      remaining,
      limit: DAILY_LIMIT,
      listings: screenedListings,
    })
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
