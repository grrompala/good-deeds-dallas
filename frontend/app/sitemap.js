// sitemap.js — served at /sitemap.xml.
// Home + the crawlable /volunteer browse pages (per-cause and per-city).
// Regenerates on every deploy, so the weekly data-refresh commit keeps
// lastModified and the page list current automatically.

import { loadListings, tagCounts, tagSlug, cityCounts } from '../lib/listings'

const SITE_URL = 'https://www.good-deeds-dallas.org'

export default function sitemap() {
  // Most recent scrape timestamp across the corpus = site-wide lastModified.
  const timestamps = loadListings().map(o => o.last_scraped).filter(Boolean)
  const lastModified = timestamps.length
    ? new Date(timestamps.reduce((max, t) => (t > max ? t : max)))
    : new Date()

  return [
    { url: SITE_URL, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/volunteer`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
    ...tagCounts().map(({ tag }) => ({
      url: `${SITE_URL}/volunteer/${tagSlug(tag)}`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.8,
    })),
    ...cityCounts().map(({ slug }) => ({
      url: `${SITE_URL}/volunteer/in/${slug}`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.8,
    })),
  ]
}
