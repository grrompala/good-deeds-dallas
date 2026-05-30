// page.js — Y'all Volunteer landing page.
//
// Default state: hero with search + empty content area. When the user
// searches, all three sections (Listings, Organizations, Chatter) appear
// stacked. Clicking a tab focuses just that section. Home button in the
// tab bar (or clicking the wordmark) returns to the empty state.
//
// 'use client' is required because we use React hooks.
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Hero                from '../components/Hero'
import TabBar              from '../components/TabBar'
import ListingsPanel       from '../components/ListingsPanel'
import OrganizationsPanel  from '../components/OrganizationsPanel'
import CommunityPanel      from '../components/CommunityPanel'
import OrgModal            from '../components/OrgModal'
import ListingDetailModal  from '../components/ListingDetailModal'
import TagChip             from '../components/TagChip'
import { buildOrgs }       from '../components/orgs'

export default function Home() {
  const [opportunities, setOpportunities] = useState([])
  const [news,          setNews]          = useState([])
  const [loading,       setLoading]       = useState(true)
  const [search,        setSearch]        = useState('')
  const [focusedTab,    setFocusedTab]    = useState(null)
  const [selectedOrg,     setSelectedOrg]     = useState(null)
  const [selectedListing, setSelectedListing] = useState(null)

  const listingsRef = useRef(null)
  const orgsRef     = useRef(null)
  const chatterRef  = useRef(null)

  // ── Load all data sources in parallel ────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        const [garlandRes, mckinneyRes, volyRes, idealistRes, newsRes] = await Promise.all([
          fetch('/data/volops_garland.json'),
          fetch('/data/volops_mckinney.json'),
          fetch('/data/volops_voly.json'),
          fetch('/data/volops_idealist.json'),
          fetch('/data/reddit_raw.json'),
        ])
        const garland  = garlandRes.ok  ? await garlandRes.json()  : []
        const mckinney = mckinneyRes.ok ? await mckinneyRes.json() : []
        const voly     = volyRes.ok     ? await volyRes.json()     : []
        const idealist = idealistRes.ok ? await idealistRes.json() : []
        const newsData = newsRes.ok     ? await newsRes.json()     : []

        setOpportunities(
          [...garland, ...mckinney, ...voly, ...idealist].filter(r => r.status !== 'inactive')
        )
        setNews(
          newsData
            .filter(r => (r.relevance?.total || 0) >= 2)
            .sort((a, b) => new Date(b.created_utc) - new Date(a.created_utc))
        )
      } catch (err) {
        console.error('Failed to load data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // ── Search filter ────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase()
  const filteredOpps = useMemo(() => {
    if (!q) return opportunities
    return opportunities.filter(o => {
      const hay = [
        o.opportunity_title, o.org_name, o.description_short, o.description_long,
        ...(o.cause_tags || []), ...(o.unified_tags || []), o.address?.city,
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [opportunities, q])

  const filteredNews = useMemo(() => {
    if (!q) return news
    return news.filter(p =>
      `${p.title} ${p.body || ''} ${p.subreddit}`.toLowerCase().includes(q)
    )
  }, [news, q])

  // Organizations are now DERIVED from the listings themselves (no separate
  // curated source). Both panels read from the same filtered listings.
  const orgCount = useMemo(
    () => buildOrgs(filteredOpps).length,
    [filteredOpps]
  )

  // Hero stats (unfiltered totals)
  const totalListings = opportunities.length
  const totalOrgCount = useMemo(() => buildOrgs(opportunities).length, [opportunities])

  // Tab counts (filtered)
  const tabCounts = {
    listings:      filteredOpps.length,
    organizations: orgCount,
    chatter:       filteredNews.length,
  }

  // Home button: clear search + tab, scroll to top
  function goHome() {
    setSearch('')
    setFocusedTab(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Tab click: if search is active (stacked mode), smooth-scroll to anchor.
  // Otherwise focus that single section.
  function handleTabChange(tabId) {
    if (q) {
      const map = { listings: listingsRef, organizations: orgsRef, chatter: chatterRef }
      map[tabId]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      setFocusedTab(tabId)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const isStacked = !!q
  const isEmpty   = !q && !focusedTab

  return (
    <>
      <Hero
        search={search}
        setSearch={setSearch}
        onWordmarkClick={goHome}
        totalOpps={totalListings}
        totalOrgs={totalOrgCount}
        totalNews={news.length}
      />

      <TabBar
        active={isStacked ? null : focusedTab}
        onChange={handleTabChange}
        onHome={goHome}
        counts={tabCounts}
      />

      <main className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-10 py-8 lg:py-12">
        {loading ? (
          <div className="flex justify-center items-center py-32 text-muted">
            <div className="animate-pulse">Loading…</div>
          </div>
        ) : isEmpty ? (
          <EmptyHomeState onSuggest={setSearch} />
        ) : (
          <>
            {q && (
              <div className="mb-8 flex items-baseline justify-between">
                <p className="text-base text-ink">
                  Showing matches for <span className="font-semibold">"{search}"</span>
                </p>
                <button onClick={() => setSearch('')} className="text-sm text-muted hover:text-ink">
                  Clear ×
                </button>
              </div>
            )}

            {/* Stacked when searching */}
            {isStacked && (
              <div className="space-y-12">
                <div ref={listingsRef} className="scroll-mt-20">
                  <ListingsPanel
                    listings={filteredOpps}
                    onSelectOrg={setSelectedOrg}
                    onSelectListing={setSelectedListing}
                  />
                </div>
                <div ref={orgsRef} className="scroll-mt-20">
                  <OrganizationsPanel
                    listings={filteredOpps}
                    searchActive={!!q}
                    onSelectOrg={setSelectedOrg}
                  />
                </div>
                <div ref={chatterRef} className="scroll-mt-20">
                  <CommunityPanel posts={filteredNews} />
                </div>
              </div>
            )}

            {/* Focused single section */}
            {!isStacked && focusedTab === 'listings' && (
              <ListingsPanel
                listings={filteredOpps}
                onSelectOrg={setSelectedOrg}
                onSelectListing={setSelectedListing}
              />
            )}
            {!isStacked && focusedTab === 'organizations' && (
              <OrganizationsPanel
                listings={filteredOpps}
                searchActive={!!q}
                onSelectOrg={setSelectedOrg}
              />
            )}
            {!isStacked && focusedTab === 'chatter' && (
              <CommunityPanel posts={filteredNews} />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-line bg-white mt-8">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-10 py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <button onClick={goHome} className="flex flex-wrap items-center gap-3 hover:opacity-80 transition-opacity">
            <span className="font-display font-extrabold text-ink text-lg">
              Y'all <span className="text-brand">Volunteer</span>
            </span>
            <span className="text-xs font-mono text-muted uppercase tracking-wider">
              Greater Dallas
            </span>
          </button>
          <div className="text-sm text-muted">
            Aggregated from{' '}
            <span className="font-mono text-xs">volunteergarland.org</span>,{' '}
            <span className="font-mono text-xs">volunteermckinney.galaxydigital.com</span>,{' '}
            <span className="font-mono text-xs">dallas.voly.org</span>,
            Idealist, and local subreddits.
          </div>
        </div>
      </footer>

      {/* Org summary + full-listing modals (overlay the whole page) */}
      <OrgModal
        orgKey={selectedOrg}
        listings={opportunities}
        onClose={() => setSelectedOrg(null)}
        onOpenListing={l => { setSelectedOrg(null); setSelectedListing(l) }}
      />
      <ListingDetailModal
        listing={selectedListing}
        onClose={() => setSelectedListing(null)}
        onSelectOrg={key => { setSelectedListing(null); setSelectedOrg(key) }}
      />
    </>
  )
}

// ── Empty default state ──────────────────────────────────────────────────────
// Suggestion chips pull from the unified TAXONOMY (see classify_listings.py
// and components/tagMeta.js). Clicking a chip sets the search query to the
// tag id, which matches against unified_tags in the haystack.
const SUGGESTED_TAGS = [
  'food_security',
  'children',
  'seniors',
  'animals',
  'environment',
  'education',
  'health',
  'community',
]

function EmptyHomeState({ onSuggest }) {
  return (
    <div className="py-16 lg:py-24 text-center max-w-2xl mx-auto">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brandSoft text-brand mb-5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink">
        What kind of giving back are you up for?
      </h2>
      <p className="mt-3 text-base sm:text-lg text-muted leading-relaxed">
        Type a cause, neighborhood, or nonprofit in the search above — or pick
        a category to start exploring.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
        {SUGGESTED_TAGS.map(tagId => (
          <TagChip
            key={tagId}
            id={tagId}
            variant="filter"
            onClick={() => onSuggest(tagId)}
          />
        ))}
      </div>
    </div>
  )
}
