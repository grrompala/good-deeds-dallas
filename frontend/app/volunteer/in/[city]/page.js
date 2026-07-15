// /volunteer/in/[city] — server-rendered page for one DFW city (e.g.
// /volunteer/in/garland). Only cities with enough listings get a page (see
// CITY_PAGE_MIN in lib/listings.js); the set regenerates each deploy.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  listingsByCitySlug, cityCounts, tagCounts, tagSlug,
} from '../../../../lib/listings'
import { tagMeta } from '../../../../components/tagMeta'
import StaticListingCard from '../../../../components/StaticListingCard'

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
  const otherCities = cityCounts().filter(c => c.slug !== params.city).slice(0, 10)
  const topTags = tagCounts().slice(0, 8)

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
    <main className="max-w-4xl mx-auto px-5 sm:px-6 lg:px-10 py-10 lg:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <p className="text-sm">
        <Link href="/volunteer" className="text-brand font-semibold hover:text-brandDark">
          ← All causes and cities
        </Link>
      </p>

      <h1 className="mt-4 font-display font-extrabold text-3xl sm:text-4xl text-ink">
        Volunteer opportunities in {entry.city}, TX
      </h1>
      <p className="mt-3 text-base text-inkSoft leading-relaxed max-w-2xl">
        {listings.length} current opportunities in {entry.city}, updated weekly
        from local volunteer portals and nonprofits. Click any listing to sign up
        directly with the organization.
      </p>

      <div className="mt-8 bg-white border border-line rounded-2xl shadow-card divide-y divide-lineSoft overflow-hidden">
        {listings.map(o => (
          <StaticListingCard key={o.id} listing={o} />
        ))}
      </div>

      <nav className="mt-12">
        <h2 className="font-bold text-base text-ink">Nearby cities</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {otherCities.map(({ city, slug, count }) => (
            <li key={slug}>
              <Link
                href={`/volunteer/in/${slug}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-sm font-medium text-inkSoft hover:border-brand hover:text-brand transition-colors"
              >
                {city}
                <span className="font-mono text-xs text-muted">{count}</span>
              </Link>
            </li>
          ))}
        </ul>
        <h2 className="mt-6 font-bold text-base text-ink">By cause</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {topTags.map(({ tag, count }) => (
            <li key={tag}>
              <Link
                href={`/volunteer/${tagSlug(tag)}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-sm font-medium text-inkSoft hover:border-brand hover:text-brand transition-colors"
              >
                <span aria-hidden>{tagMeta(tag).icon}</span> {tagMeta(tag).label}
                <span className="font-mono text-xs text-muted">{count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  )
}
