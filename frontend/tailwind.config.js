/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],

  theme: {
    extend: {
      // ─── PALETTE — fun-tech, readable, Texas-warm ───────────────────────────
      // Light surface + indigo primary + warm orange accent.
      // Change these values to re-skin everything.
      colors: {
        ink:       '#0B1220',  // primary text
        inkSoft:   '#1F2937',  // body text alt
        muted:     '#64748b',  // secondary text (slate-500)
        subtle:    '#94a3b8',  // tertiary text / icons (slate-400)
        line:      '#e5e7eb',  // standard borders (gray-200)
        lineSoft:  '#f1f5f9',  // very subtle dividers (slate-100)
        surface:   '#ffffff',  // cards, table bg
        canvas:    '#f8fafc',  // page background (slate-50)
        brand:     '#4f46e5',  // indigo-600 — primary action color
        brandDark: '#4338ca',  // indigo-700 — hover state
        brandSoft: '#eef2ff',  // indigo-50 — tag bg
        accent:    '#ea580c',  // orange-600 — warm "howdy" highlight
        accentSoft:'#fff7ed',  // orange-50 — accent bg
        // City colors for badges (used as accents on each card)
        richardson:'#1e40af',  // deep blue
        garland:   '#15803d',  // green
        dallas:    '#b91c1c',  // red
      },

      fontFamily: {
        sans:  ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono:  ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['Inter', 'system-ui', 'sans-serif'],   // also Inter, just bold/tight
      },

      fontSize: {
        'hero':    ['clamp(2.75rem, 6vw, 4.5rem)', { lineHeight: '1.02', letterSpacing: '-0.035em' }],
        'h2':      ['clamp(1.5rem, 2.5vw, 2rem)',  { lineHeight: '1.15', letterSpacing: '-0.015em' }],
      },

      boxShadow: {
        'card':       '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)',
        'cardHover':  '0 6px 16px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.06)',
        'searchbar':  '0 4px 14px rgba(79,70,229,0.10), 0 1px 3px rgba(15,23,42,0.05)',
      },

      backgroundImage: {
        'sunset': 'linear-gradient(135deg, #fef3c7 0%, #fed7aa 50%, #fecaca 100%)',
      },
    },
  },

  plugins: [],
}
