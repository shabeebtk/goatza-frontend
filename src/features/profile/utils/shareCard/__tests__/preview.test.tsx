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
    ["link-full", "link", bundle(PHOTOS)],
    ["link-bare", "link", bundle({ cover_photo: "", profile_photo: "" }, [])],
  ]

  it.each(cases)("%s", async (name, format, b) => {
    await mkdir(OUT!, { recursive: true })

    const { width, height } = CARD_SIZES[format]
    const response = new ImageResponse(
      <ProfileCard data={toCardData(b, format, undefined)} format={format} />,
      { width, height, fonts: await cardFonts() }
    )

    await writeFile(join(OUT!, `${name}.png`), Buffer.from(await response.arrayBuffer()))
  })
})
