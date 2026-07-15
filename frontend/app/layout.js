// layout.js — outermost wrapper for every page.
// Loads Inter + JetBrains Mono, sets site-wide metadata (title template,
// OpenGraph, robots), and embeds Organization/WebSite JSON-LD so search
// engines and AI crawlers can identify the site without executing JS.

import './globals.css'

const SITE_URL = 'https://www.good-deeds-dallas.org'
const SITE_NAME = 'Good Deeds Dallas'
const SITE_DESCRIPTION =
  'A free index of volunteer opportunities across Dallas–Fort Worth, ' +
  'pulled weekly from local volunteer portals and nonprofits. Find a cause, ' +
  'then sign up directly with the organization.'

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Volunteer opportunities across DFW`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    title: `${SITE_NAME} — Volunteer opportunities across DFW`,
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
}

// Site-identity structured data (rendered into static HTML for crawlers).
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      email: 'info@good-deeds-dallas.org',
      description: SITE_DESCRIPTION,
      areaServed: 'Dallas–Fort Worth, Texas',
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
      </head>
      <body className="font-sans text-ink antialiased min-h-screen bg-canvas">
        {children}
      </body>
    </html>
  )
}
