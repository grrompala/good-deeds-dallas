// store.js — the vector store for Smart Search, backed by Supabase (pgvector).
//
// The corpus (every Texas-area listing + each derived organization) is embedded
// offline by scripts/build-rag-index.mjs and stored in the `opportunities`
// table. At request time we only embed the user's query, then let Postgres find
// the nearest rows via the match_opportunities() function (HNSW index).
//
// retrieve() returns the same { type, item, text, score } shape the route/UI
// already expect, so swapping the backing store didn't touch anything upstream.

import { RAG_CONFIG } from './config.js'
import { supa } from './supabase.js'

// Nearest-neighbour search. `type` optionally restricts to 'listing' /
// 'organization'; null returns all types.
export async function retrieve(queryVector, k = RAG_CONFIG.topK, type = null) {
  const { data, error } = await supa().rpc('match_opportunities', {
    query_embedding: queryVector,
    match_count: k,
    filter_type: type,
  })
  if (error) throw new Error(`match_opportunities failed: ${error.message}`)
  return (data || []).map(r => ({
    type: r.type,
    item: r.item,
    text: r.content,
    score: r.score,
  }))
}

// One call to the hybrid_search RPC (vector + full-text, RRF-fused) with a set
// of structured filters. queryText drives the lexical half; filters is the
// object from parseQuery (city / causes / virtual / date_start / date_end).
async function hybridOnce(queryVector, queryText, filters, k, today) {
  const { data, error } = await supa().rpc('hybrid_search', {
    query_embedding: queryVector,
    query_text: queryText,
    filter_type: 'listing',
    filter_city: filters.city ?? null,
    filter_causes: filters.causes?.length ? filters.causes : null,
    filter_virtual: filters.virtual ?? null,
    date_start: filters.date_start ?? null,
    date_end: filters.date_end ?? null,
    today: today ?? null,
    match_count: k,
  })
  if (error) throw new Error(`hybrid_search failed: ${error.message}`)
  return (data || []).map(r => ({ type: r.type, item: r.item, text: r.content, score: r.score }))
}

// Hybrid retrieve with graceful filter relaxation. Structured filters are great
// until they're too strict and return almost nothing (an over-eager city guess,
// a narrow date window). So we try the full filter set, and if it comes back
// thin we peel filters off in order of "most likely to be wrong / least likely
// to be a hard requirement" — dropping the date window first, then city — and
// finally fall back to pure semantic. Causes and virtual are kept longest
// because they're usually the actual intent. Returns { hits, applied }.
export async function hybridRetrieve(queryVector, queryText, filters, {
  k = RAG_CONFIG.topK,
  today = null,
  minResults = 3,
} = {}) {
  const ladder = [
    filters,
    { ...filters, date_start: null, date_end: null },        // drop the date window
    { ...filters, date_start: null, date_end: null, city: null }, // then the city
    { city: null, causes: [], virtual: null, date_start: null, date_end: null }, // pure semantic
  ]

  const sig = f => JSON.stringify([f.city ?? null, [...(f.causes || [])].sort(), f.virtual ?? null, f.date_start ?? null, f.date_end ?? null])
  const seen = new Set()
  let last = []
  let lastFilter = ladder[ladder.length - 1]
  try {
    for (const f of ladder) {
      const s = sig(f)
      if (seen.has(s)) continue   // skip a rung that's identical to one already tried
      seen.add(s)
      const hits = await hybridOnce(queryVector, queryText, f, k, today)
      last = hits
      lastFilter = f
      if (hits.length >= minResults) return { hits, applied: f }
    }
    return { hits: last, applied: lastFilter }
  } catch (e) {
    // The DB migration (structured columns + hybrid_search RPC) may not be
    // applied yet — fall back to the original pure-vector path so Smart Search
    // keeps working, unfiltered, until the schema + reindex land.
    const hits = await retrieve(queryVector, k, 'listing')
    return { hits, applied: { fallback: 'vector-only', error: String(e?.message || e) } }
  }
}

// Summary for the GET endpoint / UI: how many rows are indexed, by type.
export async function indexSummary() {
  const client = supa()
  const { count, error } = await client
    .from('opportunities')
    .select('*', { count: 'exact', head: true })
  if (error) throw new Error(`index summary failed: ${error.message}`)

  const byType = {}
  for (const t of ['listing', 'organization']) {
    const { count: c } = await client
      .from('opportunities')
      .select('*', { count: 'exact', head: true })
      .eq('type', t)
    if (c) byType[t] = c
  }

  return { total: count || 0, byType, models: RAG_CONFIG }
}
