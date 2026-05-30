// OrgsSection.jsx — the "Organizations" tab.
//
// Displays curated local orgs and their extracted volunteer opportunities.
// Each org gets a profile card; opportunities from that org are nested below it.
//
// DATA SHAPE expected (from volops_curated.json):
//   { id, org_id, org_name, opportunity_title, description_short,
//     cause_tags[], schedule{raw}, location{city, virtual},
//     apply_url, source_url, commitment }

'use client'

import { useState, useMemo } from 'react'

// Cause filter options for the org section.
// Same format as ListingsSection — edit to add/remove filters.
const CAUSE_FILTERS = [
  { id: 'all',           label: 'All' },
  { id: 'food_security', label: '🥗 Food' },
  { id: 'seniors',       label: '👴 Seniors' },
  { id: 'children',      label: '👶 Children' },
  { id: 'animals',       label: '🐾 Animals' },
  { id: 'housing',       label: '🏠 Housing' },
  { id: 'health',        label: '❤️ Health' },
  { id: 'education',     label: '📚 Education' },
  { id: 'community',     label: '🤝 Community' },
]

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

function CauseBadge({ tag }) {
  const colorClass = TAG_COLORS[tag] || TAG_COLORS.default
  const label = tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  )
}

// ── INDIVIDUAL OPPORTUNITY ROW ─────────────────────────────────────────────────
// A compact row shown inside an org card for each of that org's opportunities.
function OpportunityRow({ opp }) {
  const [expanded, setExpanded] = useState(false)
  const applyLink = opp.apply_url || opp.source_url

  return (
    <div className="border-t border-gray-100 pt-3 mt-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800">
            {opp.opportunity_title || 'Volunteer Opportunity'}
          </p>

          {/* Short description, expandable */}
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">
            {expanded
              ? (opp.description_long || opp.description_short || '')
              : (opp.description_short || opp.description_long?.slice(0, 140) + '…' || '')
            }
          </p>
          {opp.description_long && opp.description_long.length > 140 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-brand hover:underline mt-0.5"
            >
              {expanded ? 'Less' : 'More'}
            </button>
          )}

          {/* Metadata row: schedule, commitment, location */}
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted">
            {opp.schedule?.raw   && <span>🗓 {opp.schedule.raw}</span>}
            {opp.commitment      && <span>⏱ {opp.commitment}</span>}
            {opp.location?.city  && <span>📍 {opp.location.city}, TX</span>}
            {opp.location?.virtual && <span>💻 Virtual</span>}
          </div>
        </div>

        {/* Apply button — compact version for the nested row */}
        {applyLink && (
          <a
            href={applyLink}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs bg-accent hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            Apply →
          </a>
        )}
      </div>
    </div>
  )
}

// ── ORG PROFILE CARD ──────────────────────────────────────────────────────────
// One card per organization. Opportunities from that org are nested inside.
function OrgCard({ orgName, opportunities, sourceUrl }) {
  // Collect all unique cause tags across all this org's opportunities
  const allTags = [...new Set(opportunities.flatMap(o => o.cause_tags || []))]

  // Collapse/expand the opportunity list. Starts expanded.
  const [showOpps, setShowOpps] = useState(true)

  return (
    /*
      Org card container. More visually prominent than a listing card:
        border-l-4 border-brand — left colored accent bar
      To remove the accent bar: delete those two classes.
      To change the accent color: replace 'border-brand' with 'border-green-500' etc.
    */
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-brand p-5">

      {/* ── Org header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-gray-900 text-base">{orgName}</h3>

          {/* Cause tags for this org */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {allTags.map(tag => <CauseBadge key={tag} tag={tag} />)}
            </div>
          )}
        </div>

        {/* Volunteer page link */}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs text-brand hover:underline"
          >
            Visit org →
          </a>
        )}
      </div>

      {/* ── Opportunities count + toggle */}
      <button
        onClick={() => setShowOpps(!showOpps)}
        className="text-xs text-muted hover:text-gray-700 mt-3"
      >
        {opportunities.length} opportunity{opportunities.length !== 1 ? 'ies' : 'y'} {showOpps ? '▲' : '▼'}
      </button>

      {/* ── Nested opportunity rows */}
      {showOpps && opportunities.map(opp => (
        <OpportunityRow key={opp.id} opp={opp} />
      ))}
    </div>
  )
}

// ── MAIN SECTION COMPONENT ─────────────────────────────────────────────────────
export default function OrgsSection({ data }) {
  const [search,    setSearch]    = useState('')
  const [activeTag, setActiveTag] = useState('all')

  // Group the flat list of opportunities by org_name.
  // Result: { "The Senior Source": [...opps], "Warren Center": [...opps], ... }
  const orgGroups = useMemo(() => {
    const groups = {}
    data.forEach(opp => {
      const name = opp.org_name || 'Unknown'
      if (!groups[name]) groups[name] = { opps: [], sourceUrl: opp.source_url }
      groups[name].opps.push(opp)
    })
    return groups
  }, [data])

  // Filter orgs by search and active cause tag
  const filteredOrgs = useMemo(() => {
    return Object.entries(orgGroups).filter(([orgName, { opps }]) => {
      // Tag filter: does any opportunity in this org match the selected tag?
      const matchesTag = activeTag === 'all' ||
        opps.some(o => (o.cause_tags || []).includes(activeTag))

      // Search filter: matches org name or any opportunity title
      const q = search.toLowerCase()
      const matchesSearch = !q ||
        orgName.toLowerCase().includes(q) ||
        opps.some(o => (o.opportunity_title || '').toLowerCase().includes(q))

      return matchesTag && matchesSearch
    })
  }, [orgGroups, search, activeTag])

  return (
    <div className="flex flex-col gap-6">

      {/* ── Section heading */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">Organizations</h2>
        <p className="text-sm text-muted mt-1">
          Curated local nonprofits with verified volunteer opportunities
        </p>
      </div>

      {/* ── Search bar */}
      <input
        type="text"
        placeholder="Search organizations or opportunities..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
      />

      {/* ── Cause filter pills */}
      <div className="flex flex-wrap gap-2">
        {CAUSE_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveTag(f.id)}
            className={`
              px-3 py-1.5 rounded-full text-sm font-medium transition-colors
              ${activeTag === f.id
                ? 'bg-brand text-white'
                : 'bg-white text-gray-600 border hover:bg-brand-light'
              }
            `}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Result count */}
      <p className="text-sm text-muted">
        {filteredOrgs.length} organization{filteredOrgs.length !== 1 ? 's' : ''}
      </p>

      {/* ── Org cards, sorted alphabetically */}
      {filteredOrgs.length === 0 ? (
        <p className="text-center text-muted py-12">No organizations match your filters.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredOrgs
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([orgName, { opps, sourceUrl }]) => (
              <OrgCard
                key={orgName}
                orgName={orgName}
                opportunities={opps}
                sourceUrl={sourceUrl}
              />
            ))
          }
        </div>
      )}
    </div>
  )
}
