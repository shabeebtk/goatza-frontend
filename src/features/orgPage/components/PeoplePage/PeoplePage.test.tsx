// @vitest-environment jsdom
/**
 * Coaches and players. Players are opt-in: a candidate who can't be shown is
 * listed but can't be picked, with the reason, and taking a player off the page
 * asks first.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { FeaturedPlayer, PageCoaches, PagePlayers, PlayerCandidate } from "../../types"
import PeoplePage from "./PeoplePage"

const mocks = vi.hoisted(() => ({
  players: null as unknown,
  coaches: null as unknown,
  remove: vi.fn(),
  updateCoach: vi.fn(),
  replace: vi.fn(),
  toast: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace, back: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/page/people",
}))
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("@/features/organization/component/OrgPhotoCropSheet/OrgPhotoCropSheet", () => ({ default: () => null }))
vi.mock("@/shared/services/imageVariants", () => ({ ensureDecodableImage: vi.fn() }))
vi.mock("../../services/orgPage.api", async (original) => ({
  ...(await original<typeof import("../../services/orgPage.api")>()),
  getPlayersApi: () => Promise.resolve(mocks.players),
  getCoachesApi: () => Promise.resolve(mocks.coaches),
  removePlayerApi: mocks.remove,
  updateCoachApi: mocks.updateCoach,
}))

const ORG = { id: "org-1", name: "Bright Academy", username: "brightacademy", type: "academy", my_permissions: ["page.manage"] }

const candidate = (id: string, name: string, overrides: Partial<PlayerCandidate> = {}): PlayerCandidate => ({
  user: { id, name, username: id, photo: "" },
  years_label: "2019 – 2023",
  position: "Goalkeeper",
  is_public_profile: true,
  can_feature: true,
  ...overrides,
})

const featured = (id: string, name: string, highlight = ""): FeaturedPlayer => ({
  ...candidate(id, name),
  id: `f-${id}`,
  highlight,
  order: 0,
})

const renderPage = (tab: "coaches" | "players") =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
    >
      <PeoplePage orgId="org-1" tab={tab} />
    </QueryClientProvider>
  )

beforeEach(() => {
  mocks.remove.mockReset()
  mocks.updateCoach.mockReset()
  mocks.replace.mockReset()
  mocks.toast.mockReset()
  mocks.coaches = { coaches: [], candidates: [] } satisfies PageCoaches
  mocks.players = { players: [], candidates: [] } satisfies PagePlayers
  useAuthStore.setState({ organizations: [ORG] as never, currentOrganization: ORG as never })
})

afterEach(cleanup)

describe("The players tab", () => {
  it("lists a picked player with their years, position and highlight", async () => {
    mocks.players = { players: [featured("asha", "Asha Nair", "State U19 squad")], candidates: [] }
    renderPage("players")

    expect(await screen.findByText("Asha Nair")).toBeTruthy()
    expect(screen.getByText("2019 – 2023 · Goalkeeper")).toBeTruthy()
    expect(screen.getByText("State U19 squad")).toBeTruthy()
  })

  it("disables a candidate who can't be shown, and says why", async () => {
    mocks.players = {
      players: [],
      candidates: [
        candidate("asha", "Asha Nair"),
        candidate("bilal", "Bilal K", { is_public_profile: false, can_feature: false }),
        candidate("chen", "Chen L", { is_public_profile: true, can_feature: false }),
      ],
    }
    renderPage("players")

    fireEvent.click(await screen.findByRole("button", { name: "Add players" }))
    const sheet = await screen.findByRole("dialog", { name: "Add players" })

    expect(within(sheet).getByRole("button", { name: "Add Asha Nair" }).hasAttribute("disabled")).toBe(false)
    expect(within(sheet).getByRole("button", { name: "Add Bilal K" }).hasAttribute("disabled")).toBe(true)
    expect(within(sheet).getByText("Private profile, can't be shown")).toBeTruthy()
    expect(within(sheet).getByRole("button", { name: "Add Chen L" }).hasAttribute("disabled")).toBe(true)
    expect(within(sheet).getByText("Can't be shown")).toBeTruthy()
  })

  it("asks before taking a player off the page, and only then removes them", async () => {
    const asha = featured("asha", "Asha Nair")
    mocks.players = { players: [asha], candidates: [] }
    mocks.remove.mockResolvedValue({ players: [], candidates: [candidate("asha", "Asha Nair")] })
    renderPage("players")

    fireEvent.click(await screen.findByRole("button", { name: "More for Asha Nair" }))
    fireEvent.click(await screen.findByRole("button", { name: "Remove from page" }))

    expect(await screen.findByText("Remove Asha Nair from your page?")).toBeTruthy()
    expect(screen.getByText("Their career entry stays verified.")).toBeTruthy()
    expect(mocks.remove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("org-1", "f-asha"))
  })

  it("points to Verify when there is nobody to pick", async () => {
    renderPage("players")

    expect(
      await screen.findByText("Verify a player's time at your academy on Verify, then pick them here.")
    ).toBeTruthy()
    expect(screen.getByRole("link", { name: "Go to Verify" }).getAttribute("href")).toBe(
      "/organization/admin/org-1/verifications"
    )
  })
})

describe("The coaches tab", () => {
  it("dims a hidden coach and names the switch after them", async () => {
    mocks.coaches = {
      candidates: [],
      coaches: [
        {
          id: "c1", is_member: true, member_id: "m1", name: "Cora Coach", username: "cora", photo: "",
          role: "head_coach", role_label: "Head coach", title: "", licence: "AIFF C Licence",
          years_coaching: 12, is_visible: true, is_hidden: false, order: 0,
        },
        {
          id: "c2", is_member: false, member_id: null, name: "Ravi Menon", username: null, photo: "",
          role: "other", role_label: "Girls coach", title: "Girls coach", licence: "",
          years_coaching: null, is_visible: false, is_hidden: true, order: 1,
        },
      ],
    } satisfies PageCoaches
    renderPage("coaches")

    expect(await screen.findByText("Head coach · AIFF C Licence · 12 yrs")).toBeTruthy()
    expect(screen.getByText("Girls coach · Not on Goatza")).toBeTruthy()
    expect(screen.getByText("Hidden")).toBeTruthy()
    expect(screen.getByRole("switch", { name: "Show Cora Coach" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("switch", { name: "Show Ravi Menon" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByRole("button", { name: "Move Cora Coach up" }).hasAttribute("disabled")).toBe(true)
  })

  it("REPLACES the route when the tab changes", async () => {
    renderPage("coaches")
    fireEvent.click(await screen.findByRole("tab", { name: "Players" }))
    expect(mocks.replace).toHaveBeenCalledWith("/organization/admin/org-1/page/people?tab=players", { scroll: false })
  })
})
