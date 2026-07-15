// /volunteer/in/[city] — the real app experience, pre-searched for one DFW
// city (e.g. /volunteer/in/garland). The city's listings are server-loaded
// into the HTML for crawlers; humans land on the interactive app with the
// search box pre-filled with the city name — exactly what typing it would do.
// Only cities with enough listings get a page (CITY_PAGE_MIN in lib/listings).

import { notFound } from 'next/navigation'
import { listingsByCitySlug, cityCounts, lightenListing } from '../../../../lib/listings'
import HomeClient from '../../../../components/HomeClient'

// How many listings to bake into the static HTML. Enough for topical
// relevance without megabyte pages on the biggest causes; the client fetch
// brings in the complete dataset immediately after hydration.
const SSR_CAP = 60

export function generateStaticParams() {
  return cityCounts().map(({ slug }) => ({ city: slug }))
}

export const dynamicParams = false

function cityForSlug(slug) {
  return cityCounts().find(c => c.slug === slug)
}

export function generateMetadata({ params }) {
  const entry = cityForSlug(params.city)
  if (!entry) return {}
  const title = `Volunteer opportunities in ${entry.city}, TX`
  const description =
    `${entry.count} current volunteer opportunities in ${entry.city}, Texas, ` +
    `updated weekly. Every listing links to the organization's own signup page.`
  return {
    title,
    description,
    alternates: { canonical: `/volunteer/in/${params.city}` },
    openGraph: { title, description, url: `/volunteer/in/${params.city}` },
  }
}

export default function CityPage({ params }) {
  const entry = cityForSlug(params.city)
  if (!entry) notFound()

  const listings = listingsByCitySlug(params.city)
    .sort((a, b) => (b.last_scraped || '').localeCompare(a.last_scraped || ''))

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Volunteer opportunities in ${entry.city}, TX`,
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
        initialSearch={entry.city}
      />
    </>
  )
}
