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
