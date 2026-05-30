// layout.js — outermost wrapper for every page.
// Loads Inter + JetBrains Mono. Sets the browser-tab title and SEO description.

import './globals.css'

export const metadata = {
  title: "Y'all Volunteer — Dallas-area volunteer opportunities",
  description: "A friendly index of volunteer opportunities across Dallas, Richardson, Garland, and the wider DFW area.",
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
      </head>
      <body className="font-sans text-ink antialiased min-h-screen bg-canvas">
        {children}
      </body>
    </html>
  )
}
