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

import PublicProfileView from "@/features/profile/components/PublicProfileView/PublicProfileView"
import {
  getPublicUserProfileResult,
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
  const result = await getPublicUserProfileResult(username)

  // A hidden, missing or unreachable profile gets generic metadata. Critically
  // it must NOT carry the person's name: the whole point of the toggle is that
  // a logged-out visitor learns nothing.
  //
  // `noindex` is what actually keeps an unavailable profile out of search —
  // and it is why the page below no longer needs notFound() to do that job.
  if (result.status !== "ok") {
    return {
      title: "Profile · Goatza",
      description: "Where the Greatest Get Discovered",
      robots: { index: false, follow: false },
    }
  }

  const profile = result.data.profile
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
  const result = await getPublicUserProfileResult(username)
  const bundle = result.status === "ok" ? result.data : null

  // Deliberately NOT notFound() when the bundle is missing.
  //
  // This response is shared by two very different visitors, and only one of
  // them is bound by the public payload. A profile with "Public profile" off
  // 404s here by design — but a signed-in Goatza user is still entitled to see
  // it, and hard-404ing the route took that away from them. The same line also
  // meant one unreachable API turned every profile on the site into a 404 page.
  //
  // Telling the two visitors apart on the server means reading cookies, which
  // opts the route out of ISR — and cheap viral traffic is the reason this page
  // is server-rendered at all. So the route always renders and the client
  // decides: PublicProfileView falls back to the authenticated fetch for a
  // signed-in visitor, and shows an unavailable panel for a stranger.
  //
  // The cost is that a bogus username answers 200 instead of 404 for anonymous
  // visitors. `robots: noindex` above is what keeps it out of search, which is
  // the part that actually mattered.
  const origin = siteOrigin()

  return (
    <>
      {bundle && (
        <script
          type="application/ld+json"
          // Serialised from our own typed payload, never from user input as
          // markup — the values are strings from our API and JSON.stringify
          // escapes them.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              personJsonLd(
                bundle.profile,
                `${origin}/profile/${bundle.profile.username}`
              )
            ),
          }}
        />
      )}
      <PublicProfileView username={username} bundle={bundle} />
    </>
  )
}
