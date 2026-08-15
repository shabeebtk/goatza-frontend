// ─────────────────────────────────────────────────────────────
// Public Sports CV — opens for anyone, logged in or not.
//
// A SERVER component, for the same reason the public profile page is one: the
// Open Graph card. A CV link is pasted into a WhatsApp group of coaches, and a
// link with no preview does not get opened.
//
// ── Why this page is noindex, and canonical to the profile ───
//
// The CV is a second presentation of content the profile already carries. Two
// URLs with the same facts compete with each other in search, and the profile
// is the one that should win — it is the richer page, it is what the vanity URL
// and the share card point at, and it is what a person searching a player's
// name is actually looking for. So the CV declares the profile as its canonical
// and asks not to be indexed at all. It is a link you hand someone, not a page
// you are found through.
// ─────────────────────────────────────────────────────────────

import type { Metadata } from "next"

import PublicCVView from "@/features/cv/components/PublicCVView/PublicCVView"
import { cvUrl, getPublicCVResult } from "@/features/cv/services/cv.api"
import { siteOrigin } from "@/features/profile/services/publicProfile.api"
import {
  buildProfileOgImageUrl,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
} from "@/features/profile/utils/ogImage"

// ISR, matching the fetch's own 60s revalidate and the backend's bundle cache.
// A CV doing the rounds in a group chat costs one origin hit a minute.
export const revalidate = 60

type Params = { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params
  const result = await getPublicCVResult(username)

  // A disabled, private, non-player or nonexistent CV gets generic metadata,
  // and critically it must NOT carry the person's name: the point of the
  // toggle is that a visitor who was not given the link learns nothing.
  if (result.status !== "ok") {
    return {
      title: "Sports CV · Goatza",
      description: "Where the Greatest Get Discovered",
      robots: { index: false, follow: false },
    }
  }

  const profile = result.data.profile
  const origin = siteOrigin()
  const url = cvUrl(profile.username)

  const description = [
    profile.primary_sport?.sport,
    profile.age_group,
    profile.location?.city,
  ]
    .filter(Boolean)
    .join(" · ")
    .concat(" — Sports CV on Goatza")

  return {
    title: `${profile.name} — Sports CV · Goatza`,
    description,
    // Points at the PROFILE, not at this page. See the header note.
    alternates: { canonical: `${origin}/profile/${profile.username}` },
    robots: { index: false, follow: true },
    openGraph: {
      type: "profile",
      url,
      title: `${profile.name} — Sports CV`,
      description,
      siteName: "Goatza",
      images: [
        {
          url: buildProfileOgImageUrl(profile, origin),
          width: OG_IMAGE_WIDTH,
          height: OG_IMAGE_HEIGHT,
          alt: profile.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${profile.name} — Sports CV`,
      description,
      images: [buildProfileOgImageUrl(profile, origin)],
    },
  }
}

export default async function PublicCVPage({ params }: Params) {
  const { username } = await params
  const result = await getPublicCVResult(username)
  const cv = result.status === "ok" ? result.data : null

  // Deliberately NOT notFound(), mirroring the public profile page. Two
  // different failures land on null here — "this CV is not public" and "we
  // could not reach the API" — and hard-404ing the route would turn one
  // unreachable backend into a 404 on every CV on the site. `robots: noindex`
  // above is what keeps an unavailable CV out of search, which is the part that
  // actually mattered.
  //
  // Unlike the profile there is no signed-in fallback to render: the CV has no
  // authenticated twin, so an unavailable CV is unavailable for everybody and
  // the panel can be rendered on the server.
  return (
    <PublicCVView username={username} cv={cv} url={cvUrl(username)} />
  )
}
