// @vitest-environment jsdom

import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { MemberItem, Roster, SquadConfig, SquadDetail, StaffItem } from "../../types"
import PlayersTab from "./PlayersTab"

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  getRoster: vi.fn(),
  removeStaff: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/squads/sq-1",
}))
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
// The sheets are their own tests; here they only have to open.
vi.mock("../PlayerActionsSheet/PlayerActionsSheet", () => ({
  default: ({ member }: { member: MemberItem }) => (
    <div data-testid="actions-sheet">{member.user.name}</div>
  ),
}))
vi.mock("../EditPlayerSheet/EditPlayerSheet", () => ({ default: () => null }))
vi.mock("../MoveSheet/MoveSheet", () => ({ default: () => null }))
vi.mock("../RemoveSheet/RemoveSheet", () => ({ default: () => null }))
vi.mock("../AddStaffSheet/AddStaffSheet", () => ({
  default: () => <div data-testid="add-staff-sheet" />,
}))
vi.mock("../InviteShare/InviteShare", () => ({
  default: () => <div data-testid="share-card" />,
}))
vi.mock("../../services/squads.api", async (original) => ({
  ...(await original<typeof import("../../services/squads.api")>()),
  getSquadRosterApi: mocks.getRoster,
  removeSquadStaffApi: mocks.removeStaff,
}))

const config = (over: Partial<SquadConfig> = {}): SquadConfig => ({
  uses_positions: true,
  uses_jersey_numbers: true,
  member_noun: "player",
  member_noun_plural: "players",
  group_order: ["Goalkeepers", "Defenders"],
  typical_squad_size: 18,
  positions: [
    { id: "pos-gk", name: "Goalkeeper", group: "Goalkeepers" },
    { id: "pos-cb", name: "Centre-back", group: "Defenders" },
  ],
  ...over,
})

const squad = (over: Partial<SquadDetail> = {}): SquadDetail => ({
  id: "sq-1",
  name: "U17 Boys",
  sport: { id: "sport-fb", name: "Football", icon_name: "mdi:soccer" },
  level: "youth",
  level_label: "Youth",
  age_group: "U17",
  season: "2026–27",
  photo_url: "",
  is_public: true,
  invite_enabled: true,
  members_count: 3,
  pending_count: 0,
  open_invites_count: 0,
  created_at: "2026-11-01T00:00:00Z",
  description: "",
  config: config(),
  staff: [],
  captain_member_id: null,
  invite: { url: "https://goatza.com/squad-invite/tok", enabled: true },
  ...over,
})

const member = (id: string, name: string, over: Partial<MemberItem> = {}): MemberItem => ({
  id,
  status: "active",
  source: "link",
  user: { id: `u-${id}`, username: name.toLowerCase(), name, photo: "", age: 16 },
  primary_position: null,
  position: null,
  jersey_number: null,
  is_captain: false,
  joined_at: "2026-06-10T00:00:00Z",
  career_entry_id: null,
  ...over,
})

const ALEX = member("m1", "Alex", {
  jersey_number: 1,
  position: { id: "pos-gk", name: "Goalkeeper", group: "Goalkeepers" },
})
const BILAL = member("m2", "Bilal", {
  jersey_number: 4,
  is_captain: true,
  position: { id: "pos-cb", name: "Centre-back", group: "Defenders" },
})
const CHEN = member("m3", "Chen", { primary_position: { id: "pos-cb", name: "Centre-back" } })

const ROSTER: Roster = {
  count: 3,
  groups: [
    { name: "Goalkeepers", count: 1, members: [ALEX] },
    { name: "Defenders", count: 2, members: [BILAL, CHEN] },
    { name: "Other", count: 0, members: [] },
  ],
}

const COACH: StaffItem = {
  id: "st-1",
  member_id: "om-1",
  role: "head_coach",
  role_label: "Head coach",
  title: "",
  user: { id: "u-cora", username: "cora", name: "Cora Coach", photo: "" },
}

const renderTab = (
  props: Partial<{ squad: SquadDetail; canReview: boolean; canManage: boolean }> = {}
) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PlayersTab
        orgId="org-1"
        squad={props.squad ?? squad()}
        canReview={props.canReview ?? true}
        canManage={props.canManage ?? false}
        onInviteDirect={vi.fn()}
      />
    </QueryClientProvider>
  )

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.getRoster.mockResolvedValue(ROSTER)
  useAuthStore.setState({
    actorType: "organization",
    actorId: "org-1",
    isOrgAdminView: true,
    organizations: [{ id: "org-1", name: "Dream FC", username: "dreamfc" }] as never,
    currentOrganization: { id: "org-1", name: "Dream FC", username: "dreamfc" } as never,
  })
})

