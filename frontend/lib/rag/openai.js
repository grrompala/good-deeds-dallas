// Minimal OpenAI client for the RAG prototype — just the two calls we need
// (embeddings + chat completion), via fetch so there's no extra dependency.
// Server-side only: it reads OPENAI_API_KEY, which must never be exposed to
// the browser.

import { RAG_CONFIG } from './config.js'

const OPENAI_URL = 'https://api.openai.com/v1'

function apiKey() {
  const k = process.env.OPENAI_API_KEY
  if (!k) {
    throw new Error('OPENAI_API_KEY is not set. Add it to frontend/.env.local')
  }
  return k
}

// Embed a single string -> number[] (the vector).
export async function embed(text, model = RAG_CONFIG.embedModel) {
  const res = await fetch(`${OPENAI_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({ model, input: text, dimensions: RAG_CONFIG.embedDimensions }),
  })
  if (!res.ok) {
    throw new Error(`Embedding request failed (${res.status}): ${await res.text()}`)
  }
  const json = await res.json()
  return json.data[0].embedding
}

// Embed an ARRAY of strings in one request -> number[][] (vectors, in order).
// Used by the offline indexer to embed the whole corpus efficiently.
export async function embedBatch(texts, model = RAG_CONFIG.embedModel) {
  const res = await fetch(`${OPENAI_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({ model, input: texts, dimensions: RAG_CONFIG.embedDimensions }),
  })
  if (!res.ok) {
    throw new Error(`Batch embedding failed (${res.status}): ${await res.text()}`)
  }
  const json = await res.json()
  // The API may return results out of order; sort by index to be safe.
  return json.data.sort((a, b) => a.index - b.index).map(d => d.embedding)
}

// Run a chat completion. `messages` is the standard [{role, content}] array.
export async function chat(messages, model = RAG_CONFIG.chatModel) {
  const res = await fetch(`${OPENAI_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.2 }),
  })
  if (!res.ok) {
    throw new Error(`Chat request failed (${res.status}): ${await res.text()}`)
  }
  const json = await res.json()
  return json.choices[0].message.content
}
