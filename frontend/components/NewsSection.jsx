// NewsSection — Reddit feed pulled from local DFW subreddits, ranked by
// keyword relevance. Each post: subreddit + date eyebrow, title, body snippet,
// and engagement metadata.

import { useMemo, useState } from 'react'

export default function NewsSection({ data }) {
  const [activeSub, setActiveSub] = useState(null)

  const subs = useMemo(() => {
    const counts = new Map()
    data.forEach(p => counts.set(p.subreddit, (counts.get(p.subreddit) || 0) + 1))
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [data])

  const filtered = activeSub
    ? data.filter(p => p.subreddit === activeSub)
    : data

  return (
    <section id="news" className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-10 py-10 sm:py-12 lg:py-16">

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h2 className="text-h2 font-bold text-ink">From the community</h2>
          <p className="mt-1.5 text-base text-muted max-w-2xl">
            Volunteer-related chatter from local subreddits, ranked by how relevant
            we think the post is to volunteering in DFW.
          </p>
        </div>
        <div className="text-sm font-mono text-muted tabular-nums">
          {filtered.length} posts
        </div>
      </div>

      {/* Subreddit filter pills */}
      {subs.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mb-5 -mx-1 px-1">
          <SubPill label="All subs" active={!activeSub} onClick={() => setActiveSub(null)} />
          {subs.map(([sub, count]) => (
            <SubPill
              key={sub}
              label={`r/${sub}`}
              count={count}
              active={activeSub === sub}
              onClick={() => setActiveSub(sub)}
            />
          ))}
        </div>
      )}

      {/* Posts */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-line rounded-2xl py-16 text-center">
          <p className="text-base text-muted">No matching posts.</p>
        </div>
      ) : (
        <div className="bg-white border border-line rounded-2xl shadow-card divide-y divide-lineSoft overflow-hidden">
          {filtered.map(post => <NewsRow key={post.id} post={post} />)}
        </div>
      )}
    </section>
  )
}

function NewsRow({ post }) {
  const date = post.created_utc
    ? new Date(post.created_utc).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <a
      href={post.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block p-4 sm:p-5 lg:p-6 hover:bg-canvas transition-colors"
    >
      {/* Eyebrow */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs font-mono text-muted mb-2">
        <span className="font-semibold text-brand">r/{post.subreddit}</span>
        {date && <><span>·</span><span>{date}</span></>}
        {post.author && <><span>·</span><span>u/{post.author}</span></>}
      </div>

      {/* Title */}
      <h3 className="font-semibold text-base sm:text-lg text-ink leading-snug group-hover:text-brand transition-colors">
        {post.title}
      </h3>

      {/* Body snippet */}
      {post.body && (
        <p className="mt-2 text-sm sm:text-base text-inkSoft leading-relaxed line-clamp-2">
          {post.body.slice(0, 280)}{post.body.length > 280 ? '…' : ''}
        </p>
      )}

      {/* Metadata */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-muted">
        {post.score !== undefined && (
          <span className="inline-flex items-center gap-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {post.score}
          </span>
        )}
        {post.num_comments !== undefined && (
          <span className="inline-flex items-center gap-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {post.num_comments}
          </span>
        )}
        {post.relevance?.total !== undefined && (
          <span className="ml-auto inline-flex items-center gap-0.5 font-mono text-xs">
            <span className="text-accent">{'●'.repeat(Math.min(post.relevance.total, 5))}</span>
            <span className="text-subtle">{'○'.repeat(Math.max(5 - post.relevance.total, 0))}</span>
            <span className="text-muted ml-1.5 hidden sm:inline">relevance</span>
          </span>
        )}
      </div>
    </a>
  )
}

function SubPill({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`
        shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
        border transition-colors whitespace-nowrap
        ${active
          ? 'bg-brand text-white border-brand'
          : 'bg-white text-inkSoft border-line hover:border-brand/40 hover:text-brand'
        }
      `}
    >
      {label}
      {count !== undefined && (
        <span className={`font-mono text-xs ${active ? 'text-white/80' : 'text-subtle'}`}>
          {count}
        </span>
      )}
    </button>
  )
}
