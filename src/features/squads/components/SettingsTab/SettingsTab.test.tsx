// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { SquadDetail } from "../../types"
import SettingsTab from "./SettingsTab"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  toast: vi.fn(),
  update: vi.fn(),
  setLink: vi.fn(),
  resetLink: vi.fn(),
  remove: vi.fn(),
  setPhoto: vi.fn(),
  upload: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, back: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/squads/sq-1/settings",
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
// The real Select portals and measures; this one shows what the tab hands it.
vi.mock("@/shared/components/ui/Select/Select", () => ({
  default: ({
    label,
    options,
    onChange,
    value,
    disabled,
    helperText,
  }: {
    label?: string
    options: { value: string; label: string }[]
    onChange: (value: string) => void
    value: string
    disabled?: boolean
    helperText?: string
  }) => (
    <div data-testid={`select-${label}`} data-value={value} data-disabled={String(!!disabled)}>
      {options.map((option) => (
        <button key={option.value} disabled={disabled} onClick={() => onChange(option.value)}>
          Pick {option.label}
        </button>
      ))}
      {helperText && <p>{helperText}</p>}
    </div>
  ),
}))
vi.mock("@/features/organization/component/OrgPhotoCropSheet/OrgPhotoCropSheet", () => ({
  default: () => <div data-testid="crop-sheet" />,
}))
vi.mock("@/features/profile/hooks/useSportsQueries", () => ({
  useSportsList: () => ({
    data: [
      { id: "sport-1", name: "Football", icon_name: "mdi:soccer" },
      { id: "sport-2", name: "Cricket", icon_name: "mdi:cricket" },
    ],
    isLoading: false,
  }),
}))
vi.mock("@/shared/services/imageVariants", () => ({ ensureDecodableImage: vi.fn() }))
vi.mock("../../services/uploadSquadPhoto", () => ({
  SQUAD_PHOTO_ASPECT: 16 / 9,
  uploadSquadPhoto: mocks.upload,
}))
vi.mock("../../services/squads.api", async (original) => ({
  ...(await original<typeof import("../../services/squads.api")>()),
  updateSquadApi: mocks.update,
  setInviteLinkEnabledApi: mocks.setLink,
  resetInviteLinkApi: mocks.resetLink,
  deleteSquadApi: mocks.remove,
  setSquadPhotoApi: mocks.setPhoto,
}))

const squad = (overrides: Partial<SquadDetail> = {}): SquadDetail => ({
  id: "sq-1",
  name: "U17 Boys",
  sport: { id: "sport-1", name: "Football", icon_name: "mdi:soccer" },
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
  created_at: "2026-11-01T10:00:00Z",
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
  invite: { url: "https://goatza.com/squad-invite/abc", enabled: true },
  ...overrides,
})

const renderTab = (detail: SquadDetail = squad()) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SettingsTab orgId="org-1" squad={detail} />
    </QueryClientProvider>
  )

const confirmIn = async (title: string, button: string) => {
  const dialog = (await screen.findByText(title)).closest('[role="alertdialog"]') as HTMLElement
  fireEvent.click(within(dialog).getByRole("button", { name: button }))
}

const toastTitles = () => mocks.toast.mock.calls.map(([options]) => options.title)

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  useAuthStore.setState({
    user: { id: "user-1", username: "olive" } as never,
    actorType: "organization",
    actorId: "org-1",
    isOrgAdminView: true,
    organizations: [
      {
        id: "org-1",
        name: "Dream FC",
        username: "dreamfc",
        my_permissions: ["squads.view", "squads.review", "squads.manage"],
      },
    ] as never,
    currentOrganization: {
      id: "org-1",
      name: "Dream FC",
      username: "dreamfc",
      my_permissions: ["squads.view", "squads.review", "squads.manage"],
    } as never,
  })
})

afterEach(cleanup)

describe("SettingsTab · who sees it", () => {
  it("names the club and turns the squad off the profile with {is_public}", async () => {
    mocks.update.mockResolvedValue(squad({ is_public: false }))
    renderTab()

    expect(screen.getByText("Your squad page and its players appear on Dream FC's profile.")).toBeTruthy()
    const toggle = screen.getByRole("switch", { name: "Show on club profile" })
    expect(toggle.getAttribute("aria-checked")).toBe("true")

    fireEvent.click(toggle)

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("org-1", "sq-1", { is_public: false }))
  })
})

