// /privacy — plain-language privacy policy. Server-rendered static page.
// Written to honestly describe what this site actually does: no accounts,
// no ad tracking, a short-lived hashed-IP rate-limit log for Smart Search,
// and public listing/Reddit content that links back to its source.

import Link from 'next/link'
import { CONTACT_EMAIL } from '../../components/SourcesBlurb'

export const metadata = {
  title: 'Privacy policy',
  description:
    'What Good Deeds Dallas collects (very little), how Smart Search works, ' +
    'and how we handle public content from other sites.',
  alternates: { canonical: '/privacy' },
}

function Section({ title, children }) {
  return (
    <section className="mt-8">
      <h2 className="font-bold text-lg text-ink">{title}</h2>
      <div className="mt-2 space-y-3 text-sm sm:text-base text-inkSoft leading-relaxed">
        {children}
      </div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-5 sm:px-6 lg:px-10 py-10 lg:py-14">
      <p className="text-sm">
        <Link href="/" className="text-brand font-semibold hover:text-brandDark">
          ← Good Deeds Dallas home
        </Link>
      </p>

      <h1 className="mt-4 font-display font-extrabold text-3xl sm:text-4xl text-ink">
        Privacy policy
      </h1>
      <p className="mt-2 text-sm text-muted">Last updated: July 16, 2026</p>

      <Section title="The short version">
        <p>
          Good Deeds Dallas is a free, non-commercial directory of volunteer
          opportunities in the Dallas–Fort Worth area. You don't create an
          account, we don't run ads, and we don't sell or share data about you.
          The little we do handle is described below.
        </p>
      </Section>

      <Section title="What we collect from visitors">
        <p>
          Browsing the site requires no sign-up and sets no tracking cookies of
          ours. Like nearly every website, our hosting provider (Vercel) keeps
          standard, short-lived server logs (such as IP address and pages
          requested) for security and operations.
        </p>
        <p>
          <strong className="font-semibold text-ink">Smart Search</strong> has a
          daily usage limit. To enforce it, we store a one-way cryptographic
          hash of your IP address with a timestamp. We cannot recover your IP
          from the hash, and these records are deleted automatically within 48
          hours. Your search question is sent to OpenAI to generate the answer;
          we do not store your questions. Your most recent Smart Search
          conversation is kept in your own browser's session storage so it
          survives switching tabs, and it clears when you close the browser tab.
        </p>
        <p>
          If you email us at {CONTACT_EMAIL}, we'll have your email address and
          whatever you send us, which we use only to reply.
        </p>
      </Section>

      <Section title="Services we rely on">
        <p>
          The site runs on Vercel (hosting), Supabase (a database holding
          listing embeddings and the short-lived rate-limit records described
          above), and OpenAI (processing Smart Search questions). Each processes
          data only to provide those functions for us.
        </p>
      </Section>

      <Section title="Content from other sites">
        <p>
          Every volunteer listing shown here is public content gathered from
          the volunteer portals and nonprofit websites named on our home page.
          We show a title, a short excerpt, and details like city and cause,
          and we always link to the original posting. Signing up for an
          opportunity happens on the source site, under that site's own privacy
          policy — not here.
        </p>
        <p>
          The Reddit Threads section shows public posts from local Dallas-area
          subreddits: a title, a truncated excerpt, and a link to the original
          thread on Reddit. We refresh this content weekly, and posts that are
          no longer visible on Reddit age out of our site automatically. If you
          are the author of a post shown here and want it removed, email us and
          we'll take it down promptly.
        </p>
      </Section>

      <Section title="What we don't do">
        <p>
          No ads, no ad trackers, no selling or licensing of data, no AI
          training on anyone's content, and no accounts or profiles of any
          kind.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions, corrections, or removal requests:{' '}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-brand font-semibold hover:text-brandDark"
          >
            {CONTACT_EMAIL}
          </a>
          . If this policy changes, we'll update this page and the date at the
          top.
        </p>
      </Section>
    </main>
  )
}
