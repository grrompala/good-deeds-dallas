// Minimal OpenAI client for the RAG prototype — just the two calls we need
// (embeddings + chat completion), via fetch so there's no extra dependency.
// Server-side only: it reads OPENAI_API_KEY, which must never be exposed to
// the browser.

import { RAG_CONFIG } from './config'

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
    body: JSON.stringify({ model, input: text }),
  })
  if (!res.ok) {
    throw new Error(`Embedding request failed (${res.status}): ${await res.text()}`)
  }
  const json = await res.json()
  return json.data[0].embedding
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
