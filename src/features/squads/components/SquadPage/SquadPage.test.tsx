// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { Roster, SquadDetail, SquadTab } from "../../types"
import SquadPage from "./SquadPage"

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  getSquad: vi.fn(),
  getRoster: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: mocks.replace }),
  usePathname: () => "/organization/admin/org-1/squads/sq-1",
}))
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    ...rest
  }: {
    href: string
    children: React.ReactNode
    className?: string
    "aria-current"?: "page"
  }) => (
    <a href={href} className={className} aria-current={rest["aria-current"]}>
      {children}
    </a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/BackHeader/BackHeader", () => ({
  default: ({ title, subtitle }: { title?: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </header>
  ),
}))
vi.mock("../PlayersTab/PlayersTab", () => ({ default: () => <div data-testid="players-tab" /> }))
vi.mock("../RequestsTab/RequestsTab", () => ({ default: () => <div data-testid="requests-tab" /> }))
vi.mock("../SettingsTab/SettingsTab", () => ({ default: () => <div data-testid="settings-tab" /> }))
vi.mock("../InvitePlayerSheet/InvitePlayerSheet", () => ({
  default: () => <div data-testid="invite-player-sheet" />,
}))
vi.mock("../InviteShare/InviteShare", () => ({
  default: () => <div data-testid="invite-share-card" />,
  InviteShareSheet: () => <div data-testid="invite-share-sheet" />,
}))
vi.mock("../../services/squads.api", async (original) => ({
  ...(await original<typeof import("../../services/squads.api")>()),
  getSquadApi: mocks.getSquad,
  getSquadRosterApi: mocks.getRoster,
}))

const ORG = "org-1"
const PLAYERS_PATH = `/organization/admin/${ORG}/squads/sq-1`

function detail(overrides: Partial<SquadDetail> = {}): SquadDetail {
  return {
    id: "sq-1",
    name: "U17 Boys",
    sport: { id: "s-foot", name: "Football", icon_name: "mdi:soccer" },
    level: "youth",
    level_label: "Youth",
    age_group: "U17",
    season: "2026–27",
    photo_url: "",
    is_public: true,
    invite_enabled: true,
    members_count: 12,
    pending_count: 3,
    open_invites_count: 0,
    created_at: "2026-06-01T00:00:00Z",
    description: "",
    config: {
      uses_positions: true,
      uses_jersey_numbers: true,
      member_noun: "player",
      member_noun_plural: "players",
      group_order: ["Defenders"],
      typical_squad_size: 18,
      positions: [],
    },
    staff: [
      {
        id: "st-1",
        member_id: "om-1",
        role: "head_coach",
        role_label: "Head coach",
        title: "",
        user: { id: "u-coach", username: "cora", name: "Cora Coach", photo: "" },
      },
    ],
    captain_member_id: null,
    invite: { url: "https://goatza.com/squad-invite/tok", enabled: true },
    ...overrides,
  }
}

const roster: Roster = {
  count: 1,
  groups: [
    {
      name: "Defenders",
      count: 1,
      members: [
        {
          id: "m-cap",
          status: "active",
          source: "link",
          user: { id: "u-1", username: "bilal", name: "Bilal", photo: "", age: 16 },
          primary_position: null,
          position: null,
          jersey_number: 4,
          is_captain: true,
          joined_at: "2026-06-01T00:00:00Z",
          career_entry_id: null,
        },
      ],
    },
  ],
}

function actAs(permissions: string[]) {
  const org = { id: ORG, name: "Dream FC", username: "dreamfc", my_permissions: permissions }
  useAuthStore.setState({
    actorType: "organization",
    actorId: ORG,
    organizations: [org] as never,
    currentOrganization: org as never,
  })
}

const VIEW = ["squads.view"]
const REVIEW = ["squads.view", "squads.review"]
const MANAGE = ["squads.view", "squads.review", "squads.manage"]

const renderPage = (tab: SquadTab = "players") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SquadPage orgId={ORG} squadId="sq-1" tab={tab} />
    </QueryClientProvider>
  )

const tabLink = (name: RegExp) => screen.queryByRole("link", { name })

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.getRoster.mockResolvedValue(roster)
})

afterEach(cleanup)

