// robots.js — served at /robots.txt.
// Everything is open. The named entries are redundant with `*` but document
// intent for the crawlers we specifically care about: Google Search, Bing
// (whose index also feeds ChatGPT Search), Gemini grounding (Google-Extended),
// and OpenAI's search/browse/training fetchers.

const SITE_URL = 'https://www.good-deeds-dallas.org'

export default function robots() {
  const welcome = [
    'Googlebot',
    'Bingbot',
    'Google-Extended',
    'GPTBot',
    'OAI-SearchBot',
    'ChatGPT-User',
  ]
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      ...welcome.map(userAgent => ({ userAgent, allow: '/' })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
