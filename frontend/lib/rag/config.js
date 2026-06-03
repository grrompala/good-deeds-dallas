// RAG configuration — all model choices live here so they're easy to swap.
// Override any of these via frontend/.env.local without touching code
// (see .env.local.example). Defaults are the cheap "small + mini" pair.

export const RAG_CONFIG = {
  // Embedding model used for BOTH the documents and the user query. Query and
  // documents MUST use the same model + dimensions or similarity is meaningless.
  embedModel: process.env.RAG_EMBED_MODEL || 'text-embedding-3-small',

  // Embedding output size. text-embedding-3-* can be shortened via the API's
  // `dimensions` param — 256 keeps the index small and cheap with negligible
  // recall loss at our scale. MUST match the vector(N) column in Supabase.
  embedDimensions: Number(process.env.RAG_EMBED_DIMS || 256),

  // Chat model that writes the final grounded answer.
  chatModel: process.env.RAG_CHAT_MODEL || 'gpt-4o-mini',

  // How many results to retrieve and feed into the prompt.
  topK: Number(process.env.RAG_TOP_K || 8),
}
