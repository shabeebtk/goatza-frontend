// @vitest-environment jsdom
/**
 * How people reach the club: a number field appears with its option, the
 * server's field error lands under it, turning the form off asks first, and
 * Save sends only what changed.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import { FRESH_ADMIN, SETTINGS } from "../../__fixtures__/pageAdmin"
import ContactSettingsPage from "./ContactSettingsPage"

const mocks = vi.hoisted(() => ({
  updateContact: vi.fn(),
  toast: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/page/contact",
}))
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("../../services/orgPage.api", async (original) => ({
  ...(await original<typeof import("../../services/orgPage.api")>()),
  getPageAdminApi: () => Promise.resolve(FRESH_ADMIN),
  updateContactApi: mocks.updateContact,
}))

const ORG = {
  id: "org-1",
  name: "Bright Academy",
  username: "brightacademy",
  type: "academy",
  my_permissions: ["page.manage"],
}

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
    >
      <ContactSettingsPage orgId="org-1" />
    </QueryClientProvider>
  )

beforeEach(() => {
  // jsdom draws nothing, so it has no scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn()
  mocks.updateContact.mockReset()
  mocks.toast.mockReset()
  useAuthStore.setState({ organizations: [ORG] as never, currentOrganization: ORG as never })
})

afterEach(cleanup)

describe("ContactSettingsPage", () => {
  it("shows the WhatsApp number field only once WhatsApp is on", async () => {
    renderPage()
    const whatsapp = await screen.findByRole("switch", { name: "WhatsApp" })

    expect(screen.queryByLabelText("WhatsApp number")).toBeNull()
    fireEvent.click(whatsapp)

    const field = screen.getByLabelText("WhatsApp number") as HTMLInputElement
    expect(field.getAttribute("inputmode")).toBe("tel")
    expect(screen.getByText("Anyone who opens your page can see this number.")).toBeTruthy()
  })

  it("sends only what changed, the number exactly as typed", async () => {
    mocks.updateContact.mockResolvedValue({
      ...SETTINGS,
      contact: { ...SETTINGS.contact, whatsapp_enabled: true, whatsapp_number: "+919876543210" },
    })
    renderPage()

    fireEvent.click(await screen.findByRole("switch", { name: "WhatsApp" }))
    fireEvent.change(screen.getByLabelText("WhatsApp number"), { target: { value: "098765 43210" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() =>
      expect(mocks.updateContact).toHaveBeenCalledWith("org-1", {
        whatsapp_enabled: true,
        whatsapp_number: "098765 43210",
      })
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Contact options saved" }))
    )
    // What the server stored now reads formatted.
    expect((screen.getByLabelText("WhatsApp number") as HTMLInputElement).value).toBe("+91 98765 43210")
  })

  it("puts the server's field error under its field", async () => {
    mocks.updateContact.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          message: "Enter a valid phone number.",
          data: { code: "invalid", errors: { whatsapp_number: "Enter a valid phone number." } },
        },
      },
    })
    renderPage()

    fireEvent.click(await screen.findByRole("switch", { name: "WhatsApp" }))
    fireEvent.change(screen.getByLabelText("WhatsApp number"), { target: { value: "12345" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    const field = screen.getByLabelText("WhatsApp number")
    await waitFor(() => expect(field.getAttribute("aria-invalid")).toBe("true"))
    const errorId = field.getAttribute("aria-describedby")?.split(" ")[0] ?? ""
    expect(document.getElementById(errorId)?.textContent).toBe("Enter a valid phone number.")
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it("refuses WhatsApp on with no number before anything is sent", async () => {
    renderPage()
    fireEvent.click(await screen.findByRole("switch", { name: "WhatsApp" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByText("Add your WhatsApp number to turn this on.")).toBeTruthy()
    expect(mocks.updateContact).not.toHaveBeenCalled()
  })

  it("asks before turning the enquiry form off, and keeps it on when told to", async () => {
    renderPage()
    const form = await screen.findByRole("switch", { name: "Enquiry form" })
    expect(form.getAttribute("aria-checked")).toBe("true")

    fireEvent.click(form)
    expect(screen.getByText("Turn off the enquiry form?")).toBeTruthy()
    expect(screen.getByText("Nobody new can send you an enquiry. Your inbox stays.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Keep it on" }))
    await waitFor(() => expect(screen.queryByText("Turn off the enquiry form?")).toBeNull())
    expect(form.getAttribute("aria-checked")).toBe("true")

    fireEvent.click(form)
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }))
    await waitFor(() => expect(form.getAttribute("aria-checked")).toBe("false"))
  })
})