afterEach(cleanup)

describe("PlayersTab roster", () => {
  it("lists the players group by group, leaving out empty groups", async () => {
    renderTab()

    const keepers = await screen.findByRole("heading", { name: /Goalkeepers/ })
    expect(keepers.textContent).toContain("1")
    expect(screen.getByRole("heading", { name: /Defenders/ }).textContent).toContain("2")
    expect(screen.queryByRole("heading", { name: /Other/ })).toBeNull()

    expect(screen.getByText("Alex")).toBeTruthy()
    expect(screen.getByText("Bilal")).toBeTruthy()
    // The squad's position wins; then their own; then "No position".
    expect(screen.getByText("Goalkeeper · 16 yrs")).toBeTruthy()
    expect(screen.getAllByText("Centre-back · 16 yrs")).toHaveLength(2)

    expect(mocks.getRoster).toHaveBeenCalledWith("org-1", "sq-1")
  })

  it("shows the shirt number column only for a sport that uses numbers", async () => {
    renderTab()
    await screen.findByText("Alex")
    expect(screen.getByText(", number 1")).toBeTruthy()
    expect(screen.getByText(", number 4")).toBeTruthy()

    cleanup()
    renderTab({ squad: squad({ config: config({ uses_jersey_numbers: false }) }) })
    await screen.findByText("Alex")
    expect(screen.queryByText(", number 1")).toBeNull()
    expect(screen.queryByText("4")).toBeNull()
  })

  it("marks the captain", async () => {
    renderTab()
    await screen.findByText("Bilal")
    const badge = screen.getByTitle("Captain")
    expect(badge.textContent).toContain("C")
    expect(badge.closest("li")?.textContent).toContain("Bilal")
    expect(screen.getAllByTitle("Captain")).toHaveLength(1)
  })

  it("offers the ⋯ only to someone who can review, and it opens the player's options", async () => {
    renderTab({ canReview: true })
    fireEvent.click(await screen.findByRole("button", { name: "Options for Alex" }))
    expect(screen.getByTestId("actions-sheet").textContent).toBe("Alex")

    cleanup()
    renderTab({ canReview: false })
    await screen.findByText("Alex")
    expect(screen.queryByRole("button", { name: /Options for/ })).toBeNull()
  })
})

describe("PlayersTab when the squad is empty", () => {
  const EMPTY: Roster = { count: 0, groups: [] }

  it("shows how to fill it to a reviewer", async () => {
    mocks.getRoster.mockResolvedValue(EMPTY)
    renderTab({ squad: squad({ members_count: 0 }), canReview: true })
    expect(screen.getByTestId("share-card")).toBeTruthy()
    expect(screen.queryByText("No players yet.")).toBeNull()
  })

  it("shows one quiet line to someone who can only look", async () => {
    mocks.getRoster.mockResolvedValue(EMPTY)
    renderTab({ squad: squad({ members_count: 0, invite: null }), canReview: false })
    expect(screen.getByText("No players yet.")).toBeTruthy()
    expect(screen.queryByTestId("share-card")).toBeNull()
  })
})

describe("PlayersTab staff", () => {
  it("lists staff with their role, and Add staff only with manage", async () => {
    renderTab({ squad: squad({ staff: [COACH] }), canManage: true })

    expect(screen.getByRole("heading", { name: /Staff/ }).textContent).toContain("1")
    expect(screen.getByText("Cora Coach")).toBeTruthy()
    expect(screen.getByText("Head coach")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Options for Cora Coach" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /Add staff/ }))
    expect(screen.getByTestId("add-staff-sheet")).toBeTruthy()
  })

  it("shows the title for an 'other' role", () => {
    renderTab({
      squad: squad({
        staff: [{ ...COACH, role: "other", role_label: "Other", title: "Goalkeeping coach" }],
      }),
    })
    expect(screen.getByText("Goalkeeping coach")).toBeTruthy()
  })

  it("is read-only without manage", () => {
    renderTab({ squad: squad({ staff: [COACH] }), canManage: false })
    expect(screen.getByText("Cora Coach")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Add staff/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Options for Cora Coach" })).toBeNull()
  })
})
