// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AccountSwitcherContent } from "./AccountSwitcher"

const mocks = vi.hoisted(() => ({ invites: [] as unknown[] | undefined, close: vi.fn() }))

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
  }: {
    href: string
    children: React.ReactNode
    onClick?: () => void
  }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault()
        onClick?.()
      }}
    >
      {children}
    </a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))
vi.mock("@/features/orgMembers/hooks/useOrgMembers", () => ({
  useMyInvites: () => ({ data: mocks.invites }),
}))

const renderSwitcher = (mode: "user" | "organization" = "user") =>
  render(
    <AccountSwitcherContent
      mode={mode}
      styles={{}}
      actorType={mode}
      actorId={mode === "organization" ? "org-1" : null}
      organizations={[{ id: "org-1", name: "Dream FC" }] as never}
      user={{ id: "u1", username: "me", name: "Me" } as never}
      currentOrgId={mode === "organization" ? "org-1" : undefined}
      onClose={mocks.close}
      onSwitchToUser={vi.fn()}
      onSwitchToOrganization={vi.fn()}
      onLogout={vi.fn()}
    />
  )

beforeEach(() => {
  mocks.close.mockReset()
  mocks.invites = []
})

afterEach(cleanup)

describe("The Invitations row", () => {
  it("is absent with nothing to answer, or before the answer is in", () => {
    renderSwitcher()
    expect(screen.queryByText(/Invitations/)).toBeNull()
    cleanup()

    mocks.invites = undefined
    renderSwitcher()
    expect(screen.queryByText(/Invitations/)).toBeNull()
  })

  it("counts them and opens the notifications page", () => {
    mocks.invites = [{ id: "a" }, { id: "b" }]
    renderSwitcher()

    const row = screen.getByText("Invitations (2)").closest("a") as HTMLAnchorElement
    expect(row.getAttribute("href")).toBe("/notifications")

    fireEvent.click(row)
    expect(mocks.close).toHaveBeenCalled()
  })

  it("is there while acting as an org too, since invites are the person's", () => {
    mocks.invites = [{ id: "a" }]
    renderSwitcher("organization")

    expect(screen.getByText("Invitations (1)")).toBeTruthy()
  })
})
