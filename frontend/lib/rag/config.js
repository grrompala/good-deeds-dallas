// RAG configuration — all model choices live here so they're easy to swap.
// Override any of these via frontend/.env.local without touching code
// (see .env.local.example). Defaults are the cheap "small + mini" pair.

export const RAG_CONFIG = {
  // Embedding model used for BOTH the listings and the user query. Query and
  // documents MUST use the same model or similarity scores are meaningless.
  embedModel: process.env.RAG_EMBED_MODEL || 'text-embedding-3-small',

  // Chat model that writes the final grounded answer.
  chatModel: process.env.RAG_CHAT_MODEL || 'gpt-4o-mini',

  // How many listings to retrieve and feed into the prompt. The prototype
  // only indexes one entry, so 1 is plenty for now.
  topK: Number(process.env.RAG_TOP_K || 1),
}
