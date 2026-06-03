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
