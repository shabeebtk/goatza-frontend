// @vitest-environment jsdom

import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Candidate, SquadDetail } from "../../types"
import InvitePlayerSheet from "./InvitePlayerSheet"

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  candidates: vi.fn(),
  getRoster: vi.fn(),
  invite: vi.fn(),
}))

vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
// jsdom has no matchMedia; a phone, so nothing is auto-focused.
vi.mock("@/shared/hooks/useMediaQuery", () => ({ useMediaQuery: () => false }))
vi.mock("@/shared/components/ui/Select/Select", () => ({
  default: ({ label, value }: { label?: string; value: string }) => (
    <div data-testid={`select-${label}`} data-value={value} />
  ),
}))
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
      <div data-testid="sheet-body">{children(onClose)}</div>
      <div data-testid="sheet-footer">{footer?.(onClose)}</div>
    </div>
  ),
}))
vi.mock("../../services/squads.api", async (original) => ({
  ...(await original<typeof import("../../services/squads.api")>()),
  getSquadCandidatesApi: mocks.candidates,
  getSquadRosterApi: mocks.getRoster,
  inviteToSquadApi: mocks.invite,
}))

const SQUAD = {
  id: "sq-1",
  name: "U17 Boys",
  config: {
    uses_positions: true,
    uses_jersey_numbers: true,
    member_noun: "player",
    member_noun_plural: "players",
    group_order: [],
    typical_squad_size: null,
    positions: [{ id: "pos-st", name: "Striker", group: "Forwards" }],
  },
} as unknown as SquadDetail

const candidate = (id: string, name: string, state: Candidate["state"]): Candidate => ({
  user: { id: `u-${id}`, username: name.toLowerCase(), name, photo: "" },
  primary_position: { id: "pos-st", name: "Striker" },
  state,
})

const ALEX = candidate("alex", "Alex", "none")
const BILAL = candidate("bilal", "Bilal", "pending")
const CHEN = candidate("chen", "Chen", "invited")
const DANA = candidate("dana", "Dana", "active")

const renderSheet = (onClose = vi.fn()) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <InvitePlayerSheet orgId="org-1" squad={SQUAD} onClose={onClose} />
    </QueryClientProvider>
  )

const search = (value: string) =>
  fireEvent.change(screen.getByLabelText("Find a player"), { target: { value } })

const footer = () => within(screen.getByTestId("sheet-footer"))

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.candidates.mockResolvedValue([ALEX, BILAL, CHEN, DANA])
  mocks.getRoster.mockResolvedValue({ count: 0, groups: [] })
})

afterEach(cleanup)

describe("InvitePlayerSheet search", () => {
  it("asks for at least two characters before searching", async () => {
    renderSheet()

    expect(screen.getByText("Search by name or @username.")).toBeTruthy()
    search("a")
    // Past the debounce, and still nothing asked.
    await new Promise((done) => setTimeout(done, 400))
    expect(screen.getByText("Search by name or @username.")).toBeTruthy()
    expect(mocks.candidates).not.toHaveBeenCalled()
  })

  it("shows each candidate by what they are to the squad", async () => {
    renderSheet()
    search("al")

    const alex = await screen.findByRole("button", { name: /Alex/ })
    expect(mocks.candidates).toHaveBeenCalledWith("org-1", "sq-1", "al")
    expect((alex as HTMLButtonElement).disabled).toBe(false)
    expect(alex.textContent).toContain("@alex · Striker")

    // Asked to join: not one button, it carries "Add now".
    expect(screen.queryByRole("button", { name: /Bilal/ })).toBeNull()
    expect(screen.getByText("Asked to join")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Add now" })).toBeTruthy()

    const chen = screen.getByRole("button", { name: /Chen/ }) as HTMLButtonElement
    expect(chen.disabled).toBe(true)
    expect(chen.textContent).toContain("Invited")

    const dana = screen.getByRole("button", { name: /Dana/ }) as HTMLButtonElement
    expect(dana.disabled).toBe(true)
    expect(dana.textContent).toContain("In squad")
  })

  it("says only players can join when nobody matches", async () => {
    mocks.candidates.mockResolvedValue([])
    renderSheet()
    search("zz")

    expect(
      await screen.findByText("No players found. Only player accounts can join squads.")
    ).toBeTruthy()
  })
})

describe("InvitePlayerSheet sending", () => {
  it("invites someone new and says the invite went", async () => {
    const onClose = vi.fn()
    mocks.invite.mockResolvedValue({ id: "m-new", status: "invited" })
    renderSheet(onClose)
    search("al")

    fireEvent.click(await screen.findByRole("button", { name: /Alex/ }))

    // Step 2: the player, their position prefilled, and what happens next.
    expect(screen.getByTestId("select-Position").getAttribute("data-value")).toBe("pos-st")
    expect(
      screen.getByText(
        "They join as soon as they accept. Their profile will show U17 Boys as verified."
      )
    ).toBeTruthy()

    fireEvent.click(footer().getByRole("button", { name: "Send invite" }))

    await waitFor(() =>
      expect(mocks.invite).toHaveBeenCalledWith("org-1", "sq-1", {
        user_id: "u-alex",
        position_id: "pos-st",
      })
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Invite sent" }))
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("adds someone who already asked at once", async () => {
    const onClose = vi.fn()
    mocks.invite.mockResolvedValue({ id: "m-bilal", status: "active" })
    renderSheet(onClose)
    search("bi")

    fireEvent.click(await screen.findByRole("button", { name: "Add now" }))

    expect(screen.getByText(/They asked to join, so they're added straight away/)).toBeTruthy()
    fireEvent.click(footer().getByRole("button", { name: "Add now" }))

    await waitFor(() =>
      expect(mocks.invite).toHaveBeenCalledWith(
        "org-1",
        "sq-1",
        expect.objectContaining({ user_id: "u-bilal" })
      )
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Bilal added" }))
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("goes back to the results", async () => {
    renderSheet()
    search("al")

    fireEvent.click(await screen.findByRole("button", { name: /Alex/ }))
    fireEvent.click(footer().getByRole("button", { name: "Back" }))

    expect(screen.getByLabelText("Find a player")).toBeTruthy()
    expect(await screen.findByRole("button", { name: /Alex/ })).toBeTruthy()
    expect(mocks.invite).not.toHaveBeenCalled()
  })

  it("shows a refusal in place", async () => {
    const onClose = vi.fn()
    mocks.invite.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "server words", data: { code: "already_invited" } } },
    })
    renderSheet(onClose)
    search("al")

    fireEvent.click(await screen.findByRole("button", { name: /Alex/ }))
    fireEvent.click(footer().getByRole("button", { name: "Send invite" }))

    expect((await screen.findByRole("alert")).textContent).toBe(
      "They already have an invite to this squad."
    )
    expect(onClose).not.toHaveBeenCalled()
  })
})
