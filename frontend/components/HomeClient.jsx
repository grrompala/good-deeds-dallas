// HomeClient — the Good Deeds Dallas app experience, as a reusable client
// component. Rendered by two kinds of routes:
//
//   /                     → <HomeClient />                          (empty state)
//   /volunteer/[tag]      → <HomeClient initialListings={…}
//                             initialCauses={[tag]}
//                             initialFocusedTab="listings" />       (pre-filtered)
//   /volunteer/in/[city]  → <HomeClient initialListings={…}
//                             initialSearch={city} />               (pre-searched)
//
// The pre-filtered routes pass a server-loaded subset so the full listing
// content is in the static HTML (crawlers don't run JS). After hydration the
// normal client fetch replaces it with the complete live dataset — same
// interactive experience everywhere, no separate "browse pages".
//
// 'use client' is required because we use React hooks.
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Hero                from './Hero'
import TabBar              from './TabBar'
import ListingsPanel       from './ListingsPanel'
import OrganizationsPanel  from './OrganizationsPanel'
import CommunityPanel      from './CommunityPanel'
import OrgModal            from './OrgModal'
import ListingDetailModal  from './ListingDetailModal'
import AdvancedSearchPanel from './AdvancedSearchPanel'
import TagChip             from './TagChip'
import SourcesBlurb, { CONTACT_EMAIL } from './SourcesBlurb'
import { buildOrgs }       from './orgs'

// Some national sources (e.g. Idealist, Voly) occasionally surface a listing
// from outside the metro. We keep a listing if its address shows any Texas /
// DFW signal, or if it has no parseable location at all (ambiguous remote
// posts). A listing is dropped only when it names a place with NO Texas signal.
const TX_SIGNAL = /\bTX\b|\bTexas\b|Dallas|Garland|McKinney|Plano|Irving|Arlington|Fort Worth|Frisco|Richardson|Denton|Carrollton|Mesquite|Allen|Rockwall|Wylie|Addison|Grapevine|Lewisville|Rowlett|Sachse|Murphy|Collin|Tarrant|DFW|Metroplex/i

// Multi-city "roadshow" events (e.g. "Shatterproof Boston Walk") sometimes carry
// a hardcoded/default TX address even though the event itself is elsewhere —
// Voly defaults address.state to "TX" whenever it can't parse one, which makes
// the address-based check above a no-op for these. Catch it from the title
// instead: an explicit other-city name with no Texas signal in the title is a
// reliable tell, without needing to trust the (often-wrong) address fields.
const OTHER_CITY_SIGNAL = /\bBoston\b|\bChicago\b|\bNew York\b|\bNYC\b|\bLos Angeles\b|\bSeattle\b|\bAtlanta\b|\bMiami\b|\bDenver\b|\bPhoenix\b|\bSan Francisco\b|\bPhiladelphia\b|\bPortland\b|\bNashville\b|\bWashington,?\s*D\.?C\.?\b|\bMinneapolis\b|\bDetroit\b|\bBaltimore\b|\bCharlotte\b|\bOrlando\b|\bTampa\b|\bLas Vegas\b|\bSan Diego\b|\bColumbus\b|\bIndianapolis\b/i

function isTexasListing(o) {
  const title = o.opportunity_title || ''
  if (OTHER_CITY_SIGNAL.test(title) && !TX_SIGNAL.test(title)) return false

  const a = o.address || {}
  const blob = [a.full, a.city, a.state, o.city, o.state].filter(Boolean).join(' ').trim()
  if (!blob) return true            // no location info → keep (ambiguous/remote)
  return TX_SIGNAL.test(blob)       // has a location → require a Texas signal
}

