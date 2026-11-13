// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { ShowcaseSquadPage } from "../../types"
import PublicSquadView from "./PublicSquadView"
import styles from "./PublicSquadView.module.css"

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  getPage: vi.fn(),
  fetchPage: vi.fn(),
  back: vi.fn(),
}))

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("@/shared/hooks/useSmartBack", () => ({ useSmartBack: () => mocks.back }))
vi.mock("@/features/profile/components/PublicCtaBar/PublicCtaBar", () => ({
  default: ({ displayName, nextPath }: { displayName: string; nextPath: string }) => (
    <div data-testid="cta" data-name={displayName} data-next={nextPath} />
  ),
}))
vi.mock("@/features/profile/services/publicProfile.api", () => ({
  siteOrigin: () => "https://goatza.com",
  fetchPublic: vi.fn(),
}))
vi.mock("../../services/squadsShowcase.api", () => ({
  getSquadShowcasePageApi: mocks.getPage,
  fetchPublicSquadPage: mocks.fetchPage,
  getSquadShowcaseApi: vi.fn(),
  fetchPublicSquadShowcase: vi.fn(),
}))

const PATH = "/organization/profile/dreamfc/squads/sq-1"

const page = (overrides: Partial<ShowcaseSquadPage> = {}): ShowcaseSquadPage => ({
  organization: {
    id: "org-1",
    name: "Dream FC",
    username: "dreamfc",
    logo: "",
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
    description: "Our under-17 side.",
    photo_url: "",
  },
  config: {
    uses_positions: true,
    uses_jersey_numbers: true,
    member_noun: "player",
    member_noun_plural: "players",
  },
  staff: [
    { name: "Ravi Menon", username: "ravi", photo: "", role_label: "Head coach" },
    { name: "Sam Staff", username: "", photo: "", role_label: "Physio" },
  ],
  counts: { players: 5, staff: 2 },
  captain_member_id: "m-1",
  groups: [
    {
      name: "Goalkeepers",
      count: 1,
      hidden_count: 0,
      members: [
        {
          id: "m-1",
          name: "Asha Player",
          username: "asha",
          photo: "",
          position: { id: "p-1", name: "Goalkeeper" },
          jersey_number: 1,
          is_captain: true,
        },
      ],
    },
    {
      name: "Defenders",
      count: 4,
      hidden_count: 2,
      members: [
        {
          id: "m-2",
          name: "Bilal Player",
          username: "bilal",
          photo: "",
          position: { id: "p-2", name: "Defender" },
          jersey_number: 4,
          is_captain: false,
        },
        {
          id: "m-3",
          name: "Chen Player",
          username: "chen",
          photo: "",
          position: null,
          jersey_number: null,
          is_captain: false,
        },
      ],
    },
    { name: "Forwards", count: 0, hidden_count: 0, members: [] },
  ],
  other_squads: [
    { id: "sq-2", name: "Seniors", sport: { id: "sport-1", name: "Football", icon_name: "" }, members_count: 22 },
  ],
  ...overrides,
})

const setAuth = (isAuthenticated: boolean) =>
  useAuthStore.setState({
    isAuthenticated,
    isLoading: false,
    user: isAuthenticated ? ({ id: "user-1", username: "olive" } as never) : null,
  })

const renderView = (
  initial: ShowcaseSquadPage | null = page(),
  initialStatus: "ok" | "not_found" | "unavailable" = "ok"
) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PublicSquadView username="dreamfc" squadId="sq-1" initial={initial} initialStatus={initialStatus} />
    </QueryClientProvider>
  )

const cardOf = (name: string) =>
  screen.getByText(name).closest(`.${styles.playerCard}`) as HTMLElement

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  setAuth(false)
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
})

afterEach(cleanup)

