// ─────────────────────────────────────────────────────────────
// Public user profile — opens for anyone, logged in or not.
//
// A SERVER component. Three things depend on that and none of them work from
// a client component:
//   * generateMetadata → the Open Graph card. A WhatsApp link with no preview
//     does not get opened, which would make the whole feature pointless.
//   * JSON-LD → rich results in search.
//   * initialData → the bundle is already in hand when <UserProfile> mounts,
//     so there is no fetch waterfall under the server-rendered markup.
// ─────────────────────────────────────────────────────────────

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import PublicProfileView from "@/features/profile/components/PublicProfileView/PublicProfileView"
import {
  getPublicUserProfile,
  siteOrigin,
} from "@/features/profile/services/publicProfile.api"
import {
  buildProfileOgImageUrl,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
} from "@/features/profile/utils/ogImage"
import { personJsonLd } from "@/features/profile/utils/profileJsonLd"
import { getRoleLabel } from "@/shared/constants/roles"

// ISR. A shared profile can go viral in minutes; this makes the thousandth
// open as cheap as the second. Matches the 60s revalidate on the fetch itself
// and the backend's own bundle cache.
export const revalidate = 60

type Params = { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params
  const bundle = await getPublicUserProfile(username)

  // A hidden or missing profile gets generic metadata. Critically it must NOT
  // carry the person's name: the whole point of the toggle is that a
  // logged-out visitor learns nothing, and metadata is rendered before the
  // 404 body is.
  if (!bundle) {
    return {
      title: "Profile · Goatza",
      description: "Where the Greatest Get Discovered",
      robots: { index: false, follow: false },
    }
  }

  const profile = bundle.profile
  const origin = siteOrigin()
  const url = `${origin}/profile/${profile.username}`

  const description =
    profile.headline ||
    [
      getRoleLabel(profile.role),
      profile.primary_sport?.sport,
      profile.location?.city,
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

export default async function PublicUserProfilePage({ params }: Params) {
  const { username } = await params
  const bundle = await getPublicUserProfile(username)

  // Hidden, deactivated, usernameless or nonexistent — all four render the
  // same 404, because the backend deliberately does not distinguish them.
  if (!bundle) notFound()

  const origin = siteOrigin()
  const jsonLd = personJsonLd(
    bundle.profile,
    `${origin}/profile/${bundle.profile.username}`
  )

  return (
    <>
      <script
        type="application/ld+json"
        // Serialised from our own typed payload, never from user input as
        // markup — the values are strings from our API and JSON.stringify
        // escapes them.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicProfileView username={username} bundle={bundle} />
    </>
  )
}
