// Supabase client for Smart Search — server-side only. Uses the SECRET key,
// which bypasses row-level security, so it must never be exposed to the browser
// (do NOT prefix these env vars with NEXT_PUBLIC).
//
// Used by both the offline indexer (build-rag-index.mjs) and the API route.

import { createClient } from '@supabase/supabase-js'

let _client = null

export function supa() {
  if (_client) return _client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_SECRET_KEY are not set. Add them to frontend/.env.local'
    )
  }
  _client = createClient(url, key, { auth: { persistSession: false } })
  return _client
}
