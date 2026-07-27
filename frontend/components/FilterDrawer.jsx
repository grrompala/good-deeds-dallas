// FilterDrawer — the shared "Filters" side panel used by the Opportunities and
// Organizations panels, so both look and behave identically. A slim sticky
// toolbar shows a Filters button (with an active-count badge) plus an optional
// right-side slot (e.g. Sort); the button opens a right-side slide-in drawer
// whose body is the caller's filter groups. The drawer is always mounted so it
// can animate both ways, and is inert + off-screen when closed.
//
// Callers own the filter state; this just provides the shell. Use FilterGroup
// for each labelled row and SitePill for plain pills.
'use client'

import { useEffect, useState } from 'react'

export default function FilterDrawer({
  activeCount = 0,
  resultCount = 0,
  resultNoun = 'result',
  onReset,
  toolbarRight = null,
  children,
}) {
  const [open, setOpen] = useState(false)

  // Escape closes the drawer. (We intentionally don't lock body scroll: filters
  // change inside the open drawer and the panels auto-scroll their list to the
  // top, so the background must stay programmatically scrollable.)
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {/* Toolbar — slim, always-reachable row pinned under the app header. */}
      <div
        className="sticky z-20 bg-canvas py-2 mb-1 flex items-center justify-between gap-3"
        style={{ top: 'var(--app-header-h, 96px)' }}
      >
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-inkSoft hover:border-brand/40 hover:text-brand transition-colors"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
          Filters
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-brand text-white text-xs font-mono">
              {activeCount}
            </span>
          )}
        </button>
        {toolbarRight}
      </div>

      {/* Drawer — slides in from the right. */}
      <div
        className={`fixed inset-0 z-50 overflow-hidden ${open ? '' : 'pointer-events-none'}`}
        aria-hidden={!open}
      >
        <div
          className={`absolute inset-0 bg-ink/40 backdrop-blur-sm transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setOpen(false)}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
          className={`absolute right-0 top-0 h-full w-full max-w-sm bg-white shadow-2xl flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <h2 className="font-display font-bold text-lg text-ink">Filters</h2>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close filters"
              className="p-1.5 -mr-1.5 rounded-full text-muted hover:text-ink hover:bg-canvas transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-6">
            {children}
          </div>

          <div className="border-t border-line px-5 py-3 flex items-center justify-between gap-3">
            <button
              onClick={onReset}
              disabled={activeCount === 0}
              className="text-sm font-medium text-muted hover:text-ink disabled:opacity-40 disabled:hover:text-muted transition-colors"
            >
              Reset all
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full bg-brand text-white px-5 py-2 text-sm font-semibold hover:bg-brandDark transition-colors"
            >
              Show {resultCount} {resultNoun}{resultCount === 1 ? '' : 's'}
            </button>
          </div>
        </aside>
      </div>
    </>
  )
}

// One labelled filter group in the drawer: a label above its wrapping pills.
export function FilterGroup({ label, children }) {
  return (
    <div>
      <div className="mb-2 text-xs font-mono uppercase tracking-wider text-muted">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

// Plain "site" pill (no icon) — used for Source, City, Type and the "All" buttons.
export function SitePill({ children, count, active, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
        border transition-colors whitespace-nowrap
        ${active
          ? 'bg-brand text-white border-brand'
          : 'bg-white text-inkSoft border-line hover:border-brand/40 hover:text-brand'
        }
      `}
    >
      {children}
      {count !== undefined && (
        <span className={`font-mono text-xs ${active ? 'text-white/75' : 'text-subtle'}`}>
          {count}
        </span>
      )}
    </button>
  )
}
