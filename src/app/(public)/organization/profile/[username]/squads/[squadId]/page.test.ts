/**
 * The squad page's metadata: what a link to it unfurls into. A miss must never
 * name the squad, and a hit must give crawlers the canonical URL and an image.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ShowcaseSquadPage } from "@/features/squads/types"

const mocks = vi.hoisted(() => ({ fetchPage: vi.fn() }))

vi.mock("@/features/squads/services/squadsShowcase.api", () => ({
  fetchPublicSquadPage: mocks.fetchPage,
}))
vi.mock("@/features/profile/services/publicProfile.api", () => ({
  siteOrigin: () => "https://goatza.com",
}))
// Metadata only: the view is its own test.
vi.mock("@/features/squads/components/PublicSquadView/PublicSquadView", () => ({
  default: () => null,
}))

import { generateMetadata } from "./page"

const SQUAD_PAGE: ShowcaseSquadPage = {
  organization: {
    id: "org-1",
    name: "Dream FC",
    username: "dreamfc",
    logo: "https://media.goatza.com/organizations/org-1/logo.webp",
    is_verified: true,
    type: "club",
  },
  squad: {
    id: "sq-1",
    name: "U17 Boys",
    sport: { id: "sport-1", name: "Football", icon_name: "mdi:soccer" },
    level: "youth",
    level_label: "Youth",
    age_group: "U17",
    season: "2026–27",
    description: "",
    photo_url: "https://media.goatza.com/organizations/org-1/squads/sq-1.webp",
  },
  config: {
    uses_positions: true,
    uses_jersey_numbers: true,
    member_noun: "player",
    member_noun_plural: "players",
  },
  staff: [],
  counts: { players: 18, staff: 2 },
  captain_member_id: null,
  groups: [],
  other_squads: [],
}

const params = () => Promise.resolve({ username: "dreamfc", squadId: "sq-1" })

beforeEach(() => {
  mocks.fetchPage.mockReset()
})

describe("squad page metadata", () => {
  it("gives a miss one generic, unindexed title that never names the squad", async () => {
    mocks.fetchPage.mockResolvedValue({ status: "not_found" })

    const meta = await generateMetadata({ params: params() })

    expect(meta.title).toBe("Squad · Goatza")
    expect(meta.robots).toMatchObject({ index: false, follow: false })
    expect(JSON.stringify(meta)).not.toContain("U17 Boys")
    expect(JSON.stringify(meta)).not.toContain("Dream FC")
    expect(mocks.fetchPage).toHaveBeenCalledWith("dreamfc", "sq-1")
  })

  it("treats an unreachable API the same as a miss", async () => {
    mocks.fetchPage.mockResolvedValue({ status: "unavailable", reason: "fetch_failed" })

    const meta = await generateMetadata({ params: params() })

    expect(meta.title).toBe("Squad · Goatza")
    expect(meta.robots).toMatchObject({ index: false })
  })

  it("names the squad and its club, with the canonical URL and the squad's photo", async () => {
    mocks.fetchPage.mockResolvedValue({ status: "ok", data: SQUAD_PAGE })

    const meta = await generateMetadata({ params: params() })

    expect(meta.title).toBe("U17 Boys · Dream FC · Goatza")
    expect(meta.description).toBe("Football · Youth · 18 players at Dream FC")
    expect(meta.alternates?.canonical).toBe(
      "https://goatza.com/organization/profile/dreamfc/squads/sq-1"
    )
    const images = meta.openGraph?.images as { url: string }[]
    expect(images[0].url).toBe(SQUAD_PAGE.squad.photo_url)
    expect(meta.robots).toBeUndefined()
  })

  it("falls back to the club's image when the squad has no photo", async () => {
    mocks.fetchPage.mockResolvedValue({
      status: "ok",
      data: { ...SQUAD_PAGE, squad: { ...SQUAD_PAGE.squad, photo_url: "" } },
    })

    const meta = await generateMetadata({ params: params() })

    const images = meta.openGraph?.images as { url: string }[]
    expect(images[0].url).toBe(SQUAD_PAGE.organization.logo)
  })

  it("says 1 player, not 1 players", async () => {
    mocks.fetchPage.mockResolvedValue({
      status: "ok",
      data: { ...SQUAD_PAGE, counts: { players: 1, staff: 0 } },
    })

    const meta = await generateMetadata({ params: params() })

    expect(meta.description).toBe("Football · Youth · 1 player at Dream FC")
  })
})
