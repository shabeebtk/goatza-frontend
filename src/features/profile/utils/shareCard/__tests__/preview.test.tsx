/**
 * Not a test — a way to eyeball the card. Writes PNGs to CARD_PREVIEW_DIR and
 * is skipped unless that variable is set, so it never runs in CI.
 *
 *   CARD_PREVIEW_DIR=/tmp/cards npx vitest run preview
 */

import { describe, it } from "vitest"
import { ImageResponse } from "next/og"
import { writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"

import ProfileCard from "../ProfileCard"
import { toCardData } from "../cardData"
import { cardFonts } from "../fonts"
import { CARD_SIZES, type CardFormat } from "../types"
import { bundle } from "./fixtures"
import type { PublicUserBundle } from "@/features/profile/services/publicProfile.api"

const OUT = process.env.CARD_PREVIEW_DIR

// Cloudinary's public demo account, so a preview shows real photography going
// through the real transforms rather than a stubbed pixel.
const DEMO = "https://res.cloudinary.com/demo/image/upload/v1/"
const PHOTOS = {
  profile_photo: `${DEMO}woman.jpg`,
  cover_photo: `${DEMO}sample.jpg`,
}

/** What the route would encode. Derived from the bundle rather than fixed, so a
 *  long username produces the denser symbol it really would — and every preview
 *  is a QR you can actually point a phone at. */
const qrFor = (b: PublicUserBundle) =>
  `https://goatza.com/profile/${b.profile.username}?ref=card`

describe.skipIf(!OUT)("previews", () => {
  const cases: [string, CardFormat, PublicUserBundle][] = [
    ["story-full", "story", bundle(PHOTOS)],
    ["story-no-cover", "story", bundle({ ...PHOTOS, cover_photo: "" })],
    ["story-no-avatar-no-club", "story", bundle({ ...PHOTOS, profile_photo: "" }, [])],
    [
      "story-long-name",
      "story",
      bundle({ ...PHOTOS, name: "Subramanian Venkataraghavan" }),
    ],
    [
      "story-30-char-word",
      "story",
      bundle({ ...PHOTOS, name: "Venkataraghavanchandrasekharan" }),
    ],
    // Latin-1 in every face at once. If the subset in public/fonts/ is wrong,
    // this is where tofu shows up.
    [
      "story-accented",
      "story",
      bundle({ ...PHOTOS, name: "José Muñoz-Nuñez", location: {
        name: "Kozhikode", city: "Kozhikodé", country_code: "IN",
      } }),
    ],
    // The footer's worst case, and the one to look at after touching any of its
    // measurements. `username` is a 50-character column on the backend, so the
    // printed URL is the widest thing in the left column AND the longest string
    // in the QR — which pushes the symbol to a higher version, i.e. more and
    // smaller modules. Neither may reach the panel.
    [
      "story-long-username",
      "story",
      bundle({ ...PHOTOS, username: "aravind-menon-calicut-fc-winger-kerala-india-2026" }),
    ],
    ["link-full", "link", bundle(PHOTOS)],
    ["link-bare", "link", bundle({ cover_photo: "", profile_photo: "" }, [])],
  ]

  it.each(cases)("%s", async (name, format, b) => {
    await mkdir(OUT!, { recursive: true })

    const { width, height } = CARD_SIZES[format]
    const response = new ImageResponse(
      <ProfileCard data={toCardData(b, format, undefined, qrFor(b))} format={format} />,
      { width, height, fonts: await cardFonts() }
    )

    await writeFile(join(OUT!, `${name}.png`), Buffer.from(await response.arrayBuffer()))
  })

  // The same card with the QR switched off, to check the left column still
  // reads as a deliberate composition rather than an amputated row.
  it("story-no-qr", async () => {
    await mkdir(OUT!, { recursive: true })

    const response = new ImageResponse(
      <ProfileCard data={toCardData(bundle(PHOTOS), "story", undefined, null)} format="story" />,
      { ...CARD_SIZES.story, fonts: await cardFonts() }
    )

    await writeFile(join(OUT!, "story-no-qr.png"), Buffer.from(await response.arrayBuffer()))
  })
})
