// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { MySquadItem } from "../../types"
import SquadInviteActions from "./SquadInviteActions"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  mine: vi.fn(),
  accept: vi.fn(),
  decline: vi.fn(),
  answered: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), back: vi.fn() }),
}))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("../../services/squadsPlayer.api", async (original) => ({
  ...(await original<typeof import("../../services/squadsPlayer.api")>()),
  getMySquadsApi: mocks.mine,
  acceptSquadInviteApi: mocks.accept,
  declineSquadInviteApi: mocks.decline,
}))

const row = (status: MySquadItem["status"], id = "mem-1"): MySquadItem => ({
  id,
  status,
  source: "invite",
  squad: {
    id: "sq-1",
    name: "U17 Boys",
    sport: { id: "s1", name: "Football", icon_name: "mdi:soccer" },
    photo_url: "",
    level_label: "Youth",
    age_group: "U17",
  },
  organization: { id: "org-1", name: "Dream FC", username: "dreamfc", logo: "", is_verified: false },
  position: null,
  jersey_number: null,
  is_captain: false,
  requested_at: null,
  expires_at: null,
  joined_at: null,
})

const renderActions = (props: Partial<Parameters<typeof SquadInviteActions>[0]> = {}) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SquadInviteActions
        memberId="mem-1"
        squadId="sq-1"
        squadName="U17 Boys"
        orgUsername="dreamfc"
        onAnswered={mocks.answered}
        {...props}
      />
    </QueryClientProvider>
  )

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.accept.mockResolvedValue(row("active"))
  mocks.decline.mockResolvedValue(undefined)
  useAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    user: { id: "u1", username: "asha" } as never,
    actorType: "user",
    actorId: null,
  })
})

afterEach(cleanup)

describe("SquadInviteActions while the invite is open", () => {
  beforeEach(() => {
    mocks.mine.mockResolvedValue([row("invited")])
  })

  it("shows what the club offered", async () => {
    renderActions({ jerseyNumber: 9, positionName: "Striker", recruitmentTitle: "U17 Open Trials" })

    expect(await screen.findByText("#9 · Striker")).toBeTruthy()
    expect(screen.getByText("After your trial · U17 Open Trials")).toBeTruthy()
  })

  it("accepts, says so with a way to the squad, and marks the row answered", async () => {
    renderActions()

    await waitFor(() => expect(mocks.mine).toHaveBeenCalled())
    fireEvent.click(screen.getByRole("button", { name: "Accept" }))

    await waitFor(() => expect(mocks.accept).toHaveBeenCalled())
    expect(mocks.accept.mock.calls[0][0]).toBe("mem-1")
    expect(await screen.findByText("You're in U17 Boys")).toBeTruthy()
    expect(mocks.answered).toHaveBeenCalled()

    const toast = mocks.toast.mock.calls[0][0]
    expect(toast).toEqual(expect.objectContaining({ title: "You're in U17 Boys", variant: "success" }))
    expect(toast.action.label).toBe("View squad")
    toast.action.onClick()
    expect(mocks.push).toHaveBeenCalledWith("/organization/profile/dreamfc/squads/sq-1")
  })

  it("declines quietly", async () => {
    renderActions()

    await waitFor(() => expect(mocks.mine).toHaveBeenCalled())
    fireEvent.click(screen.getByRole("button", { name: "Decline" }))

    await waitFor(() => expect(mocks.decline).toHaveBeenCalled())
    expect(mocks.decline.mock.calls[0][0]).toBe("mem-1")
    expect(await screen.findByText("Declined")).toBeTruthy()
    expect(mocks.toast).not.toHaveBeenCalled()
  })
})

describe("SquadInviteActions once the invite is closed", () => {
  it("says so with no buttons when /squads/mine no longer lists it", async () => {
    mocks.mine.mockResolvedValue([row("invited", "someone-else")])
    renderActions()

    expect(await screen.findByText("This invite isn't available any more.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull()
  })

  it("reads the same when it was accepted somewhere else", async () => {
    mocks.mine.mockResolvedValue([row("active")])
    renderActions()

    expect(await screen.findByText("This invite isn't available any more.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull()
  })

  it("turns a refusal as closed into the same line", async () => {
    mocks.mine.mockResolvedValue([row("invited")])
    mocks.accept.mockRejectedValue(
      Object.assign(new Error("400"), {
        isAxiosError: true,
        response: { status: 400, data: { message: "Closed", data: { code: "invite_closed" } } },
      })
    )
    renderActions()

    await waitFor(() => expect(mocks.mine).toHaveBeenCalled())
    fireEvent.click(screen.getByRole("button", { name: "Accept" }))

    expect(await screen.findByText("This invite isn't available any more.")).toBeTruthy()
  })
})
