// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import OrgInvitePage from "./OrgInvitePage"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  fetchInvite: vi.fn(),
  accept: vi.fn(),
  decline: vi.fn(),
  getOrgs: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))
vi.mock("@/shared/components/ui/BackHeader/BackHeader", () => ({ default: () => null }))
vi.mock("@/shared/components/ui/Select/Select", () => ({ default: () => null }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("@/features/organization/services/organization.api", () => ({
  getOrganizationsApi: mocks.getOrgs,
}))
vi.mock("../../services/publicOrgInvite.api", () => ({ fetchOrgInvite: mocks.fetchInvite }))
vi.mock("../../services/orgMembers.api", async (original) => ({
  ...(await original<typeof import("../../services/orgMembers.api")>()),
  acceptInviteByTokenApi: mocks.accept,
  declineInviteByTokenApi: mocks.decline,
}))

const TOKEN = "tok_en-123"

const INVITE = {
  organization: { name: "Dream FC", username: "dreamfc", logo: "" },
  role: "coach",
  invited_by_name: "Olive Owner",
  email_masked: "j*****n@gmail.com",
  status: "pending",
}

const ORG = { id: "org-1", name: "Dream FC", username: "dreamfc" }

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OrgInvitePage token={TOKEN} />
    </QueryClientProvider>
  )

const signedIn = () =>
  useAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    user: { id: "u1", username: "me" } as never,
  })

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.fetchInvite.mockResolvedValue(INVITE)
  mocks.getOrgs.mockResolvedValue([ORG])
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

describe("OrgInvitePage", () => {
  it("names the org, the inviter and the role", async () => {
    renderPage()

    expect(
      await screen.findByText("Olive Owner invited you to join Dream FC on Goatza as Coach")
    ).toBeTruthy()
    expect(mocks.fetchInvite).toHaveBeenCalledWith(TOKEN)
  })

  it("sends someone logged out to sign up or log in, and back here", async () => {
    renderPage()

    const signUp = (await screen.findByRole("link", { name: "Sign up" })).getAttribute("href")
    const logIn = screen.getByRole("link", { name: "Log in" }).getAttribute("href")

    const next = encodeURIComponent(`/org-invite/${TOKEN}`)
    expect(signUp).toBe(`/auth?mode=signup&next=${next}`)
    expect(logIn).toBe(`/auth?next=${next}`)
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull()
  })

  it("offers nothing to answer while the session is still resolving", async () => {
    useAuthStore.setState({ isLoading: true })
    renderPage()

    await screen.findByText(/invited you to join/)

    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull()
  })

  it("accepts for someone logged in, then offers the switch", async () => {
    signedIn()
    mocks.accept.mockResolvedValue(ORG)
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Accept" }))

    expect(await screen.findByText("You joined Dream FC")).toBeTruthy()
    expect(mocks.accept).toHaveBeenCalledWith(TOKEN)
    expect(useAuthStore.getState().organizations.map((org) => org.id)).toEqual(["org-1"])
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "You joined Dream FC" })
    )

    fireEvent.click(screen.getByRole("button", { name: "Switch to Dream FC" }))

    expect(useAuthStore.getState().actorId).toBe("org-1")
    expect(mocks.push).toHaveBeenCalledWith("/organization/admin/org-1/dashboard")
  })

  it("declines", async () => {
    signedIn()
    mocks.decline.mockResolvedValue(undefined)
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Decline" }))

    expect(await screen.findByText("Invite declined")).toBeTruthy()
    expect(mocks.decline).toHaveBeenCalledWith(TOKEN)
  })

  it("tells the wrong account where the invite went", async () => {
    signedIn()
    mocks.accept.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { data: { code: "email_mismatch" } } },
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Accept" }))

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This invite was sent to j*****n@gmail.com. Log in with that email to accept."
    )
    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy()
  })

  it("has one screen and one sentence for a link that doesn't resolve", async () => {
    mocks.fetchInvite.mockResolvedValue(null)
    renderPage()

    expect(await screen.findByText("This invite isn't available any more.")).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("lands on the same screen when it goes away between loading and answering", async () => {
    signedIn()
    mocks.accept.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { data: { code: "not_found" } } },
    })
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Accept" }))

    expect(await screen.findByText("This invite isn't available any more.")).toBeTruthy()
  })

  it("offers a retry when the request itself failed", async () => {
    mocks.fetchInvite.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(INVITE)
    renderPage()

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }))

    await waitFor(() => expect(mocks.fetchInvite).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/invited you to join/)).toBeTruthy()
  })
})
