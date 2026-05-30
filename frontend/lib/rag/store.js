// The "vector store" for the prototype. To keep the first test cheap we index
// exactly ONE listing (the first active one) and cache its embedding in memory
// for the life of the server process. The retrieve() shape is already
// k-generalized, so swapping in the full corpus later is a small change:
// embed every listing at build time, load the vectors here, and search them.

import fs from 'node:fs'
import path from 'node:path'
import { embed } from './openai'

// Source file we pull the single test listing from.
const DATA_FILE = 'public/data/volops_garland.json'

let _cache = null // { listing, text, vector }

// Turn a listing into the text we actually embed. We fold in the fields that
// carry meaning (title, org, city, causes, description) so semantically
// similar queries land near it.
function buildChunk(o) {
  const tags = (o.unified_tags?.length ? o.unified_tags : o.cause_tags) || []
  return [
    o.opportunity_title,
    o.org_name && `Organization: ${o.org_name}`,
    o.address?.city && `Location: ${o.address.city}`,
    tags.length && `Causes: ${tags.join(', ')}`,
    o.description_long || o.description_short,
  ]
    .filter(Boolean)
    .join('\n')
}

function firstListing() {
  const raw = fs.readFileSync(path.join(process.cwd(), DATA_FILE), 'utf8')
  const arr = JSON.parse(raw)
  return arr.find(r => r.status !== 'inactive') || arr[0]
}

// Embed the single test listing once, then reuse it.
export async function getIndex() {
  if (_cache) return _cache
  const listing = firstListing()
  const text = buildChunk(listing)
  const vector = await embed(text)
  _cache = { listing, text, vector }
  return _cache
}

// Cosine similarity between two equal-length vectors.
export function cosine(a, b) {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

// Score the (currently single) indexed listing against a query vector and
// return the top-k. With a full index this becomes a loop over all vectors.
export async function retrieve(queryVector, k = 1) {
  const idx = await getIndex()
  const scored = [
    { listing: idx.listing, text: idx.text, score: cosine(queryVector, idx.vector) },
  ]
  return scored.sort((a, b) => b.score - a.score).slice(0, k)
}
