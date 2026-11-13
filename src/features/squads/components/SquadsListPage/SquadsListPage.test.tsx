// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { SquadListItem } from "../../types"
import SquadsListPage from "./SquadsListPage"

const mocks = vi.hoisted(() => ({
  getSquads: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/squads",
}))
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/BackHeader/BackHeader", () => ({
  default: ({ title }: { title: string }) => <header>{title}</header>,
}))
vi.mock("../NewSquadSheet/NewSquadSheet", () => ({
  default: () => <div data-testid="new-squad-sheet" />,
}))
vi.mock("../../services/squads.api", async (original) => ({
  ...(await original<typeof import("../../services/squads.api")>()),
  getSquadsApi: mocks.getSquads,
}))

const ORG = "org-1"
const BASE = `/organization/admin/${ORG}/squads`

function squad(overrides: Partial<SquadListItem> = {}): SquadListItem {
  return {
    id: "sq-1",
    name: "U17 Boys",
    sport: { id: "s-foot", name: "Football", icon_name: "mdi:soccer" },
    level: "youth",
    level_label: "Youth",
    age_group: "U17",
    season: "2026–27",
    photo_url: "",
    is_public: true,
    invite_enabled: true,
    members_count: 12,
    pending_count: 0,
    open_invites_count: 0,
    created_at: "2026-06-01T00:00:00Z",
    ...overrides,
  }
}

function actAs(permissions: string[]) {
  const org = { id: ORG, name: "Dream FC", username: "dreamfc", my_permissions: permissions }
  useAuthStore.setState({
    actorType: "organization",
    actorId: ORG,
    organizations: [org] as never,
    currentOrganization: org as never,
  })
}

const VIEW = ["squads.view"]
const REVIEW = ["squads.view", "squads.review"]
const MANAGE = ["squads.view", "squads.review", "squads.manage"]

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SquadsListPage orgId={ORG} />
    </QueryClientProvider>
  )

const cardFor = async (name: string) =>
  (await screen.findByText(name)).closest("a") as HTMLAnchorElement

beforeEach(() => {
  mocks.getSquads.mockReset()
})

afterEach(cleanup)

describe("SquadsListPage cards", () => {
  it("shows each squad as a link with its meta, count and visibility", async () => {
    actAs(VIEW)
    mocks.getSquads.mockResolvedValue([
      squad(),
      squad({
        id: "sq-2",
        name: "Seniors",
        level: "senior",
        level_label: "Senior",
        age_group: "",
        members_count: 0,
        is_public: false,
        invite_enabled: false,
      }),
    ])
    renderPage()

    const u17 = await cardFor("U17 Boys")
    expect(u17.getAttribute("href")).toBe(`${BASE}/sq-1`)
    expect(within(u17).getByText("Youth · U17 · 2026–27")).toBeTruthy()
    expect(within(u17).getByText("12 players")).toBeTruthy()
    expect(within(u17).getByText("On profile")).toBeTruthy()
    expect(within(u17).getByText("Football")).toBeTruthy()
    expect(within(u17).queryByText("Link off")).toBeNull()

    const seniors = await cardFor("Seniors")
    expect(within(seniors).getByText("No players yet")).toBeTruthy()
    expect(within(seniors).getByText("Hidden from profile")).toBeTruthy()
    expect(within(seniors).getByText("Link off")).toBeTruthy()

    expect(screen.getByText("2 squads · 12 players")).toBeTruthy()
  })

  it("shows how many are waiting only to someone who can answer them", async () => {
    actAs(VIEW)
    mocks.getSquads.mockResolvedValue([squad({ pending_count: 3 })])
    renderPage()

    const card = await cardFor("U17 Boys")
    expect(within(card).queryByText("3 waiting")).toBeNull()
    expect(screen.queryByText(/waiting to join/)).toBeNull()
    cleanup()

    actAs(REVIEW)
    renderPage()
    const reviewed = await cardFor("U17 Boys")
    expect(within(reviewed).getByText("3 waiting")).toBeTruthy()
  })

  it("offers Share invite on an empty squad, for reviewers only", async () => {
    actAs(REVIEW)
    mocks.getSquads.mockResolvedValue([squad({ members_count: 0 })])
    renderPage()
    expect(within(await cardFor("U17 Boys")).getByText("Share invite")).toBeTruthy()
    cleanup()

    actAs(VIEW)
    renderPage()
    expect(within(await cardFor("U17 Boys")).queryByText("Share invite")).toBeNull()
  })

  it("asks a manager to add a photo, and nobody else", async () => {
    actAs(MANAGE)
    mocks.getSquads.mockResolvedValue([squad()])
    renderPage()
    expect(within(await cardFor("U17 Boys")).getByText("Add a squad photo")).toBeTruthy()
    cleanup()

    actAs(REVIEW)
    renderPage()
    expect(within(await cardFor("U17 Boys")).queryByText("Add a squad photo")).toBeNull()
  })
})

