// ─────────────────────────────────────────────────────────────
// Public organization profile — opens for anyone, logged in or not.
// Server component, for the same three reasons as the user twin: OG card,
// JSON-LD, and seeding the client component so there is no fetch waterfall.
// ─────────────────────────────────────────────────────────────

import type { Metadata } from "next"

import PublicOrgProfileView from "@/features/organization/component/PublicOrgProfileView/PublicOrgProfileView"
import {
  getPublicOrganizationProfileResult,
  siteOrigin,
} from "@/features/profile/services/publicProfile.api"
import {
  buildProfileOgImageUrl,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
} from "@/features/profile/utils/ogImage"
import { sportsOrganizationJsonLd } from "@/features/profile/utils/profileJsonLd"

export const revalidate = 60

type Params = { params: Promise<{ username: string }> }

const ORG_TYPE_LABELS: Record<string, string> = {
  club: "Club",
  team: "Team",
  academy: "Academy",
  school: "School / College",
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params
  const result = await getPublicOrganizationProfileResult(username)

  // Never leak the org's name from a hidden, missing or unreachable profile —
  // same rule as the user page, and `noindex` does the same job here.
  if (result.status !== "ok") {
    return {
      title: "Organization · Goatza",
      description: "Where the Greatest Get Discovered",
      robots: { index: false, follow: false },
    }
  }

  const profile = result.data.profile
  const origin = siteOrigin()
  const url = `${origin}/organization/profile/${profile.username}`

  const primaryLocation =
    profile.locations.find((l) => l.is_primary) ?? profile.locations[0]

  const description =
    profile.headline ||
    [
      ORG_TYPE_LABELS[profile.type] ?? profile.type,
      profile.sports.find((s) => s.is_primary)?.name ?? profile.sports[0]?.name,
      primaryLocation?.city,
    ]
      .filter(Boolean)
      .join(" · ")
      .concat(" on Goatza")

  const image = buildProfileOgImageUrl(profile, origin)

  return {
    title: `${profile.name} (@${profile.username}) · Goatza`,
    description,
    alternates: { canonical: url },
    openGraph: {
      // "profile" is the right OG type for an account page whether the account
      // is a person or an organization; there is no org-specific value.
      type: "profile",
      url,
      title: `${profile.name} (@${profile.username})`,
      description,
      siteName: "Goatza",
      images: [
        { url: image, width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, alt: profile.name },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${profile.name} (@${profile.username})`,
      description,
      images: [image],
    },
  }
}

export default async function PublicOrgProfilePage({ params }: Params) {
  const { username } = await params
  const result = await getPublicOrganizationProfileResult(username)
  const bundle = result.status === "ok" ? result.data : null

  // No notFound() — see the long comment on the user twin. In short: a signed-in
  // visitor is entitled to a profile the public payload refuses, and hard-404ing
  // the route on the anonymous answer took that away from them.
  const origin = siteOrigin()

  return (
    <>
      {bundle && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              sportsOrganizationJsonLd(
                bundle.profile,
                `${origin}/organization/profile/${bundle.profile.username}`
              )
            ),
          }}
        />
      )}
      <PublicOrgProfileView username={username} bundle={bundle} />
    </>
  )
}
