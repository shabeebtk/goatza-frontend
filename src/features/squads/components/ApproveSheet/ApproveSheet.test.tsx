// @vitest-environment jsdom

import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { MemberItem, RequestItem, Roster, SquadDetail } from "../../types"
import ApproveSheet from "./ApproveSheet"

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  getRoster: vi.fn(),
  approve: vi.fn(),
  decline: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/squads/sq-1/requests",
}))
vi.mock("next/link", () => ({
  default: ({ href, children, className, onClick }: { href: string; children: ReactNode; className?: string; onClick?: () => void }) => (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("@/shared/components/ui/Select/Select", () => ({
  default: ({
    label,
    options,
    onChange,
    value,
    helperText,
  }: {
    label?: string
    options: { value: string; label: string }[]
    onChange: (value: string) => void
    value: string
    helperText?: string
  }) => (
    <div data-testid={`select-${label}`} data-value={value}>
      {helperText && <span>{helperText}</span>}
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)}>
          Pick {option.label}
        </button>
      ))}
    </div>
  ),
}))
// The sheet's own mechanics (portal, history) are not what is under test.
vi.mock("../SquadSheet/SquadSheet", () => ({
  default: ({
    title,
    onClose,
    footer,
    children,
  }: {
    title: string
    onClose: () => void
    footer?: (close: () => void) => ReactNode
    children: (close: () => void) => ReactNode
  }) => (
    <div role="dialog" aria-label={title}>
      <h2>{title}</h2>
      {children(onClose)}
      {footer?.(onClose)}
    </div>
  ),
}))
vi.mock("../../services/squads.api", async (original) => ({
  ...(await original<typeof import("../../services/squads.api")>()),
  getSquadRosterApi: mocks.getRoster,
  approveSquadRequestsApi: mocks.approve,
  declineSquadRequestsApi: mocks.decline,
}))

const member = (id: string, name: string, over: Partial<MemberItem> = {}): MemberItem => ({
  id,
  status: "active",
  source: "link",
  user: { id: `u-${id}`, username: name.toLowerCase(), name, photo: "", age: 17 },
  primary_position: null,
  position: null,
  jersey_number: null,
  is_captain: false,
  joined_at: "2026-06-10T00:00:00Z",
  career_entry_id: null,
  ...over,
})

const CORA = member("m-cap", "Cora", { jersey_number: 4, is_captain: true })
const DEV = member("m-9", "Dev", { jersey_number: 9 })
const ROSTER: Roster = { count: 2, groups: [{ name: "Other", count: 2, members: [CORA, DEV] }] }

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
  members_count: 2,
  pending_count: 1,
  open_invites_count: 0,
  created_at: "2026-11-01T00:00:00Z",
  description: "",
  config: {
    uses_positions: true,
    uses_jersey_numbers: true,
    member_noun: "player",
    member_noun_plural: "players",
    group_order: ["Forwards"],
    typical_squad_size: 18,
    positions: [
      { id: "pos-st", name: "Striker", group: "Forwards" },
      { id: "pos-gk", name: "Goalkeeper", group: "Goalkeepers" },
    ],
  },
  staff: [],
  captain_member_id: "m-cap",
  invite: { url: "https://goatza.com/squad-invite/tok", enabled: true },
  ...over,
})

const REQUEST: RequestItem = {
  id: "r1",
  source: "link",
  requested_at: "2026-11-12T10:00:00Z",
  user: { id: "u-alex", username: "alex", name: "Alex", photo: "", age: 16 },
  primary_position: { id: "pos-st", name: "Striker" },
}

const renderSheet = (props: Partial<{ squad: SquadDetail; onClose: () => void }> = {}) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ApproveSheet
        orgId="org-1"
        squad={props.squad ?? squad()}
        request={REQUEST}
        onClose={props.onClose ?? vi.fn()}
      />
    </QueryClientProvider>
  )

const jerseyInput = () => screen.getByLabelText(/Shirt number/) as HTMLInputElement

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

