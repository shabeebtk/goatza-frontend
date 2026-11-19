/**
 * The org profile's metadata: the page's facts join the description (cut to
 * 160 at a word), and a hidden profile keeps its generic, unindexed title.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACADEMY_PAGE } from "@/features/orgPage/__fixtures__/pageShowcase"

const mocks = vi.hoisted(() => ({ profile: vi.fn(), page: vi.fn() }))

vi.mock("@/features/profile/services/publicProfile.api", () => ({
  getPublicOrganizationProfileResult: mocks.profile,
  siteOrigin: () => "https://goatza.com",
}))
vi.mock("@/features/orgPage/services/pageShowcase.api", () => ({
  fetchPublicPageShowcase: mocks.page,
}))
vi.mock("@/features/profile/utils/ogImage", () => ({
  buildProfileOgImageUrl: () => "https://goatza.com/card/org/kannurfa",
  OG_IMAGE_WIDTH: 1200,
  OG_IMAGE_HEIGHT: 630,
}))
// Metadata only: the view has its own tests.
vi.mock("@/features/organization/component/PublicOrgProfileView/PublicOrgProfileView", () => ({
  default: () => null,
}))

import { generateMetadata } from "./page"

const PROFILE = {
  id: "org-1",
  username: "kannurfa",
  name: "Kannur Football Academy",
  type: "academy",
  is_verified: false,
  created_at: "2024-01-01T00:00:00Z",
  logo: "",
  cover_image: "",
  headline: "",
  description: "",
  website: "",
  level: "",
  followers_count: 0,
  following_count: 0,
  posts_count: 0,
  sports: [{ id: "s-1", name: "Football", icon_name: "", icon_url: "", is_primary: true }],
  locations: [
    {
      id: "loc-1",
      name: "Thana Turf",
      address: "",
      city: "Kannur",
      state: "Kerala",
      country_code: "IN",
      latitude: null,
      longitude: null,
      is_primary: true,
    },
  ],
}

const params = () => Promise.resolve({ username: "kannurfa" })

beforeEach(() => {
  mocks.profile.mockReset()
  mocks.page.mockReset()
})

describe("org profile metadata", () => {
  it("adds the page's ages, programs and the form to the description", async () => {
    mocks.profile.mockResolvedValue({ status: "ok", data: { profile: PROFILE } })
    mocks.page.mockResolvedValue({ status: "ok", data: ACADEMY_PAGE })

    const meta = await generateMetadata({ params: params() })

    expect(meta.description).toBe("Academy · Football · Kannur · Ages 6 – 18 · 2 programs · Enquire on Goatza")
    expect(meta.openGraph?.description).toBe(meta.description)
    // The rest is as it was.
    expect(meta.title).toBe("Kannur Football Academy (@kannurfa) · Goatza")
    expect(meta.alternates?.canonical).toBe("https://goatza.com/organization/profile/kannurfa")
  })

  it("cuts a long description to 160 characters at a word", async () => {
    const headline = "Grassroots football coaching for boys and girls across Kannur district ".repeat(3).trim()
    mocks.profile.mockResolvedValue({ status: "ok", data: { profile: { ...PROFILE, headline } } })
    mocks.page.mockResolvedValue({ status: "ok", data: ACADEMY_PAGE })

    const meta = await generateMetadata({ params: params() })
    const description = String(meta.description)

    expect(description.length).toBeLessThanOrEqual(160)
    expect(description.endsWith("…")).toBe(true)
    expect(headline.startsWith(description.slice(0, -1))).toBe(true)
    expect(headline.charAt(description.length - 1)).toBe(" ")
  })

  it("keeps the old description when the page read misses", async () => {
    mocks.profile.mockResolvedValue({ status: "ok", data: { profile: PROFILE } })
    mocks.page.mockResolvedValue({ status: "unavailable", reason: "fetch_failed" })

    const meta = await generateMetadata({ params: params() })

    expect(meta.description).toBe("Academy · Football · Kannur on Goatza")
  })

  it("gives a hidden profile the generic, unindexed title, whatever the page says", async () => {
    mocks.profile.mockResolvedValue({ status: "not_found" })
    mocks.page.mockResolvedValue({ status: "ok", data: ACADEMY_PAGE })

    const meta = await generateMetadata({ params: params() })

    expect(meta.title).toBe("Organization · Goatza")
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(JSON.stringify(meta)).not.toContain("Kannur")
  })
})
