// /volunteer/[tag] — the real app experience, pre-filtered to one cause
// (e.g. /volunteer/animals, /volunteer/food-security). Statically generated
// per taxonomy tag: the matching listings are server-loaded and passed into
// HomeClient, so the full content is in the HTML for crawlers (which don't
// run JS) — while humans get the exact interactive home-page experience with
// the cause filter pre-selected. After hydration the client fetch swaps in
// the complete live dataset.

import { notFound } from 'next/navigation'
import { listingsByTag, tagSlug, slugToTag, lightenListing } from '../../../lib/listings'
import { TAG_META, tagMeta } from '../../../components/tagMeta'
import HomeClient from '../../../components/HomeClient'

// How many listings to bake into the static HTML. Enough for topical
// relevance without megabyte pages on the biggest causes; the client fetch
// brings in the complete dataset immediately after hydration.
const SSR_CAP = 60

export function generateStaticParams() {
  return Object.keys(TAG_META).map(tag => ({ tag: tagSlug(tag) }))
}

export const dynamicParams = false // unknown tags -> 404 at build, not runtime

export function generateMetadata({ params }) {
  const tag = slugToTag(params.tag)
  const meta = tagMeta(tag)
  const count = listingsByTag(tag).length
  const title = `${meta.label} volunteer opportunities in Dallas–Fort Worth`
  const description =
    `${count} current ${meta.label.toLowerCase()} volunteer opportunities across ` +
    `the Dallas metro, updated weekly. Every listing links to the organization's ` +
    `own signup page.`
  return {
    title,
    description,
    alternates: { canonical: `/volunteer/${params.tag}` },
    openGraph: { title, description, url: `/volunteer/${params.tag}` },
  }
}

export default function TagPage({ params }) {
  const tag = slugToTag(params.tag)
  if (!TAG_META[tag]) notFound()

  const meta = tagMeta(tag)
  const listings = listingsByTag(tag)
    .sort((a, b) => (b.last_scraped || '').localeCompare(a.last_scraped || ''))

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${meta.label} volunteer opportunities in Dallas–Fort Worth`,
    numberOfItems: listings.length,
    itemListElement: listings.slice(0, 50).map((o, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: o.opportunity_title,
      url: o.source_url,
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeClient
        initialListings={listings.slice(0, SSR_CAP).map(lightenListing)}
        initialCauses={[tag]}
        initialFocusedTab="listings"
      />
    </>
  )
}