describe("ApproveSheet", () => {
  it("summarises the player and says what approving does", async () => {
    renderSheet()

    expect(screen.getByRole("heading", { name: "Add to U17 Boys" })).toBeTruthy()
    expect(screen.getByText("Alex")).toBeTruthy()
    expect(screen.getByText("Striker · 16 yrs")).toBeTruthy()
    expect(screen.getByText("Profile").getAttribute("href")).toBe(
      "/organization/admin/org-1/profile/user/alex"
    )
    expect(
      screen.getByText("Their profile will show Dream FC · U17 Boys as verified.")
    ).toBeTruthy()
  })

  it("prefills the position from their profile and says so until it changes", () => {
    renderSheet()

    const position = screen.getByTestId("select-Position")
    expect(position.getAttribute("data-value")).toBe("pos-st")
    expect(within(position).getByText("From their profile")).toBeTruthy()

    fireEvent.click(within(position).getByRole("button", { name: "Pick Goalkeeper" }))
    expect(screen.getByTestId("select-Position").getAttribute("data-value")).toBe("pos-gk")
    expect(screen.queryByText("From their profile")).toBeNull()
  })

  it("offers the free numbers as quick picks, and a pick fills the box", async () => {
    renderSheet()

    const picks = await screen.findByRole("group", { name: "Free shirt numbers" })
    const numbers = within(picks)
      .getAllByRole("button")
      .map((button) => button.textContent)
    expect(numbers).toEqual(["1", "2", "3", "5", "6", "7"])

    fireEvent.click(within(picks).getByRole("button", { name: "7" }))
    expect(jerseyInput().value).toBe("7")
    expect(screen.getByText("Free in this squad")).toBeTruthy()
  })

  it("warns when another player has the number", async () => {
    renderSheet()
    await screen.findByRole("group", { name: "Free shirt numbers" })

    fireEvent.change(jerseyInput(), { target: { value: "9" } })
    expect(screen.getByText("Another player has #9")).toBeTruthy()
    expect(screen.queryByText("Free in this squad")).toBeNull()
  })

  it("names the current captain under Make captain", async () => {
    renderSheet()
    expect(await screen.findByText("Now: Cora (#4)")).toBeTruthy()
  })

  it("approves with the position, the number and the captaincy", async () => {
    const onClose = vi.fn()
    mocks.approve.mockResolvedValue({ approved: [member("r1", "Alex")], failed: [] })
    renderSheet({ onClose })
    await screen.findByRole("group", { name: "Free shirt numbers" })

    fireEvent.change(jerseyInput(), { target: { value: "7" } })
    fireEvent.click(screen.getByRole("switch", { name: "Make captain" }))
    fireEvent.click(screen.getByRole("button", { name: "Approve" }))

    await waitFor(() =>
      expect(mocks.approve).toHaveBeenCalledWith("org-1", "sq-1", [
        { member_id: "r1", position_id: "pos-st", jersey_number: 7, is_captain: true },
      ])
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Alex added" }))
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("sends no position or number the sport does not use", async () => {
    mocks.approve.mockResolvedValue({ approved: [member("r1", "Alex")], failed: [] })
    renderSheet({
      squad: squad({
        config: { ...squad().config, uses_positions: false, uses_jersey_numbers: false },
      }),
    })

    expect(screen.queryByTestId("select-Position")).toBeNull()
    expect(screen.queryByLabelText(/Shirt number/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Approve" }))

    await waitFor(() =>
      expect(mocks.approve).toHaveBeenCalledWith("org-1", "sq-1", [
        { member_id: "r1", is_captain: false },
      ])
    )
  })

  it("shows a refusal in place and stays open", async () => {
    const onClose = vi.fn()
    mocks.approve.mockResolvedValue({
      approved: [],
      failed: [{ member_id: "r1", code: "member_limit", message: "server words" }],
    })
    renderSheet({ onClose })

    fireEvent.click(screen.getByRole("button", { name: "Approve" }))

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This squad is full (100 players)."
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it("shows a number refusal under the number", async () => {
    mocks.approve.mockResolvedValue({
      approved: [],
      failed: [{ member_id: "r1", code: "jersey_taken", message: "server words" }],
    })
    renderSheet()
    await screen.findByRole("group", { name: "Free shirt numbers" })
    fireEvent.change(jerseyInput(), { target: { value: "2" } })

    fireEvent.click(screen.getByRole("button", { name: "Approve" }))

    expect(
      await screen.findByText("Another player in this squad has that number.")
    ).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("declines the request", async () => {
    const onClose = vi.fn()
    mocks.decline.mockResolvedValue({ declined: ["r1"], failed: [] })
    renderSheet({ onClose })

    fireEvent.click(screen.getByRole("button", { name: "Decline request" }))

    await waitFor(() => expect(mocks.decline).toHaveBeenCalledWith("org-1", "sq-1", ["r1"]))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Request declined" })
    )
  })
})
