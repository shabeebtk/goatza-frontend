/**
 * /guardian/<token> — the parent's consent page.
 *
 * Inside `(public)` for the same reason the legal pages are: that layout is a
 * server component and is NOT wrapped in AuthGuard, which would bounce the
 * exact visitor this page exists for — somebody with no account and no
 * intention of making one — straight to a login screen.
 *
 * THE TOKEN IS A CREDENTIAL, and everything below follows from that:
 *
 *   * `robots: { index: false, follow: false }` and `nocache`. A consent link
 *     that turns up in a search result is a consent link anybody can press.
 *     The URL also carries no `alternates.canonical` and appears in no sitemap.
 *   * No `generateMetadata`, so nothing about the child can leak into a title,
 *     a description or an Open Graph card — the very things a chat app expands
 *     into a preview when the parent forwards the email to the other parent.
 *     The title below is the same eight words for every token in existence.
 *   * `dynamic = "force-dynamic"`. There is nothing to prerender and nothing
 *     to cache: the state behind a token changes the moment the parent acts.
 *
 * The page itself is a client component. It has to be — the whole surface is a
 * form with four outcomes — and it fetches with the token from here rather than
 * reading the route params itself, so there is one place that decides what a
 * token is.
 */

import type { Metadata } from "next"

import PublicConsentPage from "@/features/guardian/components/PublicConsentPage/PublicConsentPage"

export const metadata: Metadata = {
  // Deliberately generic. See the note above on forwarded links.
  title: "Parent approval · Goatza",
  robots: { index: false, follow: false, nocache: true },
}

export const dynamic = "force-dynamic"

export default async function GuardianConsentRoute({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return <PublicConsentPage token={token} />
}
