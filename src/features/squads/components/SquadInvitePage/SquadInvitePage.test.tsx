// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { SquadInviteMe, SquadInviteView } from "../../types"
import SquadInvitePage from "./SquadInvitePage"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  fetchInvite: vi.fn(),
  toast: vi.fn(),
}))

vi.mock("@/core/api/axios", () => ({
  default: { get: mocks.get, post: mocks.post, patch: vi.fn(), delete: vi.fn() },
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/squad-invite/x",
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
vi.mock("@iconify/react", () => ({
  Icon: ({ "aria-label": label }: { "aria-label"?: string }) =>
    label ? <span aria-label={label} /> : <span />,
}))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("../../services/publicSquadInvite.api", async (original) => ({
  ...(await original<typeof import("../../services/publicSquadInvite.api")>()),
  fetchSquadInvite: mocks.fetchInvite,
}))

const TOKEN = "q7-Xk_9LmZ2vTn4R8sWb"
const PATH = `/squad-invite/${TOKEN}`

const view = (me: SquadInviteMe | null): SquadInviteView => ({
  squad: {
    id: "sq-1",
    name: "U17 Boys",
    sport: { id: "s1", name: "Football", icon_name: "mdi:soccer" },
    level: "youth",
    level_label: "Youth",
    age_group: "U17",
    season: "2026–27",
    photo_url: "",
    members_count: 18,
  },
  organization: {
    id: "org-1",
    name: "Dream FC",
    username: "dreamfc",
    logo: "",
    type: "club",
    is_verified: true,
  },
  head_coach: { name: "Ravi Menon" },
  me,
})

const me = (state: SquadInviteMe["state"], extra: Partial<SquadInviteMe> = {}): SquadInviteMe => ({
  state,
  member_id: state === "none" ? null : "mem-1",
  can_join: state === "none",
  reason: null,
  ...extra,
})

/** What axios resolves with: the server's envelope. */
const answer = (data: unknown) => ({ data: { data } })

const notFound = () =>
  Object.assign(new Error("404"), {
    isAxiosError: true,
    response: { status: 404, data: { message: "Not found", data: { code: "not_found" } } },
  })

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SquadInvitePage token={TOKEN} />
    </QueryClientProvider>
  )

const signedIn = () =>
  useAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    user: { id: "u1", username: "asha" } as never,
  })

/** The signed-in read answers `GET /squads/invite/<token>` with this view. */
const readAs = (value: SquadInviteView) =>
  mocks.get.mockImplementation((url: string) => {
    if (url.startsWith("/squads/invite/")) return Promise.resolve(answer(value))
    if (url === "/squads/mine") return Promise.resolve(answer({ items: [] }))
    return Promise.resolve(answer({}))
  })

const confirmIn = async (title: string, button: string) => {
  const dialog = (await screen.findByText(title)).closest('[role="alertdialog"]') as HTMLElement
  fireEvent.click(within(dialog).getByRole("button", { name: button }))
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.post.mockResolvedValue(answer({}))
  useAuthStore.setState({
    isAuthenticated: false,
    isLoading: false,
    user: null,
    actorType: "user",
    actorId: null,
    organizations: [],
    currentOrganization: null,
  })
})

afterEach(cleanup)

describe("SquadInvitePage for someone signed out", () => {
  it("reads with no session and offers sign-up and log-in back to this page", async () => {
    mocks.fetchInvite.mockResolvedValue(view(null))
    renderPage()

    expect(await screen.findByText("U17 Boys")).toBeTruthy()
    expect(mocks.fetchInvite).toHaveBeenCalledWith(TOKEN)
    expect(mocks.get).not.toHaveBeenCalled()

    expect(screen.getByText("Dream FC")).toBeTruthy()
    expect(screen.getByText("Head coach Ravi Menon")).toBeTruthy()
    expect(screen.getByText("18 players")).toBeTruthy()

    const signUp = screen.getByText("Sign up to join").closest("a") as HTMLAnchorElement
    const params = new URLSearchParams(signUp.getAttribute("href")!.split("?")[1])
    expect(params.get("mode")).toBe("signup")
    expect(params.get("next")).toBe(PATH)

    const logIn = screen.getByText("I have an account").closest("a") as HTMLAnchorElement
    const loginParams = new URLSearchParams(logIn.getAttribute("href")!.split("?")[1])
    expect(loginParams.get("mode")).toBeNull()
    expect(loginParams.get("next")).toBe(PATH)
  })

  it("shows the one invalid screen for a link that does not resolve", async () => {
    mocks.fetchInvite.mockResolvedValue(null)
    renderPage()

    expect(
      await screen.findByText("This invite link isn't valid any more. Ask the club for a new one.")
    ).toBeTruthy()
    expect(screen.queryByText("U17 Boys")).toBeNull()
    expect(screen.getByText("Go to Goatza").closest("a")?.getAttribute("href")).toBe("/")
  })
})

