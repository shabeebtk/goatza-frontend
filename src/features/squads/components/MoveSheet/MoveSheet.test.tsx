// @vitest-environment jsdom

import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { MemberItem, SquadDetail, SquadListItem } from "../../types"
import MoveSheet from "./MoveSheet"

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  getSquads: vi.fn(),
  move: vi.fn(),
}))

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
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
  getSquadsApi: mocks.getSquads,
  moveSquadMemberApi: mocks.move,
}))

const FOOTBALL = { id: "sport-fb", name: "Football", icon_name: "mdi:soccer" }
const NETBALL = { id: "sport-nb", name: "Netball", icon_name: "mdi:basketball" }

const listItem = (
  id: string,
  name: string,
  sport: SquadListItem["sport"],
  members_count: number
): SquadListItem => ({
  id,
  name,
  sport,
  level: "",
  level_label: "",
  age_group: "",
  season: "",
  photo_url: "",
  is_public: true,
  invite_enabled: true,
  members_count,
  pending_count: 0,
  open_invites_count: 0,
  created_at: "2026-11-01T00:00:00Z",
})

const SQUAD = {
  ...listItem("sq-1", "U17 Boys", FOOTBALL, 14),
  config: { member_noun: "player", member_noun_plural: "players" },
} as unknown as SquadDetail

const MEMBER = {
  id: "m1",
  user: { id: "u-alex", username: "alex", name: "Alex", photo: "", age: 16 },
} as unknown as MemberItem

const renderSheet = (onClose = vi.fn()) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MoveSheet orgId="org-1" squad={SQUAD} member={MEMBER} onClose={onClose} />
    </QueryClientProvider>
  )

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  // Even if the server sent every sport, the sheet keeps to this squad's.
  mocks.getSquads.mockResolvedValue([
    listItem("sq-1", "U17 Boys", FOOTBALL, 14),
    listItem("sq-2", "Seniors", FOOTBALL, 1),
    listItem("sq-3", "U15 Girls", FOOTBALL, 9),
    listItem("sq-4", "Netball A", NETBALL, 7),
  ])
})

afterEach(cleanup)

describe("MoveSheet", () => {
  it("lists only the club's other squads of the same sport", async () => {
    renderSheet()

    expect(await screen.findByRole("radio", { name: /Seniors/ })).toBeTruthy()
    expect(screen.getByRole("radio", { name: /U15 Girls/ })).toBeTruthy()
    expect(screen.queryByRole("radio", { name: /U17 Boys/ })).toBeNull()
    expect(screen.queryByRole("radio", { name: /Netball A/ })).toBeNull()
    expect(screen.getAllByRole("radio")).toHaveLength(2)

    expect(screen.getByText("1 player")).toBeTruthy()
    expect(screen.getByText("9 players")).toBeTruthy()
    expect(mocks.getSquads).toHaveBeenCalledWith("org-1", "sport-fb")
  })

  it("moves the player to the chosen squad", async () => {
    const onClose = vi.fn()
    mocks.move.mockResolvedValue({ id: "m1-new" })
    renderSheet(onClose)

    const move = screen.getByRole("button", { name: "Move" }) as HTMLButtonElement
    expect(move.disabled).toBe(true)

    fireEvent.click(await screen.findByRole("radio", { name: /U15 Girls/ }))
    expect(move.disabled).toBe(false)
    fireEvent.click(move)

    await waitFor(() => expect(mocks.move).toHaveBeenCalledWith("org-1", "sq-1", "m1", "sq-3"))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Moved to U15 Girls", variant: "success" })
    )
  })

  it("says so when there is nowhere to move them", async () => {
    mocks.getSquads.mockResolvedValue([
      listItem("sq-1", "U17 Boys", FOOTBALL, 14),
      listItem("sq-4", "Netball A", NETBALL, 7),
    ])
    renderSheet()

    expect(
      await screen.findByText("There's no other Football squad to move them to.")
    ).toBeTruthy()
    expect(screen.queryByRole("radio")).toBeNull()
  })

  it("shows the server's refusal in place", async () => {
    const onClose = vi.fn()
    mocks.move.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "server words", data: { code: "sport_mismatch" } } },
    })
    renderSheet(onClose)

    fireEvent.click(await screen.findByRole("radio", { name: /Seniors/ }))
    fireEvent.click(screen.getByRole("button", { name: "Move" }))

    expect((await screen.findByRole("alert")).textContent).toBe(
      "They can only move to a squad of the same sport."
    )
    expect(onClose).not.toHaveBeenCalled()
  })
})
