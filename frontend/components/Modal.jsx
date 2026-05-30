// Modal — generic overlay panel used for the org summary and the full
// listing-description views. Renders nothing when `open` is false.
//
// Behavior:
//   • Click the backdrop (or the × / Esc key) to close.
//   • Body scroll is locked while open so the page behind doesn't move.
//   • The panel itself scrolls when its content is taller than the viewport.
//
// Props:
//   open      — boolean; whether the modal is visible
//   onClose   — called when the user dismisses (backdrop / × / Esc)
//   title     — optional node shown in the sticky header (left side)
//   children  — modal body content

'use client'

import { useEffect } from 'react'

export default function Modal({ open, onClose, title, children }) {
  // Close on Esc + lock background scroll while open.
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm animate-[fadeIn_120ms_ease-out]"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div className="relative w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden">
        {/* Sticky header with close button */}
        <div className="shrink-0 flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-line bg-white">
          <div className="min-w-0 flex-1">{title}</div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 -mr-1 -mt-1 inline-flex items-center justify-center w-9 h-9 rounded-full text-muted hover:text-ink hover:bg-canvas transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-5 sm:px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}