describe("SquadsListPage waiting banner", () => {
  it("names the one squad with requests and links to its Requests tab", async () => {
    actAs(REVIEW)
    mocks.getSquads.mockResolvedValue([squad({ pending_count: 2 }), squad({ id: "sq-2", name: "Seniors" })])
    renderPage()

    const title = await screen.findByText("2 players waiting to join")
    const banner = title.closest("a") as HTMLAnchorElement
    expect(banner.getAttribute("href")).toBe(`${BASE}/sq-1/requests`)
    expect(within(banner).getByText("U17 Boys · from your invite link")).toBeTruthy()
    expect(within(banner).getByText("Review")).toBeTruthy()
  })

  it("adds up several squads and goes to the first", async () => {
    actAs(REVIEW)
    mocks.getSquads.mockResolvedValue([
      squad({ id: "sq-1", name: "U17 Boys", pending_count: 0 }),
      squad({ id: "sq-2", name: "Seniors", pending_count: 1 }),
      squad({ id: "sq-3", name: "Thirds", pending_count: 4 }),
    ])
    renderPage()

    const banner = (await screen.findByText("5 players waiting to join")).closest("a") as HTMLAnchorElement
    expect(within(banner).getByText("Across 2 squads")).toBeTruthy()
    expect(banner.getAttribute("href")).toBe(`${BASE}/sq-2/requests`)
  })

  it("is not there when nobody is waiting", async () => {
    actAs(REVIEW)
    mocks.getSquads.mockResolvedValue([squad()])
    renderPage()
    await cardFor("U17 Boys")
    expect(screen.queryByText(/waiting to join/)).toBeNull()
  })
})

describe("SquadsListPage creating", () => {
  it("shows New only to a manager, and opens the sheet", async () => {
    actAs(REVIEW)
    mocks.getSquads.mockResolvedValue([squad()])
    renderPage()
    await cardFor("U17 Boys")
    expect(screen.queryByRole("button", { name: "New" })).toBeNull()
    cleanup()

    actAs(MANAGE)
    renderPage()
    await cardFor("U17 Boys")
    fireEvent.click(screen.getByRole("button", { name: "New" }))
    expect(screen.getByTestId("new-squad-sheet")).toBeTruthy()
  })

  it("empty, a manager gets one way to create the first squad", async () => {
    actAs(MANAGE)
    mocks.getSquads.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText("Create your first squad")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "New" })).toBeNull()
    expect(screen.queryByText(/squads ·/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "New squad" }))
    expect(screen.getByTestId("new-squad-sheet")).toBeTruthy()
  })

  it("empty, anyone else sees one quiet line", async () => {
    actAs(REVIEW)
    mocks.getSquads.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText("No squads yet.")).toBeTruthy()
    expect(screen.queryByText("Create your first squad")).toBeNull()
    expect(screen.queryByRole("button", { name: "New squad" })).toBeNull()
  })
})

describe("SquadsListPage states", () => {
  it("offers Try again when the list fails", async () => {
    actAs(VIEW)
    mocks.getSquads.mockRejectedValueOnce({ isAxiosError: true, response: { status: 500, data: {} } })
    mocks.getSquads.mockResolvedValueOnce([squad()])
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }))
    expect(await screen.findByText("U17 Boys")).toBeTruthy()
  })

  it("says so plainly when the person has no access", async () => {
    actAs([])
    mocks.getSquads.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { message: "No.", data: { code: "forbidden" } } },
    })
    renderPage()

    expect(await screen.findByText("You don't have access to this club's squads.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
  })
})
