// @vitest-environment jsdom

import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { MemberItem, SquadDetail } from "../../types"
import RemoveSheet from "./RemoveSheet"

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  remove: vi.fn(),
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
  removeSquadMemberApi: mocks.remove,
}))

const SQUAD = {
  id: "sq-1",
  name: "U17 Boys",
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
      <RemoveSheet orgId="org-1" squad={SQUAD} member={MEMBER} onClose={onClose} />
    </QueryClientProvider>
  )

const radio = (name: RegExp) => screen.getByRole("radio", { name }) as HTMLInputElement

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.remove.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe("RemoveSheet", () => {
  it("asks why, with 'They left' chosen to begin with", () => {
    renderSheet()

    expect(screen.getByRole("heading", { name: "Remove Alex?" })).toBeTruthy()
    expect(
      screen.getByText("From U17 Boys. Tell us why, so their profile stays right.")
    ).toBeTruthy()
    expect(radio(/They left the squad/).checked).toBe(true)
    expect(radio(/Added by mistake/).checked).toBe(false)
    expect(
      screen.getByText(
        "Stays on their profile as verified, ending today. Their time here still counts."
      )
    ).toBeTruthy()
    expect(
      screen.getByText("They were never part of this squad. U17 Boys is taken off their profile.")
    ).toBeTruthy()
  })

  it("removes someone who left", async () => {
    const onClose = vi.fn()
    renderSheet(onClose)

    fireEvent.click(screen.getByRole("button", { name: "Remove" }))

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("org-1", "sq-1", "m1", "left"))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Removed from U17 Boys", variant: "success" })
    )
  })

  it("removes someone added by mistake", async () => {
    renderSheet()

    fireEvent.click(radio(/Added by mistake/))
    expect(radio(/Added by mistake/).checked).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Remove" }))

    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith("org-1", "sq-1", "m1", "mistake")
    )
  })

  it("keeps the sheet open with the reason when the server refuses", async () => {
    const onClose = vi.fn()
    mocks.remove.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "server words", data: { code: "not_active" } } },
    })
    renderSheet(onClose)

    fireEvent.click(screen.getByRole("button", { name: "Remove" }))

    expect((await screen.findByRole("alert")).textContent).toBe(
      "They're no longer in this squad."
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it("closes on Cancel without removing anyone", () => {
    const onClose = vi.fn()
    renderSheet(onClose)

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})
