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

-- ── Structured filtering + hybrid (vector + full-text) search ────────────────
-- Smart Search v2. The query parser (lib/rag/parseQuery.js) turns a natural
-- question into structured filters (city, causes, virtual, a date window); we
-- apply those as SQL WHERE clauses so "food pantry in Plano in July" actually
-- filters instead of hoping the embedding captured "Plano"/"July". Retrieval
-- then fuses semantic (vector) and lexical (full-text) rankings via Reciprocal
-- Rank Fusion, so exact tokens (org names, "ESL", ZIPs) aren't washed out by a
-- 256-dim embedding.
--
-- Populated by scripts/build-rag-index.mjs from corpus.js listingMeta(). Run
-- these ALTERs (they're idempotent) then re-run the indexer.

alter table opportunities add column if not exists city        text;
alter table opportunities add column if not exists causes      text[];
alter table opportunities add column if not exists is_virtual  boolean;
alter table opportunities add column if not exists event_date  date;   -- one-time event date; null = not date-bound
-- Generated full-text vector over the (already structured) embedded content.
alter table opportunities add column if not exists content_tsv tsvector
  generated always as (to_tsvector('english', coalesce(content, ''))) stored;

create index if not exists opportunities_tsv_idx        on opportunities using gin (content_tsv);
create index if not exists opportunities_causes_idx     on opportunities using gin (causes);
create index if not exists opportunities_city_idx       on opportunities (lower(city));
create index if not exists opportunities_event_date_idx on opportunities (event_date);

-- Hybrid retrieval with metadata filtering, in one round trip.
--   • base   — rows surviving the structured filters
--   • vec    — base ranked by cosine similarity (semantic)
--   • fts    — base ranked by full-text relevance (lexical)
--   • fused  — RRF: score = Σ 1/(rrf_k + rank) across the two lists
-- Filter semantics: a NULL filter is "no constraint". Rows that aren't
-- date-bound (event_date is null) always satisfy a date window; a dated row
-- must fall inside it, and a past one-time event is never returned.
create or replace function hybrid_search(
  query_embedding vector(256),
  query_text      text,
  filter_type     text    default 'listing',
  filter_city     text    default null,
  filter_causes   text[]  default null,
  filter_virtual  boolean default null,
  date_start      date    default null,
  date_end        date    default null,
  today           date    default null,
  match_count     int     default 16,
  pool            int     default 120,
  rrf_k           int     default 60
)
returns table (id text, type text, item jsonb, content text, score float)
language sql stable
as $$
  with base as (
    select o.id, o.type, o.item, o.content, o.embedding, o.content_tsv
    from opportunities o
    where (filter_type    is null or o.type = filter_type)
      and (filter_city    is null or lower(o.city) = lower(filter_city))
      and (filter_causes  is null or o.causes && filter_causes)
      and (filter_virtual is null or o.is_virtual = filter_virtual)
      and (
        (date_start is null and date_end is null)
        or o.event_date is null
        or (o.event_date >= coalesce(date_start, o.event_date)
            and o.event_date <= coalesce(date_end, o.event_date))
      )
      and (today is null or o.event_date is null or o.event_date >= today)
  ),
  vec as (
    select id, row_number() over (order by embedding <=> query_embedding) as rank
    from base
    order by embedding <=> query_embedding
    limit pool
  ),
  fts as (
    select id, row_number() over (
             order by ts_rank(content_tsv, websearch_to_tsquery('english', query_text)) desc
           ) as rank
    from base
    where query_text is not null and query_text <> ''
      and content_tsv @@ websearch_to_tsquery('english', query_text)
    order by ts_rank(content_tsv, websearch_to_tsquery('english', query_text)) desc
    limit pool
  ),
  fused as (
    select coalesce(vec.id, fts.id) as id,
           coalesce(1.0 / (rrf_k + vec.rank), 0.0)
             + coalesce(1.0 / (rrf_k + fts.rank), 0.0) as score
    from vec
    full outer join fts on vec.id = fts.id
  )
  select b.id, b.type, b.item, b.content, f.score
  from fused f
  join base b on b.id = f.id
  order by f.score desc
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