describe("PublicSquadView · anonymous (seeded by the server)", () => {
  it("shows the hero, the groups with their counts, and a card per listed player", () => {
    renderView()

    expect(screen.getByRole("heading", { level: 1, name: "U17 Boys" })).toBeTruthy()
    const goalkeepers = screen.getByRole("region", { name: "Goalkeepers" })
    expect(within(goalkeepers).getByRole("heading").textContent).toBe("Goalkeepers 1")
    const defenders = screen.getByRole("region", { name: "Defenders" })
    // The count is the whole group, hidden players included.
    expect(within(defenders).getByRole("heading").textContent).toBe("Defenders 4")
    // A group with nobody in it is not drawn.
    expect(screen.queryByRole("region", { name: "Forwards" })).toBeNull()

    const asha = cardOf("Asha Player")
    expect(asha.tagName).toBe("A")
    expect(asha.getAttribute("href")).toBe("/profile/asha")
    expect(within(asha).getByText("Goalkeeper · #1")).toBeTruthy()
    // No server fetch from the browser: the seed is the data.
    expect(mocks.fetchPage).not.toHaveBeenCalled()
    expect(mocks.getPage).not.toHaveBeenCalled()
  })

  it("draws the big shirt number only when the sport uses numbers", () => {
    const { container } = renderView()
    const numbers = Array.from(container.querySelectorAll(`.${styles.bigNumber}`)).map(
      (node) => node.textContent
    )
    expect(numbers).toEqual(["1", "4"])
    cleanup()

    const noNumbers = renderView(
      page({ config: { ...page().config, uses_jersey_numbers: false } })
    )
    expect(noNumbers.container.querySelectorAll(`.${styles.bigNumber}`)).toHaveLength(0)
    expect(screen.queryByText("Goalkeeper · #1")).toBeNull()
    expect(screen.getByText("Goalkeeper")).toBeTruthy()
  })

  it("marks the captain with a badge and a brand border", () => {
    renderView()

    const asha = cardOf("Asha Player")
    expect(asha.className).toContain(styles.playerCaptain)
    expect(asha.querySelector('[title="Captain"]')).toBeTruthy()

    const bilal = cardOf("Bilal Player")
    expect(bilal.className).not.toContain(styles.playerCaptain)
    expect(bilal.querySelector('[title="Captain"]')).toBeNull()
  })

  it("shows hidden players as one sign-in tile, only where there are some", () => {
    const { container } = renderView()

    const tiles = container.querySelectorAll(`.${styles.hiddenTile}`)
    expect(tiles).toHaveLength(1)
    const tile = tiles[0] as HTMLAnchorElement
    expect(tile.textContent).toContain("2 more players")
    expect(tile.textContent).toContain("Sign in to see")

    const href = tile.getAttribute("href") as string
    expect(href.startsWith("/auth")).toBe(true)
    expect(new URL(href, "https://goatza.com").searchParams.get("next")).toBe(PATH)
    expect(within(screen.getByRole("region", { name: "Defenders" })).getByText("2 more players")).toBeTruthy()
  })

  it("says one more player in the singular", () => {
    const base = page()
    renderView(
      page({ groups: [{ ...base.groups[1], hidden_count: 1 }] })
    )
    expect(screen.getByText("1 more player")).toBeTruthy()
  })

  it("links a staff chip only when the person has a username", () => {
    renderView()

    const ravi = screen.getByText("Ravi Menon").closest(`.${styles.staffChip}`) as HTMLElement
    expect(ravi.tagName).toBe("A")
    expect(ravi.getAttribute("href")).toBe("/profile/ravi")
    expect(within(ravi).getByText("Head coach")).toBeTruthy()

    const sam = screen.getByText("Sam Staff").closest(`.${styles.staffChip}`) as HTMLElement
    expect(sam.tagName).toBe("SPAN")
  })

  it("lists the club's other squads, each linking to its page", () => {
    renderView()

    expect(screen.getByRole("heading", { name: "More from Dream FC" })).toBeTruthy()
    const seniors = screen.getByText("Seniors").closest("a") as HTMLAnchorElement
    expect(seniors.getAttribute("href")).toBe("/organization/profile/dreamfc/squads/sq-2")
    expect(within(seniors).getByText("22 players")).toBeTruthy()
  })

  it("shows the About text and the stats, with the captain's number", () => {
    const { container } = renderView()

    expect(screen.getByText("Our under-17 side.")).toBeTruthy()
    const stats = container.querySelector(`.${styles.stats}`) as HTMLElement
    expect(within(stats).getByText("Players")).toBeTruthy()
    expect(within(stats).getByText("5")).toBeTruthy()
    expect(within(stats).getByText("Captain")).toBeTruthy()
    expect(within(stats).getByText("#1")).toBeTruthy()
  })

  it("names the captain by first name when the sport has no numbers", () => {
    const { container } = renderView(
      page({ config: { ...page().config, uses_jersey_numbers: false } })
    )
    const stats = container.querySelector(`.${styles.stats}`) as HTMLElement
    expect(within(stats).getByText("Asha")).toBeTruthy()
  })

  it("leaves the Captain cell out when there is no captain", () => {
    const { container } = renderView(page({ captain_member_id: null }))
    const stats = container.querySelector(`.${styles.stats}`) as HTMLElement
    expect(within(stats).queryByText("Captain")).toBeNull()
    expect(within(stats).getByText("Staff")).toBeTruthy()
  })

  it("shares by copying the absolute URL when there is no share sheet", async () => {
    renderView()

    fireEvent.click(screen.getByRole("button", { name: "Share squad" }))

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`https://goatza.com${PATH}`)
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Link copied" }))
    )
  })

  it("offers the sign-up bar with the club's name", () => {
    renderView()

    const cta = screen.getByTestId("cta")
    expect(cta.getAttribute("data-name")).toBe("Dream FC")
    expect(cta.getAttribute("data-next")).toBe(PATH)
  })

  it("is one miss screen when the server said no", () => {
    renderView(null, "not_found")

    expect(screen.getByText("This squad isn't available.")).toBeTruthy()
    expect(mocks.fetchPage).not.toHaveBeenCalled()
  })

  it("reads again in the browser only when the server could not reach the API", async () => {
    mocks.fetchPage.mockResolvedValue({ status: "ok", data: page() })
    renderView(null, "unavailable")

    expect(await screen.findByRole("heading", { level: 1, name: "U17 Boys" })).toBeTruthy()
    expect(mocks.fetchPage).toHaveBeenCalledWith("dreamfc", "sq-1")
  })
})

describe("PublicSquadView · signed in", () => {
  beforeEach(() => setAuth(true))

  it("reads the showcase as the viewer and renders that, not the seed", async () => {
    mocks.getPage.mockResolvedValue(
      page({ squad: { ...page().squad, name: "U17 Boys (live)" } })
    )
    renderView()

    expect(await screen.findByRole("heading", { level: 1, name: "U17 Boys (live)" })).toBeTruthy()
    expect(mocks.getPage).toHaveBeenCalledWith("dreamfc", "sq-1")
    expect(screen.queryByTestId("cta")).toBeNull()
  })

  it("never shows the sign-in tile to someone already signed in", async () => {
    mocks.getPage.mockResolvedValue(page())
    const { container } = renderView()

    expect(await screen.findByText("Asha Player")).toBeTruthy()
    expect(container.querySelectorAll(`.${styles.hiddenTile}`)).toHaveLength(0)
  })

  it("is the miss screen for the showcase's 404", async () => {
    mocks.getPage.mockRejectedValue({ isAxiosError: true, response: { status: 404 } })
    renderView()

    expect(await screen.findByText("This squad isn't available.")).toBeTruthy()
  })
})
