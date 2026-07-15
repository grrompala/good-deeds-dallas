// page.js — Good Deeds Dallas landing page. The whole experience lives in
// components/HomeClient.jsx (shared with the pre-filtered /volunteer routes);
// this server wrapper just mounts it with no initial state.

import HomeClient from '../components/HomeClient'

export const metadata = {
  alternates: { canonical: '/' },
}

export default function Home() {
  return <HomeClient />
}
