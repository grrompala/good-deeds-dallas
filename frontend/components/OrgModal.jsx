// OrgModal — summary of every listing for a single organization.
// Opened by clicking an org name anywhere (a listing row, the Organizations
// panel, or the org link inside a listing-detail modal).
//
// Props:
//   orgKey     — canonical key of the org to show (from orgs.js)
//   listings   — the full opportunities array (we derive this org's slice)
//   onClose    — dismiss the modal
//   onOpenListing(listing) — optional; open a listing's full detail

'use client'

import { useState } from 'react'
import Modal from './Modal'
import TagChip from './TagChip'
import { cityName } from '../lib/city'
import { sourceLabel } from './SourceBox'
import { getTags } from './sanitizeTag'
import { listingsForOrg, summarizeOrg } from './orgs'

export default function OrgModal({ orgKey, listings, onClose, onOpenListing }) {
  const open = !!orgKey
  const entries = open ? listingsForOrg(listings, orgKey) : []
  const org = entries.length ? summarizeOrg(entries) : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={org && (
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-muted mb-0.5">
            Organization
          </div>
          <h2 className="font-display font-bold text-ink text-lg sm:text-xl leading-tight truncate">
            {org.url ? (
              <a
                href={org.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand transition-colors inline-flex items-center gap-1.5"
              >
                {org.name}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-subtle">
                  <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ) : org.name}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            <span className="font-semibold text-ink">{org.count}</span>{' '}
            way{org.count === 1 ? '' : 's'} to help
            {org.cities.length > 0 && <> · {org.cities.slice(0, 3).join(', ')}</>}
          </p>
        </div>
      )}
    >
      {org && (
        <>
          {org.causes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              {org.causes.slice(0, 6).map(t => <TagChip key={t} id={t} />)}
            </div>
          )}

          <ul className="space-y-3">
            {org.entries.map((opp, i) => (
              <OrgListingItem
                key={opp.id || i}
                opp={opp}
                onOpenListing={onOpenListing}
              />
            ))}
          </ul>
        </>
      )}
    </Modal>
  )
}

// One listing within the org summary. Description expands inline (we're already
// inside a modal, so we avoid stacking a second one).
function OrgListingItem({ opp, onOpenListing }) {
  const [expanded, setExpanded] = useState(false)
  const tags = getTags(opp)
  const long  = opp.description_long || ''
  const short = opp.description_short || ''
  const body  = expanded ? (long || short) : (short || long)
  const canExpand = long && long.length > short.length + 10

  return (
    <li className="rounded-xl border border-line p-4 hover:border-brand/30 transition-colors">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        {opp.source && (
          <span className="text-[10px] font-mono uppercase tracking-wider text-subtle">
            {sourceLabel(opp.source) || opp.source}
          </span>
        )}
        {cityName(opp) && (
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted">
            {cityName(opp)}
          </span>
        )}
      </div>

      <h3 className="font-bold text-ink text-sm sm:text-base leading-snug">
        <a
          href={opp.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-brand transition-colors"
        >
          {opp.opportunity_title || 'Untitled opportunity'}
        </a>
      </h3>

      {body && (
        <p className={`mt-1.5 text-sm text-inkSoft leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
          {body}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {canExpand && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-xs font-semibold text-brand hover:text-brandDark"
          >
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}
        {onOpenListing && (
          <button
            onClick={() => onOpenListing(opp)}
            className="text-xs font-semibold text-muted hover:text-ink"
          >
            Full details
          </button>
        )}
        <a
          href={opp.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-accent hover:underline ml-auto"
        >
          View opportunity →
        </a>
      </div>

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.slice(0, 4).map((t, i) => <TagChip key={i} id={t} />)}
        </div>
      )}
    </li>
  )
}