describe("SquadInvitePage for someone signed in", () => {
  beforeEach(signedIn)

  it("reads as the person, whoever is the active actor", async () => {
    useAuthStore.setState({ actorType: "organization", actorId: "org-9" })
    readAs(view(me("none")))
    renderPage()

    await screen.findByText("U17 Boys")
    const [url, config] = mocks.get.mock.calls.find(([path]) =>
      String(path).startsWith("/squads/invite/")
    )!
    expect(url).toBe(`/squads/invite/${TOKEN}`)
    expect(config).toEqual(expect.objectContaining({ actor: { type: "user" } }))
    expect(mocks.fetchInvite).not.toHaveBeenCalled()
  })

  it("asks to join, then shows Request sent", async () => {
    readAs(view(me("none")))
    mocks.post.mockResolvedValue(answer({ state: "pending", member_id: "mem-1" }))
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Ask to join" }))

    expect(await screen.findByText("Request sent")).toBeTruthy()
    expect(screen.getByText("We'll let you know when Dream FC approves you.")).toBeTruthy()
    const [url, body, config] = mocks.post.mock.calls[0]
    expect(url).toBe(`/squads/invite/${TOKEN}/join`)
    expect(body).toBeNull()
    expect(config).toEqual(expect.objectContaining({ actor: { type: "user" } }))
    expect(screen.queryByRole("button", { name: "Ask to join" })).toBeNull()
  })

  it("lets a pending request be withdrawn, after asking", async () => {
    readAs(view(me("pending")))
    renderPage()

    expect(await screen.findByText("Request sent")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Withdraw request" }))
    expect(mocks.post).not.toHaveBeenCalled()

    await confirmIn("Withdraw your request?", "Withdraw")

    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        "/squads/mine/mem-1/withdraw",
        null,
        expect.objectContaining({ actor: { type: "user" } })
      )
    )
    expect(await screen.findByRole("button", { name: "Ask to join" })).toBeTruthy()
  })

  it("accepts an open invite and says so", async () => {
    readAs(view(me("invited", { can_join: true })))
    mocks.post.mockResolvedValue(answer({ id: "mem-1", status: "active" }))
    renderPage()

    expect(await screen.findByText("Dream FC invited you")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Accept invite" }))

    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        "/squads/mine/mem-1/accept",
        null,
        expect.objectContaining({ actor: { type: "user" } })
      )
    )
    expect(await screen.findByText("You're in this squad")).toBeTruthy()
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "You're in U17 Boys", variant: "success" })
    )
  })

  it("declines an open invite", async () => {
    readAs(view(me("invited", { can_join: true })))
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Decline" }))

    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        "/squads/mine/mem-1/decline",
        null,
        expect.objectContaining({ actor: { type: "user" } })
      )
    )
    expect(await screen.findByText("Invite declined.")).toBeTruthy()
  })

  it("sends someone already in to the squad's page", async () => {
    readAs(view(me("active")))
    renderPage()

    expect(await screen.findByText("You're in this squad")).toBeTruthy()
    expect(screen.getByText("View squad").closest("a")?.getAttribute("href")).toBe(
      "/organization/profile/dreamfc/squads/sq-1"
    )
  })

  it("tells a coach or scout that only players can join, with no button", async () => {
    readAs(view(me("none", { can_join: false, reason: "not_a_player" })))
    renderPage()

    expect(await screen.findByText("Only player accounts can join squads.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Ask to join" })).toBeNull()
    expect(screen.queryByText("Sign up to join")).toBeNull()
  })

  it("shows the invalid screen for a 404", async () => {
    mocks.get.mockRejectedValue(notFound())
    renderPage()

    expect(
      await screen.findByText("This invite link isn't valid any more. Ask the club for a new one.")
    ).toBeTruthy()
    expect(screen.getByText("Go to Goatza").closest("a")?.getAttribute("href")).toBe("/home")
  })

  it("turns a join refused as closed into the invalid screen", async () => {
    readAs(view(me("none")))
    mocks.post.mockRejectedValue(
      Object.assign(new Error("400"), {
        isAxiosError: true,
        response: { status: 400, data: { message: "Closed", data: { code: "invite_closed" } } },
      })
    )
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Ask to join" }))

    expect(
      await screen.findByText("This invite link isn't valid any more. Ask the club for a new one.")
    ).toBeTruthy()
  })
})
