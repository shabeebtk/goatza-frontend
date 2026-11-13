/**
 * /squad-invite/<token> — where a squad's invite link lands, usually from the
 * club's WhatsApp group.
 *
 * In `(public)` because most people opening it have no account yet, and built
 * exactly like /org-invite/<token>, because the token is the same kind of
 * credential: noindex and nocache so a link in a search result cannot be used by
 * anybody, no generateMetadata and one generic title so a forwarded link cannot
 * expand into a preview naming the squad, no-referrer so the URL is not handed to
 * a third-party origin, and force-dynamic because what is behind a token changes
 * the moment it is answered. In no sitemap.
 */

import type { Metadata } from "next"

import SquadInvitePage from "@/features/squads/components/SquadInvitePage/SquadInvitePage"

export const metadata: Metadata = {
  title: "Squad invite · Goatza",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
}

export const dynamic = "force-dynamic"

export default async function SquadInviteRoute({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  return <SquadInvitePage token={token} />
}
