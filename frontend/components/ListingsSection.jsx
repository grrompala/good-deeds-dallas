// ListingsSection.jsx — the "Opportunities" tab.
//
// Displays structured volunteer listings from the Garland Galaxy Digital board.
// Features: keyword search, cause tag filters, commitment type filter.
//
// DATA SHAPE expected (from volops_garland.json):
//   { opportunity_title, org_name, description_short, description_long,
//     cause_tags[], address{city, full}, schedule{raw}, contact{email, phone},
//     source_url, status }

'use client'

import { useState, useMemo } from 'react'

// ── CAUSE TAGS ────────────────────────────────────────────────────────────────
// These are the filter buttons shown above the listings.
// To add a new tag: add an entry here AND make sure your scrapers emit that string
// in the cause_tags array of each volop record.
// To remove a tag from the filter bar: delete its entry here (data is unaffected).
const CAUSE_FILTERS = [
  { id: 'all',           label: 'All' },
  { id: 'food_security', label: '🥗 Food' },
  { id: 'seniors',       label: '👴 Seniors' },
  { id: 'children',      label: '👶 Children' },
  { id: 'animals',       label: '🐾 Animals' },
  { id: 'environment',   label: '🌱 Environment' },
  { id: 'community',     label: '🤝 Community' },
  { id: 'health',        label: '❤️ Health' },
  { id: 'education',     label: '📚 Education' },
]

// Human-readable labels for cause tag badges shown on each card.
// If a tag from the data isn't listed here it just shows as-is (capitalized).
const TAG_LABELS = {
  food_security: 'Food Security',
  seniors:       'Seniors',
  children:      'Children',
  animals:       'Animals',
  environment:   'Environment',
  community:     'Community',
  health:        'Health',
  education:     'Education',
  housing:       'Housing',
  legal:         'Legal',
  foster_care:   'Foster Care',
  crisis_support:'Crisis Support',
  arts:          'Arts',
}

// ── CARD COLORS ───────────────────────────────────────────────────────────────
// Each cause tag gets its own badge color. Edit the Tailwind classes here to
// change badge appearance. Format: 'bg-[background] text-[text color]'
const TAG_COLORS = {
  food_security: 'bg-yellow-100 text-yellow-800',
  seniors:       'bg-purple-100 text-purple-800',
  children:      'bg-pink-100   text-pink-800',
  animals:       'bg-orange-100 text-orange-800',
  environment:   'bg-green-100  text-green-800',
  community:     'bg-blue-100   text-blue-800',
  health:        'bg-red-100    text-red-800',
  education:     'bg-indigo-100 text-indigo-800',
  housing:       'bg-teal-100   text-teal-800',
  default:       'bg-gray-100   text-gray-700',
}

// ── HELPER: single cause badge ─────────────────────────────────────────────
function CauseBadge({ tag }) {
  const colorClass = TAG_COLORS[tag] || TAG_COLORS.default
  const label      = TAG_LABELS[tag] || tag.replace(/_/g, ' ')
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  )
}