export default function HomeClient({
  initialListings  = null,   // server-provided subset (pre-filtered routes)
  initialCauses    = [],     // cause filter to pre-apply in ListingsPanel
  initialFocusedTab = null,  // e.g. 'listings' to open focused on that section
  initialSearch    = '',     // pre-filled search query (city routes)
}) {
  // On pre-filtered routes, render every server-provided row into the HTML
  // (crawlers can't trigger the infinite scroll). Interactive loading takes
  // over from there.
  const initialVisible = initialListings ? initialListings.length : undefined
  const [opportunities, setOpportunities] = useState(initialListings || [])
  const [news,          setNews]          = useState([])
  const [loading,       setLoading]       = useState(!initialListings)
  const [search,        setSearch]        = useState(initialSearch)
  const [focusedTab,    setFocusedTab]    = useState(initialFocusedTab)
  const [selectedOrg,     setSelectedOrg]     = useState(null)
  const [selectedListing, setSelectedListing] = useState(null)

  const listingsRef = useRef(null)
  const orgsRef     = useRef(null)
  const chatterRef  = useRef(null)

  const router = useRouter()
  const pathname = usePathname()

  // ── Load all data sources in parallel ────────────────────────────────────
  // Always runs, even on pre-filtered routes: it replaces the server-provided
  // subset with the complete live dataset (full descriptions, all causes),
  // after which the page behaves exactly like the home page.
  useEffect(() => {
    async function loadData() {
      try {
        const [garlandRes, mckinneyRes, volyRes, idealistRes, curatedRes, newsRes] = await Promise.all([
          fetch('/data/volops_garland.json'),
          fetch('/data/volops_mckinney.json'),
          fetch('/data/volops_voly.json'),
          fetch('/data/volops_idealist.json'),
          fetch('/data/volops_curated.json'),
          fetch('/data/reddit_raw.json'),
        ])
        const garland  = garlandRes.ok  ? await garlandRes.json()  : []
        const mckinney = mckinneyRes.ok ? await mckinneyRes.json() : []
        const voly     = volyRes.ok     ? await volyRes.json()     : []
        const idealist = idealistRes.ok ? await idealistRes.json() : []
        const curated  = curatedRes.ok  ? await curatedRes.json()  : []
        const newsData = newsRes.ok     ? await newsRes.json()     : []

        setOpportunities(
          [...garland, ...mckinney, ...voly, ...idealist, ...curated]
            .filter(r => r.status !== 'inactive' && r.qc?.status !== 'rejected' && isTexasListing(r))
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

  // Most recent last_scraped across every loaded opportunity — shown in the footer.
  const lastUpdated = useMemo(() => {
    const timestamps = opportunities.map(o => o.last_scraped).filter(Boolean)
    if (!timestamps.length) return null
    return timestamps.reduce((max, t) => (t > max ? t : max))
  }, [opportunities])

  // Tab counts (filtered)
  const tabCounts = {
    listings:      filteredOpps.length,
    organizations: orgCount,
    chatter:       filteredNews.length,
  }

  // Home button: clear search + tab, scroll to top. From a pre-filtered route
  // (/volunteer/…), navigate back to the real home URL instead.
  function goHome() {
    if (pathname !== '/') {
      router.push('/')
      return
    }
    setSearch('')
    setFocusedTab(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Tab click: Advanced Search is its own mode (it doesn't depend on the
  // keyword query), so it always focuses. For the other tabs: if search is
  // active (stacked mode) smooth-scroll to the anchor, otherwise focus the
  // single section.
  function handleTabChange(tabId) {
    if (tabId === 'search') {
      setFocusedTab('search')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (q) {
      const map = { listings: listingsRef, organizations: orgsRef, chatter: chatterRef }
      map[tabId]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      setFocusedTab(tabId)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const showSearch = focusedTab === 'search'
  const isStacked  = !!q && !showSearch
  const isEmpty    = !q && !focusedTab

  return (
    <>
      <Hero
        search={search}
        setSearch={setSearch}
        onWordmarkClick={goHome}
      />

      <TabBar
        active={showSearch ? 'search' : isStacked ? null : focusedTab}
        onChange={handleTabChange}
        onHome={goHome}
        counts={tabCounts}
      />

      <main className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-10 py-8 lg:py-12">
        {/* The empty state needs no data — render it immediately (it's also
            what puts the /volunteer chip links in the crawlable HTML). */}
        {isEmpty ? (
          <EmptyHomeState onOpenSearch={() => handleTabChange('search')} />
        ) : loading ? (
          <div className="flex justify-center items-center py-32 text-muted">
            <div className="animate-pulse">Loading…</div>
          </div>
        ) : showSearch ? (
          <AdvancedSearchPanel
            opportunities={opportunities}
            onSelectOrg={setSelectedOrg}
            onSelectListing={setSelectedListing}
          />
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
                    initialCauses={initialCauses}
                    initialVisible={initialVisible}
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
                initialCauses={initialCauses}
                initialVisible={initialVisible}
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
        <div className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-10 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <button onClick={goHome} className="flex flex-wrap items-center gap-3 hover:opacity-80 transition-opacity">
            <span className="font-display font-extrabold text-ink text-lg">
              Good Deeds <span className="text-brand">Dallas</span>
            </span>
            <span className="text-xs font-mono text-muted uppercase tracking-wider">

            </span>
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-muted">
            <a href="/privacy" className="hover:text-brand transition-colors">
              Privacy
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="hover:text-brand transition-colors"
            >
              {CONTACT_EMAIL}
            </a>
            {lastUpdated && (
              <span>
                Last updated{' '}
                {new Date(lastUpdated).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            )}
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
// and components/tagMeta.js). Each chip links to its pre-filtered
// /volunteer/[tag] route — the same experience with that cause selected —
// which doubles as the crawlable path into those pages.
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

function EmptyHomeState({ onOpenSearch }) {
  return (
    <div className="py-3 lg:py-5 text-center max-w-2xl mx-auto">
      <p className="text-base sm:text-lg text-muted leading-relaxed">
        Type a cause, neighborhood, or nonprofit in the search above, or pick
        a category to start exploring.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
        {SUGGESTED_TAGS.map(tagId => (
          <TagChip
            key={tagId}
            id={tagId}
            variant="filter"
            href={`/volunteer/${tagId.replace(/_/g, '-')}`}
          />
        ))}
      </div>

      {/* Where the listings come from */}
      <div className="mt-10 max-w-2xl mx-auto rounded-2xl border border-line bg-white p-5 sm:p-6">
        <SourcesBlurb />
      </div>

      {/* Smart Search feature callout */}
      <button
        onClick={onOpenSearch}
        className="mt-8 group inline-flex items-center gap-3 rounded-xl border border-line bg-white px-5 py-3.5 text-left hover:border-brand transition-colors"
      >
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-accentSoft text-accent shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
            <path d="M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10 1.4 1.4M3 12h2m14 0h2M5.6 18.4l1.4-1.4m10-10 1.4-1.4" strokeLinecap="round" />
          </svg>
        </span>
        <span>
          <span className="block text-sm font-semibold text-ink">
            Smart Search
          </span>
          <span className="block text-sm text-muted">
            Ask in plain English and get an answer, plus the closest opportunities ranked by match.
          </span>
        </span>
        <span className="ml-1 text-brand font-semibold group-hover:translate-x-0.5 transition-transform">→</span>
      </button>
    </div>
  )
}
