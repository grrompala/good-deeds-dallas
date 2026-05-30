// ListingDetailModal — the full view of a single listing, opened by "Read more"
// on a listing card so the whole description is readable without leaving the
// site. The org name here is clickable and hands off to the org summary.
//
// Props:
//   listing      — the opportunity to show (null = closed)
//   onClose      — dismiss
//   onSelectOrg(orgKey) — open the org summary for this listing's org

'use client'

import Modal from './Modal'
import TagChip from './TagChip'
import { cleanCity } from './CityBadge'
import { sourceLabel } from './SourceBox'
import { cleanOrgName } from './cleanText'
import { getTags } from './sanitizeTag'
import { orgKey } from './orgs'

export default function ListingDetailModal({ listing, onClose, onSelectOrg }) {
  const open = !!listing
  const o = listing || {}

  const orgName = cleanOrgName(o.org_name)
  const key     = orgKey(o.org_name)
  const city    = cleanCity(o.address?.city)
  const tags    = getTags(o)
  const desc    = o.description_long || o.description_short || 'No description available.'
  const email   = o.contact?.[0]?.email || o.contact?.email || null
  const phone   = o.contact?.[0]?.phone || o.contact?.phone || null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={open && (
        <div className="min-w-0">
          {orgName && (
            <button
              onClick={() => { onClose?.(); onSelectOrg?.(key) }}
              className="text-xs font-semibold uppercase tracking-wider text-brand hover:text-brandDark inline-flex items-center gap-1 max-w-full truncate"
            >
              {orgName}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0">
                <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <h2 className="mt-0.5 font-display font-bold text-ink text-lg sm:text-xl leading-tight">
            {o.opportunity_title || 'Untitled opportunity'}
          </h2>
        </div>
      )}
    >
      {open && (
        <div className="space-y-5">
          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            {o.source && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
                {sourceLabel(o.source) || o.source}
              </span>
            )}
            {city && <Meta icon="pin">{city}, TX</Meta>}
            {o.schedule?.date && <Meta icon="calendar">{o.schedule.date}</Meta>}
            {o.schedule?.duration && <Meta icon="clock">{o.schedule.duration}</Meta>}
            {o.volunteers_needed > 0 && <Meta icon="users">{o.volunteers_needed.toLocaleString()} needed</Meta>}
            {o.is_virtual && (
              <span className="px-2 py-0.5 rounded-md bg-accentSoft text-accent text-xs font-semibold">Virtual</span>
            )}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t, i) => <TagChip key={i} id={t} />)}
            </div>
          )}

          {/* Full description */}
          <div className="text-sm sm:text-base text-inkSoft leading-relaxed whitespace-pre-line">
            {desc}
          </div>

          {/* Requirements, if present */}
          {o.requirements && (
            <div>
              <h3 className="text-xs font-mono uppercase tracking-wider text-muted mb-1">Requirements</h3>
              <p className="text-sm text-inkSoft leading-relaxed whitespace-pre-line">
                {Array.isArray(o.requirements) ? o.requirements.join('\n') : o.requirements}
              </p>
            </div>
          )}

          {/* Contact */}
          {(email || phone) && (
            <div className="text-sm text-muted flex flex-col gap-1">
              {email && <span>✉️ <a href={`mailto:${email}`} className="text-brand hover:underline">{email}</a></span>}
              {phone && <span>📞 {phone}</span>}
            </div>
          )}

          {/* CTA */}
          {o.source_url && (
            <a
              href={o.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-accent hover:bg-green-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              View opportunity on {sourceLabel(o.source) || 'site'} →
            </a>
          )}
        </div>
      )}
    </Modal>
  )
}

function Meta({ icon, children }) {
  const icons = {
    pin:      <><path d="M12 22s8-7.5 8-13a8 8 0 1 0-16 0c0 5.5 8 13 8 13z"/><circle cx="12" cy="9" r="3"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round"/></>,
    clock:    <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" strokeLinecap="round"/></>,
    users:    <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">{icons[icon]}</svg>
      {children}
    </span>
  )
}
