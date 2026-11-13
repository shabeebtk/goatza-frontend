// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { InviteItem, RequestItem, SquadDetail } from "../../types"
import RequestsTab from "./RequestsTab"

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  getRequests: vi.fn(),
  approve: vi.fn(),
  decline: vi.fn(),
  cancel: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/squads/sq-1/requests",
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("../ApproveSheet/ApproveSheet", () => ({
  default: ({ request }: { request: RequestItem }) => (
    <div data-testid="approve-sheet">{request.user.name}</div>
  ),
}))
vi.mock("../../services/squads.api", async (original) => ({
  ...(await original<typeof import("../../services/squads.api")>()),
  getSquadRequestsApi: mocks.getRequests,
  approveSquadRequestsApi: mocks.approve,
  declineSquadRequestsApi: mocks.decline,
  cancelSquadInviteApi: mocks.cancel,
}))

const SQUAD: SquadDetail = {
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
  members_count: 4,
  pending_count: 3,
  open_invites_count: 1,
  created_at: "2026-11-01T00:00:00Z",
  description: "",
  config: {
    uses_positions: true,
    uses_jersey_numbers: true,
    member_noun: "player",
    member_noun_plural: "players",
    group_order: [],
    typical_squad_size: null,
    positions: [],
  },
  staff: [],
  captain_member_id: null,
  invite: { url: "https://goatza.com/squad-invite/tok", enabled: true },
}

const request = (id: string, name: string): RequestItem => ({
  id,
  source: "link",
  requested_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  user: { id: `u-${id}`, username: name.toLowerCase(), name, photo: "", age: 16 },
  primary_position: { id: "pos-st", name: "Striker" },
})

const ALEX = request("r1", "Alex")
const BILAL = request("r2", "Bilal")
const CHEN = request("r3", "Chen")

const INVITE: InviteItem = {
  id: "inv-1",
  source: "recruitment",
  requested_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  expires_at: new Date(Date.now() + 12.5 * 86_400_000).toISOString(),
  user: { id: "u-dana", username: "dana", name: "Dana", photo: "" },
  position: { id: "pos-gk", name: "Goalkeeper" },
  jersey_number: 1,
  invited_by_name: "Olive",
  recruitment: { id: "rec-1", title: "U17 Open Trials" },
}

const renderTab = (onShareLink = vi.fn()) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RequestsTab orgId="org-1" squad={SQUAD} onShareLink={onShareLink} />
    </QueryClientProvider>
  )

const checkboxFor = (name: string | RegExp) => screen.getByRole("checkbox", { name }) as HTMLInputElement

const approveButton = () => screen.getByRole("button", { name: /^Approve/ }) as HTMLButtonElement

const dialog = async (title: string) =>
  (await screen.findByText(title)).closest('[role="alertdialog"]') as HTMLElement

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.getRequests.mockResolvedValue({ requests: [ALEX, BILAL, CHEN], invites: [] })
  useAuthStore.setState({
    organizations: [{ id: "org-1", name: "Dream FC", username: "dreamfc" }] as never,
    currentOrganization: { id: "org-1", name: "Dream FC", username: "dreamfc" } as never,
  })
})

afterEach(cleanup)

describe("RequestsTab selection", () => {
  it("starts with nothing selected", async () => {
    renderTab()

    await screen.findByText("Alex")
    expect(screen.getByText("Asked through your invite link")).toBeTruthy()
    for (const box of screen.getAllByRole("checkbox") as HTMLInputElement[]) {
      expect(box.checked).toBe(false)
    }
    expect(approveButton().disabled).toBe(true)
    expect(approveButton().textContent).toBe("Approve")
    expect(screen.getAllByText("Striker · 16 yrs")).toHaveLength(3)
    expect(screen.getAllByText("2 hours ago")).toHaveLength(3)
  })

  it("selects everyone with Select all, and clears them again", async () => {
    renderTab()
    await screen.findByText("Alex")

    fireEvent.click(checkboxFor(/Select all/))
    expect(checkboxFor(/Alex/).checked).toBe(true)
    expect(checkboxFor(/Bilal/).checked).toBe(true)
    expect(checkboxFor(/Chen/).checked).toBe(true)
    expect(approveButton().textContent).toBe("Approve 3")

    fireEvent.click(checkboxFor(/Select all/))
    expect(checkboxFor(/Alex/).checked).toBe(false)
    expect(approveButton().disabled).toBe(true)
  })

  it("opens one request in the approve sheet", async () => {
    renderTab()
    fireEvent.click(await screen.findByRole("button", { name: "Review Bilal's request" }))
    expect(screen.getByTestId("approve-sheet").textContent).toBe("Bilal")
  })
})

