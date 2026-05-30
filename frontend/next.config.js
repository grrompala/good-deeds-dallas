/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'export' mode generates a fully static site (plain HTML/CSS/JS files) that
  // can be hosted anywhere — GitHub Pages, Netlify, a USB drive. BUT static
  // export has no server, so API routes (e.g. /api/chat for the RAG chatbot)
  // cannot run. Vercel runs Next.js as serverless functions natively, so we
  // disable export here to enable the chatbot. Re-enable this line if you ever
  // want a purely static build again (you'd lose the server API routes).
  // output: 'export',
}

module.exports = nextConfig
