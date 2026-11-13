// ─────────────────────────────────────────────────────────────
// All of a club's squads — open to everyone, logged in or not.
// Server component: the anonymous read seeds the client (ISR, 60 s), and a
// signed-in viewer is read in the browser as themselves (blocks apply).
// ─────────────────────────────────────────────────────────────

import type { Metadata } from "next"

import { siteOrigin } from "@/features/profile/services/publicProfile.api"
import PublicSquadsList from "@/features/squads/components/PublicSquadsList/PublicSquadsList"
import { fetchPublicSquadShowcase } from "@/features/squads/services/squadsShowcase.api"
import { publicSquadsPath } from "@/features/squads/squadUtils"

export const revalidate = 60

type Params = { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params
  const result = await fetchPublicSquadShowcase(username)

  // Never the club's name from a list the public payload refuses.
  if (result.status !== "ok" || result.data.squads.length === 0) {
    return {
      title: "Squads · Goatza",
      robots: { index: false, follow: false },
    }
  }

  const org = result.data.organization
  const name = org.name || org.username
  const url = `${siteOrigin()}${publicSquadsPath(org.username)}`
  const count = result.data.squads.length

  return {
    title: `Squads · ${name} · Goatza`,
    description: `${count} ${count === 1 ? "squad" : "squads"} at ${name} on Goatza`,
    alternates: { canonical: url },
  }
}

export default async function PublicOrgSquadsPage({ params }: Params) {
  const { username } = await params
  const result = await fetchPublicSquadShowcase(username)

  return (
    <PublicSquadsList
      username={username}
      initial={result.status === "ok" ? result.data : null}
      initialStatus={result.status}
    />
  )
}