describe("RequestsTab approve and decline", () => {
  it("approves the selected rows", async () => {
    mocks.approve.mockResolvedValue({ approved: [{ id: "r1" }, { id: "r3" }], failed: [] })
    renderTab()
    await screen.findByText("Alex")

    fireEvent.click(checkboxFor(/Alex/))
    fireEvent.click(checkboxFor(/Chen/))
    expect(approveButton().textContent).toBe("Approve 2")
    fireEvent.click(approveButton())

    await waitFor(() =>
      expect(mocks.approve).toHaveBeenCalledWith("org-1", "sq-1", [
        { member_id: "r1" },
        { member_id: "r3" },
      ])
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "2 players added", variant: "success" })
      )
    )
  })

  it("keeps a refused row selected and says why", async () => {
    mocks.approve.mockResolvedValue({
      approved: [{ id: "r1" }],
      failed: [{ member_id: "r3", code: "member_limit", message: "server words" }],
    })
    renderTab()
    await screen.findByText("Alex")
    // After the batch: Alex is in, Bilal and Chen are still asking.
    mocks.getRequests.mockResolvedValue({ requests: [BILAL, CHEN], invites: [] })

    fireEvent.click(checkboxFor(/Alex/))
    fireEvent.click(checkboxFor(/Chen/))
    fireEvent.click(approveButton())

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "1 request couldn't be approved",
          message: "This squad is full (100 players).",
          variant: "warning",
        })
      )
    )
    await waitFor(() => expect(screen.queryByText("Alex")).toBeNull())
    expect(checkboxFor(/Chen/).checked).toBe(true)
    expect(checkboxFor(/Bilal/).checked).toBe(false)
    expect(approveButton().textContent).toBe("Approve 1")
  })

  it("asks before declining, then declines the selected rows", async () => {
    mocks.decline.mockResolvedValue({ declined: ["r2"], failed: [] })
    renderTab()
    await screen.findByText("Alex")

    fireEvent.click(checkboxFor(/Bilal/))
    fireEvent.click(screen.getByRole("button", { name: "Decline" }))

    const confirm = await dialog("Decline 1 request?")
    expect(within(confirm).getByText("They won't be told why.")).toBeTruthy()
    expect(mocks.decline).not.toHaveBeenCalled()

    fireEvent.click(within(confirm).getByRole("button", { name: "Decline" }))

    await waitFor(() => expect(mocks.decline).toHaveBeenCalledWith("org-1", "sq-1", ["r2"]))
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "1 request declined" })
      )
    )
  })

  it("declines nothing when the question is answered no", async () => {
    renderTab()
    await screen.findByText("Alex")

    fireEvent.click(checkboxFor(/Select all/))
    fireEvent.click(screen.getByRole("button", { name: "Decline" }))
    const confirm = await dialog("Decline 3 requests?")
    fireEvent.click(within(confirm).getByRole("button", { name: "Keep" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(mocks.decline).not.toHaveBeenCalled()
  })
})

describe("RequestsTab invites", () => {
  it("lists the open invites behind a toggle and cancels one after asking", async () => {
    mocks.getRequests.mockResolvedValue({ requests: [ALEX], invites: [INVITE] })
    mocks.cancel.mockResolvedValue(undefined)
    renderTab()

    const toggle = await screen.findByRole("button", {
      name: /1 player you invited hasn't answered yet/,
    })
    expect(screen.queryByText("Dana")).toBeNull()

    fireEvent.click(toggle)
    expect(screen.getByText("Dana")).toBeTruthy()
    expect(screen.getByText(/Invited 2 days ago · expires in 12 days/)).toBeTruthy()
    expect(screen.getByText("Goalkeeper · #1")).toBeTruthy()
    expect(screen.getByText("From U17 Open Trials")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    const confirm = await dialog("Cancel this invite?")
    expect(mocks.cancel).not.toHaveBeenCalled()
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel invite" }))

    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith("org-1", "sq-1", "inv-1"))
  })

  it("says the plural for several", async () => {
    mocks.getRequests.mockResolvedValue({
      requests: [],
      invites: [INVITE, { ...INVITE, id: "inv-2", user: { ...INVITE.user, id: "u-eve", name: "Eve" } }],
    })
    renderTab()
    expect(
      await screen.findByRole("button", { name: /2 players you invited haven't answered yet/ })
    ).toBeTruthy()
    // No requests: no selection row and no approve footer.
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull()
  })
})

describe("RequestsTab when there is nothing", () => {
  it("says so and offers the invite link", async () => {
    mocks.getRequests.mockResolvedValue({ requests: [], invites: [] })
    const onShareLink = vi.fn()
    renderTab(onShareLink)

    expect(await screen.findByText("No requests right now.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Share invite link" }))
    expect(onShareLink).toHaveBeenCalledTimes(1)
  })
})
