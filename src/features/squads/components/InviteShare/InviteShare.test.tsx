// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { SquadDetail } from "../../types"
import InviteShareCard from "./InviteShare"

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  writeText: vi.fn(),
  share: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, back: vi.fn(), replace: mocks.replace }),
  usePathname: () => "/organization/admin/org-1/squads/sq-1",
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))

const URL_ = "https://goatza.com/squad-invite/tok-123"

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
  members_count: 0,
  pending_count: 0,
  open_invites_count: 0,
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
  invite: { url: URL_, enabled: true },
  ...over,
})

const renderCard = (
  props: Partial<{ squad: SquadDetail; canManage: boolean; onInviteDirect: () => void }> = {}
) =>
  render(
    <InviteShareCard
      orgId="org-1"
      squad={props.squad ?? squad()}
      canManage={props.canManage ?? true}
      onInviteDirect={props.onInviteDirect ?? vi.fn()}
    />
  )

const setNavigator = (key: "clipboard" | "share", value: unknown) =>
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true })

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.writeText.mockResolvedValue(undefined)
  mocks.share.mockResolvedValue(undefined)
  setNavigator("clipboard", { writeText: mocks.writeText })
  setNavigator("share", undefined)
  useAuthStore.setState({
    organizations: [{ id: "org-1", name: "Dream FC", username: "dreamfc" }] as never,
    currentOrganization: { id: "org-1", name: "Dream FC", username: "dreamfc" } as never,
  })
})

afterEach(() => {
  cleanup()
  setNavigator("share", undefined)
})

describe("InviteShareCard with the link on", () => {
  it("shows the link and copies it", async () => {
    renderCard()

    expect(screen.getByText("Fill your squad")).toBeTruthy()
    expect(screen.getByText(URL_)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }))

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(URL_))
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Link copied" }))
    )
  })

  it("shows the link by hand when the clipboard refuses", async () => {
    mocks.writeText.mockRejectedValue(new Error("blocked"))
    renderCard()

    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }))

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't copy automatically", message: URL_ })
      )
    )
  })

  it("hands the link to the share sheet when there is one", async () => {
    setNavigator("share", mocks.share)
    renderCard()

    fireEvent.click(screen.getByRole("button", { name: "Share link" }))

    await waitFor(() =>
      expect(mocks.share).toHaveBeenCalledWith({
        title: "Join U17 Boys on Goatza",
        text: "Dream FC invites you to ask to join U17 Boys on Goatza.",
        url: URL_,
      })
    )
    expect(mocks.writeText).not.toHaveBeenCalled()
  })

  it("does nothing more when the share sheet is dismissed", async () => {
    setNavigator("share", mocks.share)
    mocks.share.mockRejectedValue(Object.assign(new Error("dismissed"), { name: "AbortError" }))
    renderCard()

    fireEvent.click(screen.getByRole("button", { name: "Share link" }))

    await waitFor(() => expect(mocks.share).toHaveBeenCalled())
    expect(mocks.writeText).not.toHaveBeenCalled()
  })

  it("copies instead where there is no share sheet", async () => {
    renderCard()

    fireEvent.click(screen.getByRole("button", { name: "Share link" }))

    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(URL_))
    expect(mocks.share).not.toHaveBeenCalled()
  })

  it("draws the QR code as one path", () => {
    renderCard()

    const qr = screen.getByRole("img", { name: /QR code/ })
    const paths = qr.querySelectorAll("path")
    expect(paths).toHaveLength(1)
    expect(paths[0].getAttribute("d")).toMatch(/^M\d+ \d+h1v1h-1z/)
    expect(qr.getAttribute("viewBox")).toMatch(/^0 0 \d+ \d+$/)
    expect(screen.getByRole("button", { name: /Download/ })).toBeTruthy()
  })

  it("offers a direct invite", () => {
    const onInviteDirect = vi.fn()
    renderCard({ onInviteDirect })

    fireEvent.click(screen.getByRole("button", { name: /Invite a player directly/ }))
    expect(onInviteDirect).toHaveBeenCalledTimes(1)
  })
})

describe("InviteShareCard with the link off", () => {
  const off = () => squad({ invite: { url: URL_, enabled: false }, invite_enabled: false })

  it("says so, and points a manager to Settings", () => {
    renderCard({ squad: off(), canManage: true })

    expect(screen.getByText("Your invite link is off.")).toBeTruthy()
    expect(screen.queryByText("Fill your squad")).toBeNull()
    expect(screen.queryByRole("img", { name: /QR code/ })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Turn it on in Settings" }))
    expect(mocks.replace).toHaveBeenCalledWith(
      "/organization/admin/org-1/squads/sq-1/settings",
      { scroll: false }
    )
    // The direct invite still works with the link off.
    expect(screen.getByRole("button", { name: /Invite a player directly/ })).toBeTruthy()
  })

  it("has nothing to point to for someone who can't manage", () => {
    renderCard({ squad: off(), canManage: false })

    expect(screen.getByText("Your invite link is off.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Turn it on in Settings" })).toBeNull()
  })
})

describe("InviteShareCard without review", () => {
  it("renders nothing when the server sent no link", () => {
    const { container } = renderCard({ squad: squad({ invite: null }) })
    expect(container.textContent).toBe("")
  })
})
