// ─────────────────────────────────────────────────────────────
// Public recruitment — opens for anyone, logged in or not.
//
// A SERVER component, for the same reason the public profile page is one: the
// Open Graph card. This is THE link the product is shared on — a club posts a
// trial and it goes into a WhatsApp group, an Instagram bio, a poster caption —
// and a link with no preview does not get opened.
//
// ── Why /r/ and not /recruitments/ ───────────────────────────
//
// `/recruitments/[recruitmentId]` already exists in the (autheticated) group,
// and Next.js refuses to build two pages resolving to one path whatever route
// group they sit in. The authed route stays exactly as it is — every in-app
// link points at it — and this is the shareable address. `recruitmentUrl()` in
// shared/services emits it; the segment is registered in RESERVED in
// src/app/[username]/page.tsx and in RESERVED_USERNAMES on the backend, like
// every other top-level route.
//
// ── Indexed, unlike the CV ───────────────────────────────────
//
// The Sports CV is noindex because it duplicates a profile that should win the
// search. A recruitment has no other public page: this IS the canonical
// address for "U17 goalkeeper trials in Kozhikode", which is a thing people
// search for and a thing the product wants found.
// ─────────────────────────────────────────────────────────────

import type { Metadata } from "next"

import PublicRecruitmentView from "@/features/recruitments/components/PublicRecruitmentView/PublicRecruitmentView"
import { getPublicRecruitmentResult } from "@/features/recruitments/services/publicRecruitment.api"
import { siteOrigin } from "@/features/profile/services/publicProfile.api"
import { recruitmentPath } from "@/shared/services/recruitmentUrl"

// ISR, matching the fetch's own 60s revalidate. A trial doing the rounds in a
// group chat costs one origin hit a minute, not one per tap.
export const revalidate = 60

type Params = { params: Promise<{ recruitmentId: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { recruitmentId } = await params
  const result = await getPublicRecruitmentResult(recruitmentId)

  // A draft, a closed trial, a followers-only posting and a typo'd uuid all
  // land here, and the metadata must not name the club or the posting for any
  // of them — the backend answers one 404 for all four precisely so a stranger
  // cannot tell them apart, and a rich preview would undo that in one scrape.
  if (result.status !== "ok") {
    return {
      title: "Opportunity · Goatza",
      description: "Where the Greatest Get Discovered",
      robots: { index: false, follow: false },
    }
  }

  const r = result.data
  const origin = siteOrigin()
  const url = `${origin}${recruitmentPath(r.id)}`

  const description =
    r.short_description?.trim() ||
    [r.sport.name, r.city, r.organization.name].filter(Boolean).join(" · ")

  // The posting's own cover — a real object on the media domain, already sized
  // for a 4:5 poster. A video's poster frame stands in for the video; its
  // file_url would hand a scraper an .mp4.
  const cover = r.media?.find((m) => m.media_type === "image") ?? r.media?.[0]
  const image =
    cover?.media_type === "video"
      ? cover.thumbnail_url
      : cover?.file_url || cover?.thumbnail_url

  return {
    title: `${r.title} — ${r.organization.name} · Goatza`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: `${r.title} — ${r.organization.name}`,
      description,
      siteName: "Goatza",
      images: image ? [{ url: image, alt: r.title }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: `${r.title} — ${r.organization.name}`,
      description,
      images: image ? [image] : undefined,
    },
  }
}

export default async function PublicRecruitmentPage({ params }: Params) {
  const { recruitmentId } = await params
  const result = await getPublicRecruitmentResult(recruitmentId)
  const recruitment = result.status === "ok" ? result.data : null

  // Deliberately NOT notFound(), mirroring the public profile and CV pages.
  // Two different failures land on null here — "this posting is not public"
  // and "we could not reach the API" — and hard-404ing the route would turn
  // one unreachable backend into a 404 on every shared trial on the site. It
  // would also take the route away from a SIGNED-IN visitor, who may be a
  // follower entitled to a followers-only posting the anonymous payload
  // refused. `robots: noindex` above keeps an unavailable posting out of
  // search, which is the part that actually mattered.
  return (
    <PublicRecruitmentView
      recruitmentId={recruitmentId}
      recruitment={recruitment}
    />
  )
}
