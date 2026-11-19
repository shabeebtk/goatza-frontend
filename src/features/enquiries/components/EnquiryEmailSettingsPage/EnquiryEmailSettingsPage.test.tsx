// @vitest-environment jsdom
/**
 * Settings → Notifications: only the orgs whose enquiries this person handles,
 * every call made as the PERSON, and the emails' ?org= link ringing its row.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import EnquiryEmailSettingsPage from "./EnquiryEmailSettingsPage"
import styles from "./EnquiryEmailSettingsPage.module.css"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  toast: vi.fn(),
}))

vi.mock("@/core/api/axios", () => ({ default: { get: mocks.get, patch: mocks.patch } }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/settings/notifications",
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))

const HANDLES = { id: "org-1", name: "Thrissur Tigers", username: "tigers", type: "academy", logo: "", my_permissions: ["enquiries.manage"] }
const ALSO = { id: "org-2", name: "Kochi Kickers", username: "kickers", type: "club", logo: "", my_permissions: ["page.manage", "enquiries.manage"] }
const NOT = { id: "org-3", name: "Malabar FC", username: "malabar", type: "club", logo: "", my_permissions: ["members.view"] }

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
    >
      <EnquiryEmailSettingsPage />
    </QueryClientProvider>
  )

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  mocks.get.mockReset()
  mocks.patch.mockReset()
  mocks.toast.mockReset()
  mocks.get.mockImplementation(async () => ({ data: { data: { email: true } } }))
  useAuthStore.setState({
    organizations: [HANDLES, ALSO, NOT] as never,
    actorType: "organization",
    actorId: "org-1",
    currentOrganization: HANDLES as never,
  })
  window.history.replaceState({}, "", "/settings/notifications")
})

afterEach(cleanup)

describe("EnquiryEmailSettingsPage", () => {
  it("lists only the orgs whose enquiries this person handles, each read as the person", async () => {
    renderPage()

    expect(screen.getByText("Thrissur Tigers")).toBeTruthy()
    expect(screen.getByText("Kochi Kickers")).toBeTruthy()
    expect(screen.queryByText("Malabar FC")).toBeNull()

    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2))
    expect(mocks.get).toHaveBeenCalledWith("/enquiries/alerts", { actor: { type: "user" }, params: { org_id: "org-1" } })
    expect(mocks.get).toHaveBeenCalledWith("/enquiries/alerts", { actor: { type: "user" }, params: { org_id: "org-2" } })
  })

  it("turns an org's emails off as the person, at once", async () => {
    mocks.patch.mockResolvedValue({ data: { data: { email: false } } })
    renderPage()

    const toggle = await screen.findByRole("switch", { name: "Email me about enquiries to Kochi Kickers" })
    expect(toggle.getAttribute("aria-checked")).toBe("true")
    fireEvent.click(toggle)

    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"))
    expect(mocks.patch).toHaveBeenCalledWith(
      "/enquiries/alerts",
      { org_id: "org-2", email: false },
      { actor: { type: "user" } }
    )
  })

  it("puts the switch back and says so when the server refuses", async () => {
    mocks.patch.mockRejectedValue({ isAxiosError: true, response: { status: 404, data: { message: "Not found." } } })
    renderPage()

    const toggle = await screen.findByRole("switch", { name: "Email me about enquiries to Thrissur Tigers" })
    fireEvent.click(toggle)

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" })))
    expect(toggle.getAttribute("aria-checked")).toBe("true")
  })

  it("rings the row the email's ?org= link points at", async () => {
    window.history.replaceState({}, "", "/settings/notifications?org=org-2")
    renderPage()

    const row = document.getElementById("enquiry-emails-org-2") as HTMLElement
    await waitFor(() => expect(row.className).toContain(styles.highlighted))
    expect(row.scrollIntoView).toHaveBeenCalled()
    expect(document.getElementById("enquiry-emails-org-1")?.className).not.toContain(styles.highlighted)
  })

  it("says so when the person handles no page's enquiries", () => {
    useAuthStore.setState({ organizations: [NOT] as never })
    renderPage()

    expect(screen.getByText("You don't handle enquiries for any page.")).toBeTruthy()
  })
})
