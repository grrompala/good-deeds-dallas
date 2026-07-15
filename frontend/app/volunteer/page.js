// /volunteer — server-rendered browse index. The crawlable front door to the
// per-cause and per-city pages: real HTML with real links, no JS required.

import Link from 'next/link'
import { loadListings, tagCounts, tagSlug, cityCounts } from '../../lib/listings'
import { tagMeta } from '../../components/tagMeta'

export const metadata = {
  title: 'Browse volunteer opportunities in Dallas–Fort Worth',
  description:
    'Volunteer opportunities across the Dallas metro, organized by cause and city. ' +
    'Updated weekly from local volunteer portals and nonprofits.',
  alternates: { canonical: '/volunteer' },
}

export default function VolunteerIndex() {
  const total = loadListings().length
  const tags = tagCounts()
  const cities = cityCounts()

  return (
    <main className="max-w-4xl mx-auto px-5 sm:px-6 lg:px-10 py-10 lg:py-14">
      <p className="text-sm">
        <Link href="/" className="text-brand font-semibold hover:text-brandDark">
          ← Good Deeds Dallas home
        </Link>
      </p>

      <h1 className="mt-4 font-display font-extrabold text-3xl sm:text-4xl text-ink">
        Browse volunteer opportunities in Dallas–Fort Worth
      </h1>
      <p className="mt-3 text-base text-inkSoft leading-relaxed max-w-2xl">
        {total.toLocaleString()} current opportunities across the Dallas metro,
        gathered weekly from local volunteer portals and nonprofits. Pick a cause
        or a city, and every listing links to the original posting where you
        sign up directly with the organization.
      </p>

      <h2 className="mt-10 font-bold text-xl text-ink">By cause</h2>
      <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {tags.map(({ tag, count }) => {
          const meta = tagMeta(tag)
          return (
            <li key={tag}>
              <Link
                href={`/volunteer/${tagSlug(tag)}`}
                className="flex items-center gap-2.5 rounded-xl border border-line bg-white px-4 py-3 hover:border-brand transition-colors"
              >
                <span aria-hidden>{meta.icon}</span>
                <span className="font-semibold text-ink">{meta.label}</span>
                <span className="ml-auto font-mono text-xs text-muted">{count}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      <h2 className="mt-10 font-bold text-xl text-ink">By city</h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {cities.map(({ city, slug, count }) => (
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

      <p className="mt-12 text-sm text-muted leading-relaxed max-w-2xl">
        Prefer searching? The <Link href="/" className="text-brand font-semibold hover:text-brandDark">interactive
        home page</Link> has keyword search, filters, and an AI-powered Smart Search.
      </p>
    </main>
  )
}
