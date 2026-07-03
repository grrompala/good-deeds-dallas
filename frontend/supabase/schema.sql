-- Smart Search schema for Supabase (Postgres + pgvector).
-- Run this once in the Supabase dashboard: SQL Editor → paste → Run.
--
-- The vector(256) size MUST match RAG_EMBED_DIMS in .env.local (default 256).
-- If you change the embedding dimensions, change it here too and re-run.

-- 1. Enable pgvector (no-op if already enabled).
create extension if not exists vector;

-- 2. The corpus table: one row per embedded listing / organization.
create table if not exists opportunities (
  id        text primary key,        -- listing id, or "org:<key>"
  type      text not null,           -- 'listing' | 'organization'
  item      jsonb not null,          -- the full source object (rendered as a card)
  content   text not null,           -- the chunk of text we embedded
  embedding vector(256)
);

-- 3. Approximate-nearest-neighbour index (cosine). Makes search fast as the
--    table grows. HNSW is built for high-recall ANN.
create index if not exists opportunities_embedding_idx
  on opportunities using hnsw (embedding vector_cosine_ops);

create index if not exists opportunities_type_idx
  on opportunities (type);

-- 4. Similarity search RPC. Returns the closest rows (optionally filtered by
--    type), with a cosine similarity score in [0,1] (1 = identical direction).
create or replace function match_opportunities(
  query_embedding vector(256),
  match_count int default 8,
  filter_type text default null
)
returns table (id text, type text, item jsonb, content text, score float)
language sql stable
as $$
  select
    o.id,
    o.type,
    o.item,
    o.content,
    1 - (o.embedding <=> query_embedding) as score
  from opportunities o
  where filter_type is null or o.type = filter_type
  order by o.embedding <=> query_embedding
  limit match_count;
$$;

-- ── Smart Search rate limiting ───────────────────────────────────────────────
-- Durable quota store shared across all serverless instances (the in-memory
-- counter in route.js only limited within one warm instance). One row per
-- allowed search; limits use a rolling 24-hour window.
--
-- ip_hash is a SHA-256 of the client IP (hashed in route.js) — no raw
-- addresses are stored. Leave RLS on with no policies, same as opportunities:
-- only the server's secret key can touch it.

create table if not exists search_log (
  id         bigint generated always as identity primary key,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);

alter table search_log enable row level security;

create index if not exists search_log_ip_time_idx on search_log (ip_hash, created_at);
create index if not exists search_log_time_idx    on search_log (created_at);

-- Atomically: check the global limit, check the per-IP limit, and (only if
-- both pass) record the search. The advisory lock serializes concurrent calls
-- so parallel requests can't double-spend; at this volume that's free.
create or replace function check_search_quota(
  client_ip_hash text,
  ip_limit int default 5,
  global_limit int default 50
)
returns jsonb
language plpgsql
as $$
declare
  ip_count int;
  global_count int;
begin
  perform pg_advisory_xact_lock(hashtext('search_quota'));

  -- Opportunistic cleanup: drop rows too old to ever matter again.
  delete from search_log where created_at < now() - interval '48 hours';

  select count(*) into global_count
  from search_log
  where created_at > now() - interval '24 hours';

  if global_count >= global_limit then
    return jsonb_build_object('allowed', false, 'reason', 'global', 'remaining', 0);
  end if;

  select count(*) into ip_count
  from search_log
  where ip_hash = client_ip_hash
    and created_at > now() - interval '24 hours';

  if ip_count >= ip_limit then
    return jsonb_build_object('allowed', false, 'reason', 'ip', 'remaining', 0);
  end if;

  insert into search_log (ip_hash) values (client_ip_hash);
  return jsonb_build_object('allowed', true, 'reason', null,
                            'remaining', ip_limit - ip_count - 1);
end;
$$;
