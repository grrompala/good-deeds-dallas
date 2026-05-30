// tagMeta — visual presentation for each tag in the unified taxonomy.
// Each entry: a friendly emoji icon, a readable label, and Tailwind color
// classes for the chip background, text, and ring.
//
// To change the icon or color for a tag: edit the entry below.
// To add a new tag: add it to TAXONOMY in classify_listings.py AND add a
// matching entry here (otherwise it'll fall back to a neutral gray chip).

export const TAG_META = {
  seniors:         { icon: '👵', label: 'Seniors',         bg: 'bg-amber-50',     text: 'text-amber-800',     ring: 'ring-amber-200' },
  children:        { icon: '🧒', label: 'Children',        bg: 'bg-yellow-50',    text: 'text-yellow-800',    ring: 'ring-yellow-200' },
  food_security:   { icon: '🥖', label: 'Food security',   bg: 'bg-orange-50',    text: 'text-orange-800',    ring: 'ring-orange-200' },
  education:       { icon: '📚', label: 'Education',       bg: 'bg-blue-50',      text: 'text-blue-800',      ring: 'ring-blue-200' },
  animals:         { icon: '🐾', label: 'Animals',         bg: 'bg-lime-50',      text: 'text-lime-800',      ring: 'ring-lime-200' },
  environment:     { icon: '🌳', label: 'Environment',     bg: 'bg-emerald-50',   text: 'text-emerald-800',   ring: 'ring-emerald-200' },
  housing:         { icon: '🏠', label: 'Housing',         bg: 'bg-stone-50',     text: 'text-stone-800',     ring: 'ring-stone-200' },
  health:          { icon: '💊', label: 'Health',          bg: 'bg-rose-50',      text: 'text-rose-800',      ring: 'ring-rose-200' },
  legal:           { icon: '⚖️', label: 'Legal',           bg: 'bg-slate-50',     text: 'text-slate-800',     ring: 'ring-slate-200' },
  arts:            { icon: '🎨', label: 'Arts',            bg: 'bg-pink-50',      text: 'text-pink-800',      ring: 'ring-pink-200' },
  community:       { icon: '🤝', label: 'Community',       bg: 'bg-indigo-50',    text: 'text-indigo-800',    ring: 'ring-indigo-200' },
  crisis_support:  { icon: '🆘', label: 'Crisis support',  bg: 'bg-red-50',       text: 'text-red-800',       ring: 'ring-red-200' },
  foster_care:     { icon: '👨‍👩‍👧', label: 'Foster care', bg: 'bg-violet-50',    text: 'text-violet-800',    ring: 'ring-violet-200' },
  disabilities:    { icon: '♿', label: 'Disabilities',    bg: 'bg-teal-50',      text: 'text-teal-800',      ring: 'ring-teal-200' },
  mental_health:   { icon: '🧠', label: 'Mental health',   bg: 'bg-fuchsia-50',   text: 'text-fuchsia-800',   ring: 'ring-fuchsia-200' },
  immigration:     { icon: '🌍', label: 'Immigration',     bg: 'bg-cyan-50',      text: 'text-cyan-800',      ring: 'ring-cyan-200' },
  civic:           { icon: '🗳️', label: 'Civic',           bg: 'bg-sky-50',       text: 'text-sky-800',       ring: 'ring-sky-200' },
  veterans:        { icon: '🎖️', label: 'Veterans',        bg: 'bg-zinc-50',      text: 'text-zinc-800',      ring: 'ring-zinc-200' },
}

// Neutral fallback for any tag we don't have metadata for
const FALLBACK = { icon: '🏷️', label: '', bg: 'bg-slate-50', text: 'text-slate-700', ring: 'ring-slate-200' }

export function tagMeta(id) {
  const m = TAG_META[id]
  if (m) return m
  // Pretty-print an unknown tag: "some_thing" → "Some thing"
  const pretty = String(id || '').replace(/_/g, ' ')
  return { ...FALLBACK, label: pretty.charAt(0).toUpperCase() + pretty.slice(1) }
}
