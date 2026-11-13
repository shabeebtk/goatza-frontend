// ─────────────────────────────────────────────────────────────
// One squad's public page — the showcase. Open to everyone.
// Server component for the same reasons as the club profile: the OG card,
// and seeding the client so an anonymous open has no fetch waterfall. A
// signed-in viewer is read in the browser as themselves.
// ─────────────────────────────────────────────────────────────

import type { Metadata } from "next"

import { siteOrigin } from "@/features/profile/services/publicProfile.api"
import { buildProfileOgImageUrl, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "@/features/profile/utils/ogImage"
import PublicSquadView from "@/features/squads/components/PublicSquadView/PublicSquadView"
import { fetchPublicSquadPage } from "@/features/squads/services/squadsShowcase.api"
import { publicSquadPath } from "@/features/squads/squadUtils"

export const revalidate = 60

type Params = { params: Promise<{ username: string; squadId: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username, squadId } = await params
  const result = await fetchPublicSquadPage(username, squadId)

  // A miss never names the squad: hidden, empty and private all read the same.
  if (result.status !== "ok") {
    return {
      title: "Squad · Goatza",
      description: "Where the Greatest Get Discovered",
      robots: { index: false, follow: false },
    }
  }

  const { squad, organization, counts } = result.data
  const orgName = organization.name || organization.username
  const origin = siteOrigin()
  const url = `${origin}${publicSquadPath(organization.username, squad.id)}`
  const title = `${squad.name} · ${orgName} · Goatza`
  const description = [
    squad.sport.name,
    squad.level_label,
    `${counts.players} ${counts.players === 1 ? "player" : "players"} at ${orgName}`,
  ]
    .filter(Boolean)
    .join(" · ")

  // The squad's own photo when it has one, else the club's preview image.
  const image =
    squad.photo_url && /^https?:\/\//i.test(squad.photo_url)
      ? squad.photo_url
      : buildProfileOgImageUrl({ logo: organization.logo, username: organization.username }, origin)

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: `${squad.name} · ${orgName}`,
      description,
      siteName: "Goatza",
      images: [{ url: image, width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, alt: squad.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${squad.name} · ${orgName}`,
      description,
      images: [image],
    },
  }
}

export default async function PublicSquadPage({ params }: Params) {
  const { username, squadId } = await params
  const result = await fetchPublicSquadPage(username, squadId)

  return (
    <PublicSquadView
      username={username}
      squadId={squadId}
      initial={result.status === "ok" ? result.data : null}
      initialStatus={result.status}
    />
  )
}