describe("SettingsTab · invite link", () => {
  it("turns the link off with the flipped value", async () => {
    mocks.setLink.mockResolvedValue({ url: "https://goatza.com/squad-invite/abc", enabled: false })
    renderTab()

    fireEvent.click(screen.getByRole("switch", { name: "Link is on" }))

    await waitFor(() => expect(mocks.setLink).toHaveBeenCalledWith("org-1", "sq-1", false))
  })

  it("asks before resetting, then tells the club a new link is ready", async () => {
    mocks.resetLink.mockResolvedValue({ url: "https://goatza.com/squad-invite/new", enabled: true })
    renderTab()

    fireEvent.click(screen.getByRole("button", { name: "Reset link" }))
    expect(mocks.resetLink).not.toHaveBeenCalled()
    expect(
      await screen.findByText("Every link you've shared stops working. Requests you already have stay.")
    ).toBeTruthy()

    await confirmIn("Reset the invite link?", "Reset link")

    await waitFor(() => expect(mocks.resetLink).toHaveBeenCalledWith("org-1", "sq-1"))
    await waitFor(() => expect(toastTitles()).toContain("New link ready"))
  })

  it("keeps the link when the question is answered Keep", async () => {
    renderTab()

    fireEvent.click(screen.getByRole("button", { name: "Reset link" }))
    await confirmIn("Reset the invite link?", "Keep")

    await waitFor(() => expect(screen.queryByText("Reset the invite link?")).toBeNull())
    expect(mocks.resetLink).not.toHaveBeenCalled()
  })
})

describe("SettingsTab · squad details", () => {
  it("leaves the sport open while the squad is empty", () => {
    renderTab()

    expect(screen.getByTestId("select-Sport").getAttribute("data-disabled")).toBe("false")
    expect(screen.queryByText("The sport can't change once the squad has players.")).toBeNull()
  })

  it.each([
    ["players", { members_count: 3 }],
    ["requests", { pending_count: 1 }],
    ["open invites", { open_invites_count: 2 }],
  ])("locks the sport once it has %s", (_label, counts) => {
    renderTab(squad(counts))

    expect(screen.getByTestId("select-Sport").getAttribute("data-disabled")).toBe("true")
    expect(screen.getByText("The sport can't change once the squad has players.")).toBeTruthy()
  })

  it("only saves once something changed, and then only what changed", async () => {
    mocks.update.mockResolvedValue(squad({ name: "U17 Girls" }))
    renderTab()

    const save = screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement
    expect(save.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  U17 Girls " } })
    expect(save.disabled).toBe(false)

    fireEvent.click(save)

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("org-1", "sq-1", { name: "U17 Girls" }))
    await waitFor(() => expect(toastTitles()).toContain("Saved"))
  })

  it("sends a cleared level and a new season, and nothing else", async () => {
    mocks.update.mockResolvedValue(squad({ level: "", level_label: "", season: "2027–28" }))
    renderTab()

    fireEvent.click(screen.getByRole("button", { name: "Youth" }))
    fireEvent.change(screen.getByLabelText(/Season/), { target: { value: "2027–28" } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith("org-1", "sq-1", { level: "", season: "2027–28" })
    )
  })

  it("shows name_taken under the name", async () => {
    mocks.update.mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "server words", data: { code: "name_taken" } } },
    })
    renderTab()

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Seniors" } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    expect(await screen.findByText("You already have a squad with this name.")).toBeTruthy()
  })
})

describe("SettingsTab · delete", () => {
  it("asks first, then deletes, says so and goes back to the list", async () => {
    mocks.remove.mockResolvedValue(undefined)
    renderTab()

    fireEvent.click(screen.getByRole("button", { name: "Delete squad" }))
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(
      await screen.findByText(
        "Players keep U17 Boys on their profile, ending today. Requests and invites are cancelled."
      )
    ).toBeTruthy()

    await confirmIn("Delete U17 Boys?", "Delete squad")

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("org-1", "sq-1"))
    await waitFor(() => expect(toastTitles()).toContain("Squad deleted"))
    expect(mocks.replace).toHaveBeenCalledWith("/organization/admin/org-1/squads")
  })
})
