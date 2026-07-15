// TagChip — colored tag pill.
// Two visual modes:
//   variant="chip"   — read-only on a card. Uses the tag's signature color.
//   variant="filter" — clickable filter. Neutral white bg (matches Site pills),
//                       icon provides the color. Selected = dark ink.

import { tagMeta } from './tagMeta'

export default function TagChip({ id, count, active, onClick, href, variant = 'chip', size = 'sm' }) {
  const m = tagMeta(id)
  const px = size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'

  if (variant === 'filter') {
    // With `href` the chip is a real link (crawlable + navigates); with
    // `onClick` it's a filter button. Same appearance either way.
    const className = `
      inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
      border transition-colors whitespace-nowrap
      ${active
        ? 'bg-brand text-white border-brand'
        : 'bg-white text-inkSoft border-line hover:border-brand/40 hover:text-brand'
      }
    `
    const body = (
      <>
        <span aria-hidden>{m.icon}</span>
        <span>{m.label}</span>
        {count !== undefined && (
          <span className={`font-mono text-xs ${active ? 'text-white/75' : 'text-subtle'}`}>
            {count}
          </span>
        )}
      </>
    )
    if (href) {
      return <a href={href} className={className}>{body}</a>
    }
    return (
      <button onClick={onClick} className={className}>
        {body}
      </button>
    )
  }

  // Default: read-only chip on a card — keeps the tag's signature color
  return (
    <span className={`inline-flex items-center gap-1 ${px} rounded-full font-medium ${m.bg} ${m.text}`}>
      <span aria-hidden>{m.icon}</span>
      <span>{m.label}</span>
    </span>
  )
}
