// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { SquadDetail, SquadListItem } from "../../types"
import AddToSquadSheet, { squadsForApplicant } from "./AddToSquadSheet"

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  getSquads: vi.fn(),
  getSquad: vi.fn(),
  getRoster: vi.fn(),
  invite: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/recruitments/rec-1",
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("@/shared/components/ui/Select/Select", () => ({
  default: ({ label, value }: { label?: string; value: string }) => (
    <div data-testid={`select-${label}`} data-value={value} />
  ),
}))
vi.mock("../../services/squads.api", async (original) => ({
  ...(await original<typeof import("../../services/squads.api")>()),
  getSquadsApi: mocks.getSquads,
  getSquadApi: mocks.getSquad,
  getSquadRosterApi: mocks.getRoster,
  inviteToSquadApi: mocks.invite,
}))

const FOOTBALL = { id: "sport-1", name: "Football", icon_name: "mdi:soccer" }
const CRICKET = { id: "sport-2", name: "Cricket", icon_name: "mdi:cricket" }

const item = (id: string, name: string, sport = FOOTBALL): SquadListItem => ({
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
  members_count: 4,
  pending_count: 0,
  open_invites_count: 0,
  created_at: "2026-11-01T10:00:00Z",
})

const CRICKET_XI = item("sq-c", "Cricket XI", CRICKET)
const U17 = item("sq-1", "U17 Boys")
const SENIORS = item("sq-2", "Seniors")

const detailOf = (squad: SquadListItem): SquadDetail => ({
  ...squad,
  description: "",
  config: {
    uses_positions: false,
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
})

const refusal = (code: string) => ({
  isAxiosError: true,
  response: { status: 400, data: { message: "server words", data: { code } } },
})

const renderSheet = (sportId?: string) => {
  const onClose = vi.fn()
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AddToSquadSheet
        orgId="org-1"
        applicationId="app-7"
        applicant={{ id: "user-9", name: "Bilal" }}
        sportId={sportId}
        onClose={onClose}
      />
    </QueryClientProvider>
  )
  return { onClose }
}

const sendButton = () => screen.getByRole("button", { name: "Send invite" }) as HTMLButtonElement

/** Choose U17 Boys and wait for its config to put the fields up. */
const chooseU17 = async () => {
  fireEvent.click(await screen.findByRole("radio", { name: /U17 Boys/ }))
  await waitFor(() => expect(sendButton().disabled).toBe(false))
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.getSquads.mockResolvedValue([CRICKET_XI, U17, SENIORS])
  mocks.getSquad.mockImplementation(async (_org: string, id: string) =>
    detailOf([CRICKET_XI, U17, SENIORS].find((squad) => squad.id === id) ?? U17)
  )
  mocks.getRoster.mockResolvedValue({ count: 0, groups: [] })
  useAuthStore.setState({
    actorType: "organization",
    actorId: "org-1",
    organizations: [{ id: "org-1", name: "Dream FC", username: "dreamfc" }] as never,
    currentOrganization: { id: "org-1", name: "Dream FC", username: "dreamfc" } as never,
  })
})

afterEach(cleanup)

describe("squadsForApplicant", () => {
  it("puts the recruitment's sport first and keeps the rest in order", () => {
    expect(squadsForApplicant([CRICKET_XI, U17, SENIORS], "sport-1").map((squad) => squad.id)).toEqual([
      "sq-1",
      "sq-2",
      "sq-c",
    ])
  })

  it("leaves the server's order alone without a sport", () => {
    expect(squadsForApplicant([CRICKET_XI, U17], undefined).map((squad) => squad.id)).toEqual([
      "sq-c",
      "sq-1",
    ])
  })
})

describe("AddToSquadSheet", () => {
  it("lists the recruitment's sport first, with nothing chosen yet", async () => {
    renderSheet("sport-1")

    expect(screen.getByRole("dialog", { name: "Add Bilal to a squad" })).toBeTruthy()
    await screen.findByRole("radio", { name: /U17 Boys/ })
    const radios = screen.getAllByRole("radio") as HTMLInputElement[]
    expect(radios.map((radio) => radio.value)).toEqual(["sq-1", "sq-2", "sq-c"])
    expect(radios.every((radio) => !radio.checked)).toBe(true)
    expect(sendButton().disabled).toBe(true)
  })

  it("sends a direct invite that names the application, with the shirt number", async () => {
    mocks.invite.mockResolvedValue({ id: "m-1", status: "invited" })
    const { onClose } = renderSheet("sport-1")

    await chooseU17()
    expect(
      screen.getByText("They join as soon as they accept. Their profile will show U17 Boys as verified.")
    ).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Shirt number/), { target: { value: "9" } })
    fireEvent.click(sendButton())

    await waitFor(() =>
      expect(mocks.invite).toHaveBeenCalledWith("org-1", "sq-1", {
        user_id: "user-9",
        application_id: "app-7",
        jersey_number: 9,
      })
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Invite sent — Bilal joins when they accept." })
      )
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it("says they were added when the server answers active", async () => {
    mocks.invite.mockResolvedValue({ id: "m-1", status: "active" })
    renderSheet("sport-1")

    await chooseU17()
    fireEvent.click(sendButton())

    await waitFor(() =>
      expect(mocks.invite).toHaveBeenCalledWith("org-1", "sq-1", {
        user_id: "user-9",
        application_id: "app-7",
      })
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Bilal added to U17 Boys" })
      )
    )
  })

  it.each([
    ["already_member", "Already in U17 Boys."],
    ["already_invited", "Already invited to U17 Boys."],
    ["invalid_application", "This application can't be used for an invite."],
  ])("says %s in the sheet and stays open", async (code, sentence) => {
    mocks.invite.mockRejectedValue(refusal(code))
    const { onClose } = renderSheet("sport-1")

    await chooseU17()
    fireEvent.click(sendButton())

    expect((await screen.findByRole("alert")).textContent).toBe(sentence)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("preselects the only squad", async () => {
    mocks.getSquads.mockResolvedValue([U17])
    renderSheet()

    const radio = (await screen.findByRole("radio", { name: /U17 Boys/ })) as HTMLInputElement
    expect(radio.checked).toBe(true)
  })

  it("says so when the club has no squads", async () => {
    mocks.getSquads.mockResolvedValue([])
    renderSheet()

    expect(await screen.findByText("Your club has no squads yet.")).toBeTruthy()
  })
})
