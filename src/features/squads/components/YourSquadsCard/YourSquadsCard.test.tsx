// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { MySquadItem } from "../../types"
import YourSquadsCard from "./YourSquadsCard"

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  mine: vi.fn(),
  accept: vi.fn(),
  decline: vi.fn(),
  withdraw: vi.fn(),
  leave: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("../../services/squadsPlayer.api", async (original) => ({
  ...(await original<typeof import("../../services/squadsPlayer.api")>()),
  getMySquadsApi: mocks.mine,
  acceptSquadInviteApi: mocks.accept,
  declineSquadInviteApi: mocks.decline,
  withdrawSquadRequestApi: mocks.withdraw,
  leaveSquadApi: mocks.leave,
}))

const item = (
  id: string,
  status: MySquadItem["status"],
  squadName: string,
  squadId = `sq-${id}`
): MySquadItem => ({
  id,
  status,
  source: "invite",
  squad: {
    id: squadId,
    name: squadName,
    sport: { id: "s1", name: "Football", icon_name: "mdi:soccer" },
    photo_url: "",
    level_label: "",
    age_group: "",
  },
  organization: { id: "org-1", name: "Dream FC", username: "dreamfc", logo: "", is_verified: false },
  position: null,
  jersey_number: null,
  is_captain: false,
  requested_at: null,
  expires_at: null,
  joined_at: null,
})

const renderCard = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <YourSquadsCard />
    </QueryClientProvider>
  )

/** The list row that names `squadName`. */
const rowOf = (squadName: string) =>
  screen.getByText(squadName).closest("li") as HTMLElement

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  ;[mocks.accept, mocks.decline, mocks.withdraw, mocks.leave].forEach((mock) => {
    mock.mockResolvedValue(undefined)
  })
  useAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    user: { id: "u1", username: "asha" } as never,
    actorType: "user",
    actorId: null,
  })
})

afterEach(cleanup)

describe("YourSquadsCard", () => {
  it("is not there at all when the person has no squads", async () => {
    mocks.mine.mockResolvedValue([])
    const { container } = renderCard()

    await waitFor(() => expect(mocks.mine).toHaveBeenCalled())
    expect(container.textContent).toBe("")
    expect(screen.queryByText("Your squads")).toBeNull()
  })

  it("lists each place with its status, a link to the squad, and only-you-see-this", async () => {
    mocks.mine.mockResolvedValue([
      item("a", "active", "U17 Boys"),
      item("b", "invited", "Seniors"),
      item("c", "pending", "Thirds"),
    ])
    renderCard()

    expect(await screen.findByText("Your squads")).toBeTruthy()
    expect(screen.getByText("Only you see this")).toBeTruthy()

    expect(within(rowOf("U17 Boys")).getByText("In squad")).toBeTruthy()
    expect(within(rowOf("Seniors")).getByText("Invited")).toBeTruthy()
    expect(within(rowOf("Thirds")).getByText("Request sent")).toBeTruthy()

    expect(screen.getByText("U17 Boys").closest("a")?.getAttribute("href")).toBe(
      "/organization/profile/dreamfc/squads/sq-a"
    )
    expect(within(rowOf("U17 Boys")).getByText(/Dream FC/)).toBeTruthy()
  })

  it("asks before leaving, then leaves", async () => {
    mocks.mine.mockResolvedValue([item("a", "active", "U17 Boys")])
    renderCard()

    fireEvent.click(await screen.findByRole("button", { name: "Leave" }))
    expect(mocks.leave).not.toHaveBeenCalled()

    const dialog = (await screen.findByText("Leave U17 Boys?")).closest(
      '[role="alertdialog"]'
    ) as HTMLElement
    expect(within(dialog).getByText("U17 Boys stays on your career, ending today.")).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: "Leave" }))

    await waitFor(() => expect(mocks.leave).toHaveBeenCalled())
    expect(mocks.leave.mock.calls[0][0]).toBe("a")
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "You left U17 Boys", variant: "success" })
      )
    )
  })

  it("accepts or declines an invite", async () => {
    mocks.mine.mockResolvedValue([item("b", "invited", "Seniors")])
    renderCard()

    fireEvent.click(await screen.findByRole("button", { name: "Accept" }))
    await waitFor(() => expect(mocks.accept).toHaveBeenCalled())
    expect(mocks.accept.mock.calls[0][0]).toBe("b")
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "You're in Seniors" })
      )
    )

    fireEvent.click(await screen.findByRole("button", { name: "Decline" }))
    await waitFor(() => expect(mocks.decline).toHaveBeenCalled())
    expect(mocks.decline.mock.calls[0][0]).toBe("b")
  })

  it("withdraws a request that is still waiting", async () => {
    mocks.mine.mockResolvedValue([item("c", "pending", "Thirds")])
    renderCard()

    expect(screen.queryByRole("button", { name: "Leave" })).toBeNull()
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw" }))

    await waitFor(() => expect(mocks.withdraw).toHaveBeenCalled())
    expect(mocks.withdraw.mock.calls[0][0]).toBe("c")
  })
})
