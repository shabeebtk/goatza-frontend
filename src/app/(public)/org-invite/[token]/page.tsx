/**
 * /org-invite/<token> — where an organization invite email lands.
 *
 * In `(public)` for the same reason as the parent consent page: its layout is not
 * wrapped in AuthGuard, and most people opening this have no account yet.
 *
 * THE TOKEN IS A CREDENTIAL, so this follows that page exactly: noindex and
 * nocache so a link in a search result cannot be pressed by anybody, no
 * generateMetadata and one generic title so a forwarded link cannot expand into a
 * preview naming the club, no-referrer so the URL is not handed to a third-party
 * origin, and force-dynamic because the state behind a token changes the moment it
 * is answered. In no sitemap.
 */

import type { Metadata } from "next"

import OrgInvitePage from "@/features/orgMembers/components/OrgInvitePage/OrgInvitePage"

export const metadata: Metadata = {
  title: "Invitation · Goatza",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
}

export const dynamic = "force-dynamic"

export default async function OrgInviteRoute({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return <OrgInvitePage token={token} />
}
