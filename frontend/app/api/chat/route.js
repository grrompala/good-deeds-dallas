// /api/chat — the RAG endpoint for the prototype.
//   GET  -> shows which single listing is currently indexed (handy for the
//           test page so you can tailor a query to it).
//   POST -> { query } : embed the query, retrieve the closest listing(s),
//           build a grounded prompt, and return the LLM's answer.
//
// Runs on the Node runtime because store.js reads a data file from disk.

import { embed, chat } from '../../../lib/rag/openai'
import { retrieve, getIndex } from '../../../lib/rag/store'
import { RAG_CONFIG } from '../../../lib/rag/config'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const idx = await getIndex()
    return Response.json({
      models: RAG_CONFIG,
      indexedListing: {
        title: idx.listing.opportunity_title,
        org: idx.listing.org_name,
        chunkPreview: idx.text.slice(0, 500),
      },
    })
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const { query } = await request.json()
    if (!query || !query.trim()) {
      return Response.json({ error: 'Empty query' }, { status: 400 })
    }

    // 1. Embed the question with the SAME model used for the listing.
    const queryVector = await embed(query)

    // 2. Retrieve the closest listing(s).
    const hits = await retrieve(queryVector, RAG_CONFIG.topK)
    const context = hits.map((h, i) => `[${i + 1}] ${h.text}`).join('\n\n')

    // 3. Build a grounded prompt and generate the answer.
    const system = [
      'You are a helpful assistant for a Dallas-area volunteer-opportunity website.',
      'Answer the user using ONLY the volunteer listings provided in CONTEXT.',
      'If the context has no relevant opportunity, say you could not find a match —',
      'do not invent listings. Be concise and name the organization and opportunity.',
    ].join(' ')

    const user = `CONTEXT:\n${context}\n\nUSER QUESTION: ${query}`

    const answer = await chat([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ])

    return Response.json({
      answer,
      retrieved: hits.map(h => ({
        score: Number(h.score.toFixed(4)),
        title: h.listing.opportunity_title,
        org: h.listing.org_name,
      })),
    })
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
