// ─────────────────────────────────────────────────────────────
// Public organization profile — opens for anyone, logged in or not.
// Server component, for the same three reasons as the user twin: OG card,
// JSON-LD, and seeding the client component so there is no fetch waterfall.
// ─────────────────────────────────────────────────────────────

import type { Metadata } from "next"

import PublicOrgProfileView from "@/features/organization/component/PublicOrgProfileView/PublicOrgProfileView"
import { profileMetaDescription } from "@/features/orgPage/pageMeta"
import { fetchPublicPageShowcase } from "@/features/orgPage/services/pageShowcase.api"
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

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params
  // The anonymous page beside the bundle, the same requests the page makes (so
  // they are shared), for a richer description.
  const [result, pageResult] = await Promise.all([
    getPublicOrganizationProfileResult(username),
    fetchPublicPageShowcase(username),
  ])

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

  // The headline (or type · sport · city), then the page's ages, programs and
  // "Enquire on Goatza", cut to 160 at a word. No page: as it always was.
  const description = profileMetaDescription(
    profile,
    pageResult.status === "ok" ? pageResult.data : null
  )

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
  // The page in parallel with the bundle, on the same 60 s revalidate, so the
  // sections arrive with the profile instead of after it.
  const [result, pageResult] = await Promise.all([
    getPublicOrganizationProfileResult(username),
    fetchPublicPageShowcase(username),
  ])
  const bundle = result.status === "ok" ? result.data : null
  // Any miss (the 404, an unreachable API) is null: the profile as it was.
  const pageSeed = pageResult.status === "ok" ? pageResult.data : null

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
      <PublicOrgProfileView username={username} bundle={bundle} pageSeed={pageSeed} />
    </>
  )
}
