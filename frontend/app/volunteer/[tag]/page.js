// /volunteer/[tag] — server-rendered page for one cause (e.g. /volunteer/animals,
// /volunteer/food-security). Statically generated per taxonomy tag at build
// time; the weekly data-refresh commit triggers a redeploy that keeps these
// current. Full HTML content, so non-JS crawlers (AI search included) see
// every listing.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  listingsByTag, tagCounts, tagSlug, slugToTag, cityCounts,
} from '../../../lib/listings'
import { TAG_META, tagMeta } from '../../../components/tagMeta'
import StaticListingCard from '../../../components/StaticListingCard'

const SITE_URL = 'https://www.good-deeds-dallas.org'

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
  const otherTags = tagCounts().filter(t => t.tag !== tag).slice(0, 8)
  const cities = cityCounts().slice(0, 8)

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
        <span aria-hidden>{meta.icon}</span> {meta.label} volunteer opportunities
        in Dallas–Fort Worth
      </h1>
      <p className="mt-3 text-base text-inkSoft leading-relaxed max-w-2xl">
        {listings.length} current {meta.label.toLowerCase()} opportunities across
        the Dallas metro, updated weekly. Click any listing to sign up directly
        with the organization — Good Deeds Dallas is a directory, not a middleman.
      </p>

      <div className="mt-8 bg-white border border-line rounded-2xl shadow-card divide-y divide-lineSoft overflow-hidden">
        {listings.map(o => (
          <StaticListingCard key={o.id} listing={o} />
        ))}
      </div>

      <nav className="mt-12">
        <h2 className="font-bold text-base text-ink">More causes</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {otherTags.map(({ tag: t, count }) => (
            <li key={t}>
              <Link
                href={`/volunteer/${tagSlug(t)}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-sm font-medium text-inkSoft hover:border-brand hover:text-brand transition-colors"
              >
                <span aria-hidden>{tagMeta(t).icon}</span> {tagMeta(t).label}
                <span className="font-mono text-xs text-muted">{count}</span>
              </Link>
            </li>
          ))}
        </ul>
        <h2 className="mt-6 font-bold text-base text-ink">By city</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {cities.map(({ city, slug }) => (
            <li key={slug}>
              <Link
                href={`/volunteer/in/${slug}`}
                className="inline-flex rounded-full border border-line bg-white px-3.5 py-1.5 text-sm font-medium text-inkSoft hover:border-brand hover:text-brand transition-colors"
              >
                {city}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  )
}
