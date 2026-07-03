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
      'and do not invent opportunities. Be concise and refer to opportunities by',
      'their name and organization. Do NOT use bracketed reference numbers like',
      '[1] or [5] — the user cannot see those numbers.',
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
