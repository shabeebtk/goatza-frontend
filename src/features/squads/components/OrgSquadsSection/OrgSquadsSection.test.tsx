// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { ShowcaseList, ShowcaseSquadCard } from "../../types"
import OrgSquadsSection from "./OrgSquadsSection"

const mocks = vi.hoisted(() => ({
  getShowcase: vi.fn(),
  fetchPublic: vi.fn(),
}))

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("../../services/squadsShowcase.api", () => ({
  getSquadShowcaseApi: mocks.getShowcase,
  fetchPublicSquadShowcase: mocks.fetchPublic,
  getSquadShowcasePageApi: vi.fn(),
  fetchPublicSquadPage: vi.fn(),
}))

const ORG = {
  id: "org-1",
  name: "Dream FC",
  username: "dreamfc",
  logo: "",
  is_verified: false,
  type: "club",
}

const card = (index: number, photo = ""): ShowcaseSquadCard => ({
  id: `sq-${index}`,
  name: `Squad ${index}`,
  sport: { id: "sport-1", name: "Football", icon_name: "mdi:soccer" },
  level_label: "Youth",
  age_group: "",
  season: "2026–27",
  photo_url: photo,
  members_count: 12,
  head_coach_name: index === 1 ? "Ravi Menon" : null,
  preview_members: [{ name: "Asha Player", photo: "" }],
})

const list = (count: number): ShowcaseList => ({
  organization: ORG,
  squads: Array.from({ length: count }, (_, index) => card(index + 1, index === 0 ? "https://m/1.webp" : "")),
})

const signInWith = (permissions: string[] | null) => {
  useAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    user: { id: "user-1", username: "olive" } as never,
    organizations: (permissions
      ? [{ id: "org-1", name: "Dream FC", username: "dreamfc", my_permissions: permissions }]
      : []) as never,
  })
}

const renderSection = (anonymous = false) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <div data-testid="host">
        <OrgSquadsSection orgId="org-1" username="dreamfc" anonymous={anonymous} />
      </div>
    </QueryClientProvider>
  )
  return { client, ...view }
}

beforeEach(() => {
  mocks.getShowcase.mockReset()
  mocks.fetchPublic.mockReset()
  signInWith(null)
})

afterEach(cleanup)

describe("OrgSquadsSection", () => {
  it("renders nothing at all, not even the divider, when the club shows no squads", async () => {
    mocks.getShowcase.mockResolvedValue(list(0))
    const { client } = renderSection()

    await waitFor(() =>
      expect(client.getQueryState(["squads", "showcase", "dreamfc", "signed-in"])?.status).toBe(
        "success"
      )
    )
    expect(screen.getByTestId("host").innerHTML).toBe("")
  })

  it("renders nothing for the server's 404", async () => {
    mocks.getShowcase.mockRejectedValue({ isAxiosError: true, response: { status: 404 } })
    const { client } = renderSection()

    await waitFor(() =>
      expect(client.getQueryState(["squads", "showcase", "dreamfc", "signed-in"])?.status).toBe(
        "success"
      )
    )
    expect(screen.getByTestId("host").innerHTML).toBe("")
  })

  it("shows the title, the count and up to three cards, then See all squads", async () => {
    mocks.getShowcase.mockResolvedValue(list(4))
    renderSection()

    expect(await screen.findByRole("heading", { name: "Squads" })).toBeTruthy()
    expect(screen.getByText("4 squads")).toBeTruthy()
    expect(screen.getByText("Squad 1")).toBeTruthy()
    expect(screen.getByText("Squad 3")).toBeTruthy()
    expect(screen.queryByText("Squad 4")).toBeNull()

    const seeAll = screen.getByText("See all squads").closest("a") as HTMLAnchorElement
    expect(seeAll.getAttribute("href")).toBe("/organization/profile/dreamfc/squads")
  })

  it("links each card to its squad's page", async () => {
    mocks.getShowcase.mockResolvedValue(list(2))
    renderSection()

    const first = (await screen.findByText("Squad 1")).closest("a") as HTMLAnchorElement
    expect(first.getAttribute("href")).toBe("/organization/profile/dreamfc/squads/sq-1")
    expect(screen.getByText("Coach Ravi Menon")).toBeTruthy()
  })

  it("has no See all link with three squads or fewer", async () => {
    mocks.getShowcase.mockResolvedValue(list(3))
    renderSection()

    expect(await screen.findByText("Squad 3")).toBeTruthy()
    expect(screen.queryByText("See all squads")).toBeNull()
  })

  it("offers Manage squads to a member with squads.view", async () => {
    signInWith(["members.view", "squads.view"])
    mocks.getShowcase.mockResolvedValue(list(1))
    renderSection()

    const manage = (await screen.findByText("Manage squads")).closest("a") as HTMLAnchorElement
    expect(manage.getAttribute("href")).toBe("/organization/admin/org-1/squads")
  })

  it("has no Manage squads for a member without squads.view, or anyone else", async () => {
    signInWith(["members.view"])
    mocks.getShowcase.mockResolvedValue(list(1))
    renderSection()

    expect(await screen.findByText("Squad 1")).toBeTruthy()
    expect(screen.queryByText("Manage squads")).toBeNull()
    cleanup()

    signInWith(null)
    renderSection()
    expect(await screen.findByText("Squad 1")).toBeTruthy()
    expect(screen.queryByText("Manage squads")).toBeNull()
  })

  it("reads the public endpoint when anonymous, and never offers Manage squads", async () => {
    signInWith(["squads.view"])
    mocks.fetchPublic.mockResolvedValue({ status: "ok", data: list(2) })
    renderSection(true)

    expect(await screen.findByText("Squad 2")).toBeTruthy()
    expect(mocks.fetchPublic).toHaveBeenCalledWith("dreamfc")
    expect(mocks.getShowcase).not.toHaveBeenCalled()
    expect(screen.queryByText("Manage squads")).toBeNull()
  })

  it("renders nothing when the anonymous read is a miss", async () => {
    mocks.fetchPublic.mockResolvedValue({ status: "not_found" })
    const { client } = renderSection(true)

    await waitFor(() =>
      expect(client.getQueryState(["squads", "showcase", "dreamfc", "anonymous"])?.status).toBe(
        "success"
      )
    )
    expect(screen.getByTestId("host").innerHTML).toBe("")
    expect(mocks.getShowcase).not.toHaveBeenCalled()
  })
})
