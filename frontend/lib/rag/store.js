// The "vector store" for the prototype.
//
// We are NOT embedding the full corpus yet — opportunity descriptions still
// need cleanup first. To have something that *technically works* end-to-end
// across every domain the real search will cover, we seed a tiny multi-domain
// index: ~2 entries each from listings, chatter (Reddit), and organizations.
// Each entry is tagged with a `type` so the UI can show where a hit came from.
//
// Embeddings are still computed lazily on first request and cached in memory
// for the life of the server process (cheap at ~6 entries). At scale this whole
// file is replaced by a precomputed index.json loaded from disk — but the
// buildChunk / cosine / retrieve interface below stays the same.

import fs from 'node:fs'
import path from 'node:path'
import { embed } from './openai'
import { RAG_CONFIG } from './config'

// How many seed entries to pull from each domain for the prototype.
const SEED_PER_DOMAIN = 2

const LISTINGS_FILE = 'public/data/volops_garland.json'
const CHATTER_FILE = 'public/data/reddit_raw.json'

let _cache = null // [{ type, ref, text, vector }, ...]

function readJson(file) {
  const raw = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
  return JSON.parse(raw)
}

// ── Chunk builders: turn a domain object into the text we embed ──────────────
function chunkListing(o) {
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

function chunkChatter(p) {
  return [
    `Community post: ${p.title}`,
    p.subreddit && `From: r/${p.subreddit}`,
    (p.body || '').slice(0, 1500),
  ]
    .filter(Boolean)
    .join('\n')
}

function chunkOrg(org) {
  return [
    `Organization: ${org.name}`,
    org.cities?.length && `Location: ${org.cities.join(', ')}`,
    org.causes?.length && `Causes: ${org.causes.join(', ')}`,
    org.count && `${org.count} listed opportunit${org.count === 1 ? 'y' : 'ies'}`,
  ]
    .filter(Boolean)
    .join('\n')
}

// Lightweight org derivation for the seed (mirrors components/orgs.js but kept
// server-side and dependency-free). Groups listings by org name.
function deriveOrgs(listings) {
  const byKey = new Map()
  for (const o of listings) {
    const name = (o.org_name || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (!byKey.has(key)) {
      byKey.set(key, { name, cities: new Set(), causes: new Set(), count: 0 })
    }
    const rec = byKey.get(key)
    rec.count += 1
    if (o.address?.city) rec.cities.add(o.address.city)
    const tags = (o.unified_tags?.length ? o.unified_tags : o.cause_tags) || []
    tags.forEach(t => rec.causes.add(t))
  }
  return [...byKey.values()].map(r => ({
    name: r.name,
    cities: [...r.cities],
    causes: [...r.causes],
    count: r.count,
  }))
}

// Build the seed set of entries (no embeddings yet — just text + metadata).
function buildSeedEntries() {
  const entries = []

  // Listings
  const listings = readJson(LISTINGS_FILE).filter(r => r.status !== 'inactive')
  for (const o of listings.slice(0, SEED_PER_DOMAIN)) {
    entries.push({
      type: 'listing',
      ref: { title: o.opportunity_title, org: o.org_name, city: o.address?.city || null },
      text: chunkListing(o),
    })
  }

  // Chatter (Reddit) — prefer posts with a body so the embedding has substance.
  const chatter = readJson(CHATTER_FILE).filter(p => (p.body || '').trim().length > 40)
  for (const p of chatter.slice(0, SEED_PER_DOMAIN)) {
    entries.push({
      type: 'chatter',
      ref: { title: p.title, subreddit: p.subreddit, url: p.source_url || null },
      text: chunkChatter(p),
    })
  }

  // Organizations — derived from the listings file.
  const orgs = deriveOrgs(listings)
  for (const org of orgs.slice(0, SEED_PER_DOMAIN)) {
    entries.push({
      type: 'organization',
      ref: { title: org.name, causes: org.causes.slice(0, 5) },
      text: chunkOrg(org),
    })
  }

  return entries
}

// Embed every seed entry once, then reuse for the life of the process.
export async function getIndex() {
  if (_cache) return _cache
  const seeds = buildSeedEntries()
  const vectors = await Promise.all(seeds.map(s => embed(s.text)))
  _cache = seeds.map((s, i) => ({ ...s, vector: vectors[i] }))
  return _cache
}

// A small summary of what's indexed — used by the GET endpoint / test bench.
export async function indexSummary() {
  const idx = await getIndex()
  const byType = {}
  for (const e of idx) byType[e.type] = (byType[e.type] || 0) + 1
  return {
    total: idx.length,
    byType,
    models: RAG_CONFIG,
    entries: idx.map(e => ({ type: e.type, title: e.ref.title })),
  }
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

// Score every indexed entry against a query vector and return the top-k.
export async function retrieve(queryVector, k = 1) {
  const idx = await getIndex()
  return idx
    .map(e => ({ type: e.type, ref: e.ref, text: e.text, score: cosine(queryVector, e.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}
