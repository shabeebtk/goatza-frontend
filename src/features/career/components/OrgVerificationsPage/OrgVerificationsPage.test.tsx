// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SquadListItem } from "@/features/squads/types"
import { useAuthStore } from "@/store/auth.store"
import type { CareerVerificationRequest, CareerVerificationRequestList } from "../../types"
import OrgVerificationsPage from "./OrgVerificationsPage"
import styles from "./OrgVerificationsPage.module.css"

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  fetchQueue: vi.fn(),
  verify: vi.fn(),
  reject: vi.fn(),
  getSquads: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/verifications",
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock(
  "@/features/achievements/components/OrgAchievementVerifications/OrgAchievementVerifications",
  () => ({ default: () => <div data-testid="achievements" /> })
)
// The sheet is VerifyIntoSquadSheet's own test; here only whether it opens.
vi.mock("@/features/squads/components/VerifyIntoSquadSheet/VerifyIntoSquadSheet", () => ({
  default: ({ request, squads }: { request: { id: string }; squads: { id: string }[] }) => (
    <div
      data-testid="verify-into-squad"
      data-request={request.id}
      data-squads={squads.map((squad) => squad.id).join(",")}
    />
  ),
}))
vi.mock("../../services/career.api", async (original) => ({
  ...(await original<typeof import("../../services/career.api")>()),
  fetchVerificationRequestsApi: mocks.fetchQueue,
  verifyCareerEntryApi: mocks.verify,
  rejectCareerEntryApi: mocks.reject,
}))
vi.mock("@/features/squads/services/squads.api", async (original) => ({
  ...(await original<typeof import("@/features/squads/services/squads.api")>()),
  getSquadsApi: mocks.getSquads,
}))

const FOOTBALL = { id: "sport-1", name: "Football", icon_name: "mdi:soccer", icon_url: "" }
const CRICKET = { id: "sport-2", name: "Cricket", icon_name: "mdi:cricket", icon_url: "" }

const request = (
  id: string,
  name: string,
  sport = FOOTBALL,
  status: CareerVerificationRequest["verification_status"] = "pending"
): CareerVerificationRequest => ({
  id,
  user: { id: `user-${id}`, username: name.toLowerCase(), name, profile_photo: null, headline: null, role: "player" },
  title: "Striker",
  sport,
  positions: [],
  entry_type: "club_team",
  squad_level: "",
  age_group: "",
  start_date: "2025-06-01",
  end_date: null,
  is_current: true,
  description: "",
  verification_status: status,
  created_at: "2026-11-01T10:00:00Z",
})

const page = (results: CareerVerificationRequest[]): CareerVerificationRequestList => ({
  count: results.length,
  limit: 20,
  offset: 0,
  has_more: false,
  status: "pending",
  results,
})

const squad = (id: string, sport: { id: string; name: string; icon_name: string }): SquadListItem => ({
  id,
  name: `Squad ${id}`,
  sport,
  level: "",
  level_label: "",
  age_group: "",
  season: "",
  photo_url: "",
  is_public: true,
  invite_enabled: true,
  members_count: 3,
  pending_count: 0,
  open_invites_count: 0,
  created_at: "2026-11-01T10:00:00Z",
})

const actAs = (permissions: string[]) => {
  const org = { id: "org-1", name: "Dream FC", username: "dreamfc", my_permissions: permissions }
  useAuthStore.setState({
    user: { id: "user-1", username: "olive" } as never,
    actorType: "organization",
    actorId: "org-1",
    isOrgAdminView: true,
    organizations: [org] as never,
    currentOrganization: org as never,
  })
}

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <OrgVerificationsPage />
    </QueryClientProvider>
  )
  return client
}

const BOTH = ["verifications.review", "squads.view", "squads.review"]

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.fetchQueue.mockResolvedValue(page([request("e1", "Bilal")]))
  mocks.getSquads.mockResolvedValue([squad("sq-1", FOOTBALL)])
})

afterEach(cleanup)

