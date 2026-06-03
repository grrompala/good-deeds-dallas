// build-rag-index.mjs — offline indexer for Smart Search.
//
// Reads every Texas-area listing + derived organization, embeds each with the
// configured embedding model, and UPSERTS the vectors into Supabase (pgvector).
// Re-run whenever the listings change or you switch embedding models/dimensions.
//
// Usage (from the frontend/ directory):
//     node scripts/build-rag-index.mjs
//
// Requires in .env.local (auto-loaded below):
//     OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY
// And the schema must already exist (run supabase/schema.sql once in the
// Supabase SQL editor).

import fs from 'node:fs'
import path from 'node:path'

// ── Load .env.local (simple parser; no dependency) ───────────────────────────
try {
  const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
  }
} catch {
  // no .env.local — rely on the inline/exported environment
}

const { buildCorpusEntries } = await import('../lib/rag/corpus.js')
const { embedBatch } = await import('../lib/rag/openai.js')
const { RAG_CONFIG } = await import('../lib/rag/config.js')
const { supa } = await import('../lib/rag/supabase.js')

const BATCH = 128

// Stable primary key for a corpus entry.
function rowId(entry) {
  if (entry.type === 'listing') return entry.item.id || `listing:${entry.item.opportunity_title}`
  return `org:${entry.item.key}`
}

async function main() {
  const entries = buildCorpusEntries()
  const byType = entries.reduce((m, e) => ((m[e.type] = (m[e.type] || 0) + 1), m), {})
  console.log(
    `Indexing ${entries.length} entries`,
    `(${Object.entries(byType).map(([t, n]) => `${n} ${t}`).join(', ')})`,
    `with ${RAG_CONFIG.embedModel} @ ${RAG_CONFIG.embedDimensions} dims`
  )

  const client = supa()

  // Clear out the old corpus so removed listings don't linger. (Simpler than
  // diffing; the table is small.)
  const { error: delErr } = await client.from('opportunities').delete().neq('id', '')
  if (delErr) throw new Error(`Clearing table failed: ${delErr.message}`)

  let done = 0
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH)
    const vectors = await embedBatch(batch.map(e => e.text))
    const rows = batch.map((e, j) => ({
      id: rowId(e),
      type: e.type,
      item: e.item,
      content: e.text,
      embedding: vectors[j],
    }))
    const { error } = await client.from('opportunities').upsert(rows)
    if (error) throw new Error(`Upsert failed at batch ${i}: ${error.message}`)
    done += rows.length
    console.log(`  upserted ${done}/${entries.length}`)
  }

  console.log(`\nDone. ${done} rows in Supabase (${RAG_CONFIG.embedDimensions} dims).`)
}

main().catch(err => {
  console.error('\nIndex build failed:', err.message)
  process.exit(1)
})