describe("SquadPage", () => {
  it("shows the header, the stats and every tab to a manager", async () => {
    actAs(MANAGE)
    mocks.getSquad.mockResolvedValue(detail({ captain_member_id: "m-cap" }))
    renderPage()

    expect(await screen.findByRole("heading", { name: "U17 Boys" })).toBeTruthy()
    expect(screen.getByText("Youth · U17 · 2026–27")).toBeTruthy()
    expect(screen.getByText("12")).toBeTruthy()
    expect(screen.getByText("Staff")).toBeTruthy()
    expect(await screen.findByText("#4")).toBeTruthy()

    const players = tabLink(/^Players$/) as HTMLAnchorElement
    expect(players.getAttribute("href")).toBe(PLAYERS_PATH)
    expect(players.getAttribute("aria-current")).toBe("page")
    expect(tabLink(/Requests/)?.getAttribute("href")).toBe(`${PLAYERS_PATH}/requests`)
    expect(tabLink(/Requests/)?.textContent).toContain("3")
    expect(tabLink(/Settings/)?.getAttribute("href")).toBe(`${PLAYERS_PATH}/settings`)
    expect(screen.getByTestId("players-tab")).toBeTruthy()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("shows a dash for the captain when there is none", async () => {
    actAs(MANAGE)
    mocks.getSquad.mockResolvedValue(detail())
    renderPage()

    await screen.findByRole("heading", { name: "U17 Boys" })
    expect(screen.getByText("—")).toBeTruthy()
    expect(mocks.getRoster).not.toHaveBeenCalled()
  })

  it("gives a reviewer Requests but not Settings", async () => {
    actAs(REVIEW)
    mocks.getSquad.mockResolvedValue(detail())
    renderPage()

    await screen.findByRole("heading", { name: "U17 Boys" })
    expect(tabLink(/Requests/)).toBeTruthy()
    expect(tabLink(/Settings/)).toBeNull()
  })

  it("takes Requests from the server: no invite link means no review", async () => {
    // The store still says review; the squad the server sent says otherwise.
    actAs(REVIEW)
    mocks.getSquad.mockResolvedValue(detail({ invite: null }))
    renderPage()

    await screen.findByRole("heading", { name: "U17 Boys" })
    expect(tabLink(/^Players$/)).toBeTruthy()
    expect(tabLink(/Requests/)).toBeNull()
    expect(tabLink(/Settings/)).toBeNull()
    expect(screen.queryByRole("button", { name: "Share invite link" })).toBeNull()
  })

  it("opens the Requests tab for a reviewer", async () => {
    actAs(REVIEW)
    mocks.getSquad.mockResolvedValue(detail())
    renderPage("requests")

    expect(await screen.findByTestId("requests-tab")).toBeTruthy()
    expect(tabLink(/Requests/)?.getAttribute("aria-current")).toBe("page")
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("sends a tab the viewer may not see to Players", async () => {
    actAs(REVIEW)
    mocks.getSquad.mockResolvedValue(detail())
    renderPage("settings")

    expect(await screen.findByTestId("players-tab")).toBeTruthy()
    expect(screen.queryByTestId("settings-tab")).toBeNull()
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(PLAYERS_PATH, { scroll: false }))
  })

  it("sends Requests to Players for someone without review", async () => {
    actAs(VIEW)
    mocks.getSquad.mockResolvedValue(detail({ invite: null }))
    renderPage("requests")

    expect(await screen.findByTestId("players-tab")).toBeTruthy()
    expect(screen.queryByTestId("requests-tab")).toBeNull()
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(PLAYERS_PATH, { scroll: false }))
  })

  it("opens Settings for a manager", async () => {
    actAs(MANAGE)
    mocks.getSquad.mockResolvedValue(detail())
    renderPage("settings")

    expect(await screen.findByTestId("settings-tab")).toBeTruthy()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it("shares the invite link from the header", async () => {
    actAs(REVIEW)
    mocks.getSquad.mockResolvedValue(detail())
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Share invite link" }))
    expect(screen.getByTestId("invite-share-sheet")).toBeTruthy()
  })

  it("says a missing squad isn't available, with a way back", async () => {
    actAs(MANAGE)
    mocks.getSquad.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { message: "Not found.", data: { code: "not_found" } } },
    })
    renderPage()

    expect(await screen.findByText("This squad isn't available any more.")).toBeTruthy()
    expect(
      screen.getByRole("link", { name: "Back to squads" }).getAttribute("href")
    ).toBe(`/organization/admin/${ORG}/squads`)
  })

  it("offers Try again for any other failure", async () => {
    actAs(MANAGE)
    mocks.getSquad.mockRejectedValueOnce({ isAxiosError: true, response: { status: 500, data: {} } })
    mocks.getSquad.mockResolvedValueOnce(detail())
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("heading", { name: "U17 Boys" })).toBeTruthy()
  })
})