describe("OrgVerificationsPage · Verify and add to squad", () => {
  it("offers it on a pending claim with both permissions and a squad of that sport", async () => {
    actAs(BOTH)
    renderPage()

    expect(await screen.findByRole("button", { name: "Verify and add to squad" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Verify and add to squad" }))
    const sheet = await screen.findByTestId("verify-into-squad")
    expect(sheet.getAttribute("data-request")).toBe("e1")
    expect(sheet.getAttribute("data-squads")).toBe("sq-1")
  })

  it("is not offered without squads.review, and the squads are not asked for", async () => {
    actAs(["verifications.review", "squads.view"])
    renderPage()

    expect(await screen.findByText("Bilal")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Verify" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Verify and add to squad" })).toBeNull()
    expect(mocks.getSquads).not.toHaveBeenCalled()
  })

  it("is not offered when the club has no squad in the claim's sport", async () => {
    actAs(BOTH)
    mocks.getSquads.mockResolvedValue([squad("sq-9", CRICKET)])
    const client = renderPage()

    expect(await screen.findByText("Bilal")).toBeTruthy()
    // Absence only means something once the squads have landed.
    await waitFor(() =>
      expect(client.getQueryState(["squads", "org-1", "list", "all"])?.status).toBe("success")
    )
    await waitFor(() => expect(screen.getByRole("button", { name: "Verify" })).toBeTruthy())
    expect(screen.queryByRole("button", { name: "Verify and add to squad" })).toBeNull()
  })

  it("only offers it on the claims whose sport has a squad", async () => {
    actAs(BOTH)
    mocks.fetchQueue.mockResolvedValue(
      page([request("e1", "Bilal", FOOTBALL), request("e2", "Chen", CRICKET)])
    )
    renderPage()

    expect(await screen.findByRole("button", { name: "Verify and add to squad" })).toBeTruthy()
    expect(screen.getAllByRole("button", { name: "Verify and add to squad" })).toHaveLength(1)
    expect(screen.getAllByRole("button", { name: "Verify" })).toHaveLength(2)
  })

  it("keeps a plain Verify exactly as it was: the entry id and no body", async () => {
    actAs(BOTH)
    mocks.verify.mockResolvedValue({ id: "e1" })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Verify" }))

    await waitFor(() => expect(mocks.verify).toHaveBeenCalledTimes(1))
    expect(mocks.verify.mock.calls[0][0]).toBe("e1")
    expect(mocks.verify.mock.calls[0][1]).toBeUndefined()
  })
})

describe("OrgVerificationsPage · three actions on a phone", () => {
  it("gives the squad action a short label, and keeps the full name as its aria-label", async () => {
    actAs(BOTH)
    renderPage()

    const button = await screen.findByRole("button", { name: "Verify and add to squad" })
    expect(button.getAttribute("aria-label")).toBe("Verify and add to squad")

    const full = button.querySelector(`.${styles.labelFull}`)
    const short = button.querySelector(`.${styles.labelShort}`)
    expect(full?.textContent).toBe("Verify and add to squad")
    expect(short?.textContent).toBe("Add to squad")
    // The short one is for the eye only: the button's name already says it all.
    expect(short?.getAttribute("aria-hidden")).toBe("true")
  })

  it("marks the row for the phone layout only when the squad action is offered", async () => {
    actAs(BOTH)
    renderPage()

    const squadButton = await screen.findByRole("button", { name: "Verify and add to squad" })
    const row = squadButton.parentElement as HTMLElement
    expect(row.className).toContain(styles.rowActionsSquad)
    // Reject drops under the two verifies as a text button there.
    const reject = screen.getByRole("button", { name: "Reject" })
    expect(reject.className).toContain(styles.rejectBtn)
  })

  it("leaves the row as it was without the squad action", async () => {
    actAs(["verifications.review"])
    renderPage()

    const verify = await screen.findByRole("button", { name: "Verify" })
    expect((verify.parentElement as HTMLElement).className).not.toContain(styles.rowActionsSquad)
    expect(screen.queryByRole("button", { name: "Verify and add to squad" })).toBeNull()
  })
})
