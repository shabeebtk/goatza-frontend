// @vitest-environment jsdom
/**
 * One enquiry: the rows for a child and for an adult, the status radiogroup,
 * notes, and the one screen for an enquiry that isn't there.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { EnquiryDetail } from "../../types"
import EnquiryDetailPage from "./EnquiryDetailPage"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  toast: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/enquiries/enq-1",
}))
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("../../services/enquiries.api", async (original) => ({
  ...(await original<typeof import("../../services/enquiries.api")>()),
  getEnquiryApi: mocks.get,
  updateEnquiryApi: mocks.update,
}))

const ORG = { id: "org-1", name: "Thrissur Tigers", username: "thrissur_tigers", type: "academy", my_permissions: ["enquiries.manage"] }

const CHILD: EnquiryDetail = {
  id: "enq-1",
  status: "new",
  status_label: "New",
  for_whom: "child",
  player_name: "Aditya",
  player_age: 11,
  guardian_name: "Meera Nair",
  phone: "+919876543210",
  phone_is_whatsapp: true,
  email: "",
  program_id: "p1",
  program_name: "U12 Football Foundation",
  location_id: "l1",
  location_name: "Main Ground",
  best_time: "evening",
  best_time_label: "Evening",
  message: "He plays as a winger.\nCan he try out on Saturday?",
  notes: "",
  notes_updated_by: null,
  notes_updated_at: null,
  status_changed_by: null,
  status_changed_at: null,
  closed_at: null,
  created_at: new Date().toISOString(),
}

const SELF: EnquiryDetail = {
  ...CHILD,
  for_whom: "self",
  player_name: "Rahul K",
  player_age: 19,
  guardian_name: "",
  phone_is_whatsapp: false,
  email: "rahul@example.com",
  program_name: "",
  best_time: "",
  best_time_label: "",
  message: "",
}

const renderDetail = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
    >
      <EnquiryDetailPage orgId="org-1" enquiryId="enq-1" />
    </QueryClientProvider>
  )

const value = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent

beforeEach(() => {
  mocks.get.mockReset()
  mocks.update.mockReset()
  mocks.toast.mockReset()
  useAuthStore.setState({ organizations: [ORG] as never, currentOrganization: ORG as never })
})

afterEach(cleanup)

describe("A child's enquiry", () => {
  it("is about the child and addressed to the guardian, with WhatsApp", async () => {
    mocks.get.mockResolvedValue(CHILD)
    renderDetail()

    expect(await screen.findByRole("heading", { name: "Meera Nair" })).toBeTruthy()
    expect(value("For")).toBe("Aditya, 11")
    expect(value("Parent or guardian")).toBe("Meera Nair")
    expect(value("Phone")).toBe("+91 98765 43210 · WhatsApp")
    expect(value("Email")).toBe("Not given")
    expect(value("Program")).toBe("U12 Football Foundation")
    expect(value("Best time")).toBe("Evening")
    expect(value("Received")).toMatch(/^Today, /)

    expect(screen.getByRole("link", { name: "Call" }).getAttribute("href")).toBe("tel:+919876543210")
    expect(screen.getByRole("link", { name: "WhatsApp" })).toBeTruthy()
    expect(screen.getByText(/Hi Meera, this is Thrissur Tigers about your enquiry for U12 Football Foundation\./)).toBeTruthy()
    // Line breaks kept.
    expect(screen.getByText(CHILD.message, { normalizer: (text) => text })).toBeTruthy()
  })
})

describe("An adult's own enquiry", () => {
  it("is for themselves, with no guardian row and no WhatsApp", async () => {
    mocks.get.mockResolvedValue(SELF)
    renderDetail()

    expect(await screen.findByRole("heading", { name: "Rahul K" })).toBeTruthy()
    expect(value("For")).toBe("Themselves, 19")
    expect(screen.queryByText("Parent or guardian")).toBeNull()
    expect(value("Email")).toBe("rahul@example.com")
    expect(value("Program")).toBe("General enquiry")
    expect(value("Best time")).toBe("Any time")
    expect(screen.queryByRole("link", { name: "WhatsApp" })).toBeNull()
    expect(screen.queryByText("Their message")).toBeNull()
  })
})

describe("Status and notes", () => {
  it("saves a status at once from the radiogroup", async () => {
    mocks.get.mockResolvedValue(CHILD)
    mocks.update.mockResolvedValue({ ...CHILD, status: "contacted", status_label: "Contacted" })
    renderDetail()

    const group = await screen.findByRole("radiogroup", { name: "Status" })
    expect(screen.getByRole("radio", { name: "New" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByRole("radio", { name: "Contacted" }))

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("org-1", "enq-1", { status: "contacted" }))
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Status saved" })))
    expect(group).toBeTruthy()
  })

  it("moves the choice with the arrow keys", async () => {
    mocks.get.mockResolvedValue(CHILD)
    mocks.update.mockResolvedValue({ ...CHILD, status: "contacted" })
    renderDetail()

    const current = await screen.findByRole("radio", { name: "New" })
    fireEvent.keyDown(current, { key: "ArrowRight" })
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("org-1", "enq-1", { status: "contacted" }))
  })

  it("offers Save notes only once they changed, and sends them", async () => {
    mocks.get.mockResolvedValue(CHILD)
    mocks.update.mockResolvedValue({ ...CHILD, notes: "Trial on Saturday." })
    renderDetail()

    const notes = await screen.findByLabelText("Notes (only your team sees these)")
    expect(screen.queryByRole("button", { name: "Save notes" })).toBeNull()
    fireEvent.change(notes, { target: { value: "Trial on Saturday." } })
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }))

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("org-1", "enq-1", { notes: "Trial on Saturday." }))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save notes" })).toBeNull())
  })

  it("says who changed the status, and that closed ones are deleted after a year", async () => {
    mocks.get.mockResolvedValue({
      ...CHILD,
      status: "joined",
      status_label: "Joined",
      status_changed_by: "Sneha Pillai",
      status_changed_at: new Date().toISOString(),
    })
    renderDetail()

    expect(await screen.findByText(/^Marked joined by Sneha Pillai · /)).toBeTruthy()
    expect(screen.getByText("Closed enquiries are deleted after 12 months.")).toBeTruthy()
  })
})

describe("An enquiry that isn't there", () => {
  it("is one screen with the way back to the inbox", async () => {
    mocks.get.mockRejectedValue({ isAxiosError: true, response: { status: 404, data: {} } })
    renderDetail()

    expect(await screen.findByText("This enquiry isn't available any more.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Back to inbox" }).getAttribute("href")).toBe(
      "/organization/admin/org-1/enquiries"
    )
  })
})
