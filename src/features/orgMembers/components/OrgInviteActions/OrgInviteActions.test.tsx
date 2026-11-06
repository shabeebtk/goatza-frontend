// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import OrgInviteActions from "./OrgInviteActions"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  mine: vi.fn(),
  accept: vi.fn(),
  decline: vi.fn(),
  getOrgs: vi.fn(),
  answered: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))
vi.mock("@/shared/components/ui/BackHeader/BackHeader", () => ({ default: () => null }))
vi.mock("@/shared/components/ui/Select/Select", () => ({ default: () => null }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("@/features/organization/services/organization.api", () => ({
  getOrganizationsApi: mocks.getOrgs,
}))
vi.mock("../../services/orgMembers.api", async (original) => ({
  ...(await original<typeof import("../../services/orgMembers.api")>()),
  getMyInvitesApi: mocks.mine,
  acceptInviteApi: mocks.accept,
  declineInviteApi: mocks.decline,
}))

const ORG = { id: "org-1", name: "Dream FC", username: "dreamfc", my_role: "coach" }

const renderCard = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrgInviteActions
        inviteId="inv-1"
        organizationName="Dream FC"
        onAnswered={mocks.answered}
      />
    </QueryClientProvider>
  )

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.mine.mockResolvedValue([{ id: "inv-1" }])
  mocks.getOrgs.mockResolvedValue([ORG])
  useAuthStore.setState({
    user: { id: "u1", username: "me" } as never,
    actorType: "user",
    actorId: null,
    organizations: [],
    currentOrganization: null,
  })
})

afterEach(cleanup)

describe("Accepting from the card", () => {
  it("refreshes the org list into the store and offers Switch", async () => {
    mocks.accept.mockResolvedValue(ORG)
    renderCard()

    fireEvent.click(await screen.findByRole("button", { name: "Accept" }))

    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith("inv-1"))
    expect(await screen.findByText("You joined Dream FC")).toBeTruthy()
    await waitFor(() => expect(mocks.getOrgs).toHaveBeenCalled())
    expect(useAuthStore.getState().organizations.map((org) => org.id)).toEqual(["org-1"])
    expect(mocks.answered).toHaveBeenCalled()

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled())
    const toast = mocks.toast.mock.lastCall![0]
    expect(toast.title).toBe("You joined Dream FC")
    expect(toast.action.label).toBe("Switch")

    toast.action.onClick()
    expect(useAuthStore.getState().actorType).toBe("organization")
    expect(useAuthStore.getState().actorId).toBe("org-1")
    expect(mocks.push).toHaveBeenCalledWith("/organization/admin/org-1/dashboard")
  })

  it("shows a loading state and locks both buttons while it runs", async () => {
    let finish!: (value: unknown) => void
    mocks.accept.mockReturnValue(new Promise((done) => (finish = done)))
    renderCard()

    fireEvent.click(await screen.findByRole("button", { name: "Accept" }))

    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Decline" }) as HTMLButtonElement).disabled).toBe(
        true
      )
    )
    expect((screen.getByRole("button", { name: "Accept" }) as HTMLButtonElement).disabled).toBe(true)

    finish(ORG)
    expect(await screen.findByText("You joined Dream FC")).toBeTruthy()
  })
})

describe("Declining from the card", () => {
  it("says Declined", async () => {
    mocks.decline.mockResolvedValue(undefined)
    renderCard()

    fireEvent.click(await screen.findByRole("button", { name: "Decline" }))

    expect(await screen.findByText("Declined")).toBeTruthy()
    expect(mocks.decline).toHaveBeenCalledWith("inv-1")
    expect(mocks.answered).toHaveBeenCalled()
  })
})

describe("An invite that has gone", () => {
  const closed = { isAxiosError: true, response: { status: 400, data: { data: { code: "invite_not_pending" } } } }

  it("says so without offering a button, when it is off invites/mine", async () => {
    mocks.mine.mockResolvedValue([])
    renderCard()

    expect(await screen.findByText("This invite is no longer available")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull()
  })

  it("says so when the server refuses it after the list was read", async () => {
    mocks.accept.mockRejectedValue(closed)
    renderCard()

    fireEvent.click(await screen.findByRole("button", { name: "Accept" }))

    expect(await screen.findByText("This invite is no longer available")).toBeTruthy()
  })

  it("keeps the buttons for a refusal that can be retried", async () => {
    mocks.accept.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "x", data: { code: "member_limit" } } },
    })
    renderCard()

    fireEvent.click(await screen.findByRole("button", { name: "Accept" }))

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Dream FC has reached its limit of 50 members."
    )
    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy()
  })
})
