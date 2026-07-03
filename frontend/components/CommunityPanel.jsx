// CommunityPanel — Reddit feed from local DFW subreddits.
// `compact` mode shows the top 8 posts with no subreddit filter pills.

import { useMemo, useState } from 'react'
import SectionShell from './SectionShell'

export default function CommunityPanel({ posts, compact = false, onExpand }) {
  const [activeSub, setActiveSub] = useState(null)

  const subs = useMemo(() => {
    const counts = new Map()
    posts.forEach(p => counts.set(p.subreddit, (counts.get(p.subreddit) || 0) + 1))
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [posts])

  const filtered = activeSub ? posts.filter(p => p.subreddit === activeSub) : posts
  const visible  = compact ? filtered.slice(0, 8) : filtered

  return (
    <SectionShell
      title="Reddit Threads"
      subtitle="Volunteer talk pulled from local subreddits."
      count={`${filtered.length} posts`}
      compact={compact}
      onExpand={onExpand}
    >
      {!compact && subs.length > 1 && (
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

      {visible.length === 0 ? (
        <div className="bg-white border border-line rounded-2xl py-12 text-center">
          <p className="text-sm text-muted">No matching posts.</p>
        </div>
      ) : (
        <div className="bg-white border border-line rounded-2xl shadow-card divide-y divide-lineSoft overflow-hidden">
          {visible.map(p => <NewsRow key={p.id} post={p} compact={compact} />)}
        </div>
      )}

      {compact && filtered.length > 8 && (
        <button onClick={onExpand} className="mt-4 w-full text-center text-sm text-brand font-semibold hover:text-brandDark py-2">
          See all {filtered.length} posts →
        </button>
      )}
    </SectionShell>
  )
}

export function NewsRow({ post, compact }) {
  const date = post.created_utc
    ? new Date(post.created_utc).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  return (
    <a
      href={post.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block p-4 lg:p-5 hover:bg-canvas transition-colors"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs font-mono text-muted mb-1.5">
        <span className="font-semibold text-brand">r/{post.subreddit}</span>
        {date && <><span>·</span><span>{date}</span></>}
      </div>
      <h3 className="font-semibold text-ink text-sm sm:text-base leading-snug group-hover:text-brand transition-colors">
        {post.title}
      </h3>
      {!compact && post.body && (
        <p className="mt-1.5 text-sm text-inkSoft leading-relaxed line-clamp-2">
          {post.body.slice(0, 240)}{post.body.length > 240 ? '…' : ''}
        </p>
      )}
      <div className="mt-2 flex items-center gap-3 text-xs text-muted">
        {post.score !== undefined && <span>↑ {post.score}</span>}
        {post.num_comments !== undefined && <span>{post.num_comments} comments</span>}
        {post.relevance?.total !== undefined && (
          <span className="ml-auto font-mono text-xs">
            <span className="text-accent">{'●'.repeat(Math.min(post.relevance.total, 5))}</span>
            <span className="text-subtle">{'○'.repeat(Math.max(5 - post.relevance.total, 0))}</span>
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