// ── INDIVIDUAL OPPORTUNITY CARD ────────────────────────────────────────────────
// Each listing is rendered as one of these cards.
// To change the card layout: edit the JSX inside this component.
function OpportunityCard({ item }) {
  // `expanded` tracks whether the user has clicked "Read more"
  const [expanded, setExpanded] = useState(false)

  const city     = item.address?.city || 'Garland'
  const schedule = item.schedule?.raw || null
  const tags     = item.cause_tags || []
  const email    = item.contact?.[0]?.email || null
  const phone    = item.contact?.[0]?.phone || null

  return (
    /*
      Card container. Key classes to know for restyling:
        bg-white       — white card background
        rounded-xl     — rounded corners (xl = fairly round)
        shadow-sm      — subtle drop shadow
        border         — thin border line
        p-5            — padding inside the card (5 = 1.25rem)
      To make cards stand out more: change shadow-sm to shadow-md or shadow-lg.
    */
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3">

      {/* ── Card header: title + org name */}
      <div>
        <h3 className="font-semibold text-gray-900 text-base leading-snug">
          {item.opportunity_title || 'Untitled Opportunity'}
        </h3>
        <p className="text-sm text-muted mt-0.5">
          {item.org_name || 'Unknown Organization'}
        </p>
      </div>

      {/* ── Cause tag badges */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map(tag => <CauseBadge key={tag} tag={tag} />)}
        </div>
      )}

      {/* ── Description: short by default, full text when expanded */}
      <p className="text-sm text-gray-700 leading-relaxed">
        {expanded
          ? (item.description_long || item.description_short || 'No description available.')
          : (item.description_short || item.description_long?.slice(0, 180) + '…' || 'No description.')
        }
      </p>
      {/* Only show the toggle if there's more text to reveal */}
      {item.description_long && item.description_long.length > 180 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-brand hover:underline self-start"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}

      {/* ── Schedule and location metadata */}
      <div className="text-xs text-muted flex flex-col gap-1">
        {schedule && <span>🗓 {schedule}</span>}
        {city     && <span>📍 {city}, TX</span>}
        {email    && <span>✉️ <a href={`mailto:${email}`} className="hover:underline text-brand">{email}</a></span>}
        {phone    && <span>📞 {phone}</span>}
      </div>

      {/* ── Action button: links out to the original listing */}
      {item.source_url && (
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          /*
            Button styles. To change button color:
              • Replace 'bg-accent' with any Tailwind color like 'bg-blue-600'
              • Replace 'hover:bg-green-700' with the darker hover shade
          */
          className="mt-auto inline-block text-center bg-accent hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          View Opportunity →
        </a>
      )}
    </div>
  )
}

// ── MAIN SECTION COMPONENT ─────────────────────────────────────────────────────
export default function ListingsSection({ data }) {
  const [search,      setSearch]      = useState('')
  const [activeTag,   setActiveTag]   = useState('all')

  // `useMemo` recalculates filtered results only when search/filter/data changes.
  // This avoids re-filtering on every keystroke when data is large.
  const filtered = useMemo(() => {
    return data.filter(item => {
      // Tag filter: skip if a tag is selected and the item doesn't have it
      const matchesTag = activeTag === 'all' || (item.cause_tags || []).includes(activeTag)

      // Search filter: check title, org name, and description
      const q = search.toLowerCase()
      const matchesSearch = !q ||
        (item.opportunity_title || '').toLowerCase().includes(q) ||
        (item.org_name          || '').toLowerCase().includes(q) ||
        (item.description_short || '').toLowerCase().includes(q)

      return matchesTag && matchesSearch
    })
  }, [data, search, activeTag])

  return (
    <div className="flex flex-col gap-6">

      {/* ── Section heading */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Volunteer Opportunities</h2>
        <p className="text-sm text-muted mt-1">
          Official listings from Volunteer Garland — updated weekly
        </p>
      </div>

      {/* ── Search bar */}
      <input
        type="text"
        placeholder="Search by keyword, org, or description..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        /*
          To restyle the search box: edit the className below.
          Key classes: border, rounded-lg, px-4 py-2 (padding), text-sm (font size)
        */
        className="w-full border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
      />

      {/* ── Cause filter buttons */}
      <div className="flex flex-wrap gap-2">
        {CAUSE_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveTag(f.id)}
            className={`
              px-3 py-1.5 rounded-full text-sm font-medium transition-colors
              ${activeTag === f.id
                ? 'bg-brand text-white'                        // selected state
                : 'bg-white text-gray-600 border hover:bg-brand-light'  // unselected
              }
            `}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Result count */}
      <p className="text-sm text-muted">
        Showing {filtered.length} of {data.length} listings
      </p>

      {/* ── Grid of cards */}
      {filtered.length === 0 ? (
        <p className="text-center text-muted py-12">No listings match your filters.</p>
      ) : (
        /*
          Card grid layout. Currently 1 column on mobile, 2 on medium screens.
          To go 3 columns on large screens: add 'lg:grid-cols-3'
          To go back to 1 column always: remove 'md:grid-cols-2'
        */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(item => (
            <OpportunityCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
