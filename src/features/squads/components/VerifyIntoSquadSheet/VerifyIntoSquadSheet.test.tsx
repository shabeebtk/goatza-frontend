// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CareerVerificationRequest } from "@/features/career/types"
import { useAuthStore } from "@/store/auth.store"
import type { SquadDetail, SquadListItem } from "../../types"
import VerifyIntoSquadSheet from "./VerifyIntoSquadSheet"

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  verify: vi.fn(),
  getSquad: vi.fn(),
  getRoster: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/verifications",
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("@/shared/components/ui/Select/Select", () => ({
  default: ({
    label,
    options,
    onChange,
    value,
  }: {
    label?: string
    options: { value: string; label: string }[]
    onChange: (value: string) => void
    value: string
  }) => (
    <div data-testid={`select-${label}`} data-value={value}>
      {options.map((option) => (
        <button key={option.value} onClick={() => onChange(option.value)}>
          Pick {option.label}
        </button>
      ))}
    </div>
  ),
}))
vi.mock("@/features/career/services/career.api", async (original) => ({
  ...(await original<typeof import("@/features/career/services/career.api")>()),
  verifyCareerEntryApi: mocks.verify,
}))
vi.mock("../../services/squads.api", async (original) => ({
  ...(await original<typeof import("../../services/squads.api")>()),
  getSquadApi: mocks.getSquad,
  getSquadRosterApi: mocks.getRoster,
}))

const listItem = (id: string, name: string, members = 0): SquadListItem => ({
  id,
  name,
  sport: { id: "sport-1", name: "Football", icon_name: "mdi:soccer" },
  level: "youth",
  level_label: "Youth",
  age_group: "U17",
  season: "2026–27",
  photo_url: "",
  is_public: true,
  invite_enabled: true,
  members_count: members,
  pending_count: 0,
  open_invites_count: 0,
  created_at: "2026-11-01T10:00:00Z",
})

const detailOf = (item: SquadListItem): SquadDetail => ({
  ...item,
  description: "",
  config: {
    uses_positions: true,
    uses_jersey_numbers: false,
    member_noun: "player",
    member_noun_plural: "players",
    group_order: ["Forwards"],
    typical_squad_size: null,
    positions: [
      { id: "pos-st", name: "Striker", group: "Forwards" },
      { id: "pos-cb", name: "Centre-back", group: "Defenders" },
    ],
  },
  staff: [],
  captain_member_id: null,
  invite: { url: "https://goatza.com/squad-invite/abc", enabled: true },
})

const U17 = listItem("sq-1", "U17 Boys", 12)
const SENIORS = listItem("sq-2", "Seniors", 20)

const REQUEST: CareerVerificationRequest = {
  id: "entry-1",
  user: {
    id: "user-9",
    username: "bilal",
    name: "Bilal",
    profile_photo: null,
    headline: null,
    role: "player",
  },
  title: "Striker",
  sport: { id: "sport-1", name: "Football", icon_name: "mdi:soccer", icon_url: "" },
  positions: [{ id: "pos-st", name: "Striker" }],
  entry_type: "club_team",
  squad_level: "",
  age_group: "U17",
  start_date: "2025-06-01",
  end_date: null,
  is_current: true,
  description: "",
  verification_status: "pending",
  created_at: "2026-11-01T10:00:00Z",
}

const renderSheet = (squads: SquadListItem[], request = REQUEST) => {
  const onClose = vi.fn()
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <VerifyIntoSquadSheet
        orgId="org-1"
        request={request}
        squads={squads}
        tab="pending"
        onClose={onClose}
      />
    </QueryClientProvider>
  )
  return { onClose }
}

const verifyButton = () => screen.getByRole("button", { name: "Verify and add" }) as HTMLButtonElement

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.getSquad.mockImplementation(async (_org: string, id: string) =>
    detailOf(id === "sq-2" ? SENIORS : U17)
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

describe("VerifyIntoSquadSheet", () => {
  it("is titled for the player and preselects the only squad", async () => {
    renderSheet([U17])

    expect(screen.getByRole("dialog", { name: "Add Bilal to a squad" })).toBeTruthy()
    const radio = screen.getByRole("radio", { name: /U17 Boys/ }) as HTMLInputElement
    expect(radio.checked).toBe(true)
    expect(screen.getByText("12 players")).toBeTruthy()

    // The claim's position is one of the squad's, so it is the starting value.
    await waitFor(() =>
      expect(screen.getByTestId("select-Position").getAttribute("data-value")).toBe("pos-st")
    )
  })

  it("waits for a choice when there are several squads", () => {
    renderSheet([U17, SENIORS])

    const radios = screen.getAllByRole("radio") as HTMLInputElement[]
    expect(radios.every((radio) => !radio.checked)).toBe(true)
    expect(verifyButton().disabled).toBe(true)
  })

  it("sends the squad and the position with the verify, then says so", async () => {
    mocks.verify.mockResolvedValue({ id: "entry-1" })
    const { onClose } = renderSheet([U17])

    await waitFor(() => expect(verifyButton().disabled).toBe(false))
    fireEvent.click(verifyButton())

    await waitFor(() =>
      expect(mocks.verify).toHaveBeenCalledWith("entry-1", {
        squad_id: "sq-1",
        position_id: "pos-st",
      })
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Verified and added to U17 Boys", variant: "success" })
      )
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it("leaves the position out when the claim's is not one of the squad's", async () => {
    mocks.verify.mockResolvedValue({ id: "entry-1" })
    renderSheet([U17], { ...REQUEST, positions: [{ id: "pos-gk", name: "Goalkeeper" }] })

    await waitFor(() => expect(verifyButton().disabled).toBe(false))
    expect(screen.getByTestId("select-Position").getAttribute("data-value")).toBe("")
    fireEvent.click(verifyButton())

    await waitFor(() => expect(mocks.verify).toHaveBeenCalledWith("entry-1", { squad_id: "sq-1" }))
  })

  it("shows a squads refusal in the sheet, not as a toast, and stays open", async () => {
    mocks.verify.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          message: "This career entry is for a different sport than the squad.",
          data: { code: "sport_mismatch" },
        },
      },
    })
    const { onClose } = renderSheet([U17])

    await waitFor(() => expect(verifyButton().disabled).toBe(false))
    fireEvent.click(verifyButton())

    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(mocks.toast).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it("shows the server's sentence inline for a squads code without one of its own", async () => {
    mocks.verify.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          message: "This squad is full. A squad can have up to 100 players.",
          data: { code: "request_limit" },
        },
      },
    })
    renderSheet([U17])

    await waitFor(() => expect(verifyButton().disabled).toBe(false))
    fireEvent.click(verifyButton())

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This squad is full. A squad can have up to 100 players."
    )
  })
})
