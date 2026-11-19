// @vitest-environment jsdom
/**
 * The inbox: the tab counts, Mark contacted (the card leaves New, Undo puts it
 * back), WhatsApp only for a WhatsApp number, and the empty tabs.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import { FRESH_ADMIN } from "@/features/orgPage/__fixtures__/pageAdmin"
import type { EnquiryCounts, EnquiryStatus, InboxItem } from "../../types"
import EnquiriesInboxPage from "./EnquiriesInboxPage"

const mocks = vi.hoisted(() => ({
  inbox: vi.fn(),
  update: vi.fn(),
  toast: vi.fn(),
  replace: vi.fn(),
  admin: null as unknown,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace, back: vi.fn() }),
  usePathname: () => "/organization/admin/org-1/enquiries",
}))
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({ useToast: () => ({ show: mocks.toast }) }))
vi.mock("@/shared/components/ui/Select/Select", () => ({ default: () => null }))
vi.mock("@/features/profile/services/publicProfile.api", () => ({ siteOrigin: () => "https://goatza.com" }))
vi.mock("@/features/organization/hooks/useOrganizations", async (original) => ({
  ...(await original<typeof import("@/features/organization/hooks/useOrganizations")>()),
  useOrgDetail: () => ({ data: { locations: [] } }),
}))
vi.mock("@/features/orgPage/services/orgPage.api", async (original) => ({
  ...(await original<typeof import("@/features/orgPage/services/orgPage.api")>()),
  getPageAdminApi: () => Promise.resolve(mocks.admin),
  getProgramsApi: () => Promise.resolve([]),
}))
vi.mock("../../services/enquiries.api", async (original) => ({
  ...(await original<typeof import("../../services/enquiries.api")>()),
  getInboxApi: mocks.inbox,
  updateEnquiryApi: mocks.update,
}))

const ORG = {
  id: "org-1",
  name: "Thrissur Tigers",
  username: "thrissur_tigers",
  type: "academy",
  my_permissions: ["page.manage", "enquiries.manage"],
}

const ITEM: InboxItem = {
  id: "enq-1",
  status: "new",
  for_whom: "child",
  player_name: "Aditya Nair",
  player_age: 11,
  guardian_name: "Meera Nair",
  phone: "+919876543210",
  phone_is_whatsapp: true,
  program_name: "U12 Football Foundation",
  location_name: "Main Ground",
  best_time: "evening",
  message: "",
  created_at: new Date().toISOString(),
}

const SELF: InboxItem = {
  ...ITEM,
  id: "enq-2",
  for_whom: "self",
  player_name: "Rahul K",
  player_age: 19,
  guardian_name: "",
  phone_is_whatsapp: false,
  program_name: "",
  location_name: "",
  message: "Do you have evening batches for adults?",
}

const COUNTS: EnquiryCounts = { new: 2, contacted: 4, joined: 0, not_interested: 1 }

/** The server: each status answers with its own rows; the counts are the same for all. */
let rows: Record<EnquiryStatus, InboxItem[]>

const renderInbox = (status: EnquiryStatus = "new") =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}
    >
      <EnquiriesInboxPage orgId="org-1" status={status} />
    </QueryClientProvider>
  )

beforeEach(() => {
  rows = { new: [ITEM, SELF], contacted: [], joined: [], not_interested: [] }
  mocks.admin = FRESH_ADMIN
  mocks.inbox.mockReset()
  mocks.inbox.mockImplementation(async (_org: string, { status }: { status: EnquiryStatus }) => ({
    items: rows[status],
    next_cursor: null,
    counts: COUNTS,
  }))
  mocks.update.mockReset()
  mocks.toast.mockReset()
  mocks.replace.mockReset()
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    }
  )
  useAuthStore.setState({ organizations: [ORG] as never, currentOrganization: ORG as never })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("The tabs", () => {
  it("show each status with its count, New in a filled bubble", async () => {
    renderInbox()

    const tabs = await screen.findAllByRole("tab")
    await waitFor(() => expect(within(tabs[0]).queryByText("2")).toBeTruthy())
    expect(tabs.map((tab) => tab.textContent)).toEqual(["New2", "Contacted4", "Joined0", "Not interested1"])
    expect(tabs[0].getAttribute("aria-selected")).toBe("true")
  })

  it("REPLACE the route when another is chosen", async () => {
    renderInbox()
    fireEvent.click(await screen.findByRole("tab", { name: /Contacted/ }))
    expect(mocks.replace).toHaveBeenCalledWith("/organization/admin/org-1/enquiries?status=contacted", {
      scroll: false,
    })
  })
})

describe("A card", () => {
  it("reads who, for whom, what and when, and links to the detail", async () => {
    renderInbox()

    const link = await screen.findByRole("link", { name: /^Meera Nair/ })
    expect(link.getAttribute("href")).toBe("/organization/admin/org-1/enquiries/enq-1")
    expect(link.textContent).toContain("for Aditya, 11")
    expect(screen.getByText("U12 Football Foundation · Main Ground")).toBeTruthy()
    expect(screen.getByText("Best time: Evening · On WhatsApp")).toBeTruthy()

    // Self: their own name and age, a general enquiry, and the message in quotes.
    expect(screen.getByRole("link", { name: /^Rahul K/ }).textContent).toContain("for themselves, 19")
    expect(screen.getByText("General enquiry")).toBeTruthy()
    expect(screen.getByText("“Do you have evening batches for adults?”")).toBeTruthy()
  })

  it("offers WhatsApp only for a WhatsApp number, with the greeting", async () => {
    renderInbox()
    await screen.findByRole("link", { name: /^Meera Nair/ })

    const whatsapp = screen.getByRole("link", { name: "WhatsApp Meera Nair" })
    expect(whatsapp.getAttribute("href")).toBe(
      `https://wa.me/919876543210?text=${encodeURIComponent(
        "Hi Meera, this is Thrissur Tigers about your enquiry for U12 Football Foundation."
      )}`
    )
    expect(screen.getByRole("link", { name: "Call Meera Nair" }).getAttribute("href")).toBe("tel:+919876543210")
    expect(screen.queryByRole("link", { name: "WhatsApp Rahul K" })).toBeNull()
    expect(screen.getByRole("link", { name: "Call Rahul K" })).toBeTruthy()
  })

  it("Mark contacted takes it off New at once and offers Undo", async () => {
    mocks.update.mockImplementation(async (_org: string, id: string, body: { status: EnquiryStatus }) => ({
      ...ITEM,
      id,
      status: body.status,
    }))
    renderInbox()
    await screen.findByRole("link", { name: /^Meera Nair/ })

    const card = screen.getByRole("link", { name: /^Meera Nair/ }).closest("li") as HTMLElement
    rows = { ...rows, new: [SELF], contacted: [{ ...ITEM, status: "contacted" }] }
    fireEvent.click(within(card).getByRole("button", { name: "Mark contacted" }))

    await waitFor(() => expect(screen.queryByRole("link", { name: /^Meera Nair/ })).toBeNull())
    expect(mocks.update).toHaveBeenCalledWith("org-1", "enq-1", { status: "contacted" })

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Marked contacted", action: expect.objectContaining({ label: "Undo" }) })
      )
    )
    const undo = mocks.toast.mock.calls.at(-1)![0].action.onClick as () => void
    rows = { ...rows, new: [ITEM, SELF], contacted: [] }
    undo()
    await waitFor(() => expect(mocks.update).toHaveBeenLastCalledWith("org-1", "enq-1", { status: "new" }))
    expect(await screen.findByRole("link", { name: /^Meera Nair/ })).toBeTruthy()
  })
})

describe("Empty tabs and the form-off notice", () => {
  it("New: says so and offers to share the page", async () => {
    rows = { new: [], contacted: [], joined: [], not_interested: [] }
    renderInbox()

    expect(await screen.findByText("No new enquiries. Share your page to get more.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy()
  })

  it("the other tabs: Nothing here yet", async () => {
    rows = { new: [], contacted: [], joined: [], not_interested: [] }
    renderInbox("joined")

    expect(await screen.findByText("Nothing here yet.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull()
  })

  it("warns when the form is off, with the way to turn it on for an editor", async () => {
    mocks.admin = {
      ...FRESH_ADMIN,
      settings: { ...FRESH_ADMIN.settings, contact: { ...FRESH_ADMIN.settings.contact, enquiry_form_enabled: false } },
    }
    renderInbox()

    expect(await screen.findByText("Your enquiry form is off. Nobody new can send one.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Turn it on" }).getAttribute("href")).toBe(
      "/organization/admin/org-1/page/contact"
    )
  })
})

describe("Who sees the inbox", () => {
  it("nobody without enquiries.manage", () => {
    const viewer = { ...ORG, my_permissions: ["page.manage"] }
    useAuthStore.setState({ organizations: [viewer] as never, currentOrganization: viewer as never })
    renderInbox()

    expect(screen.getByText("Only owners and staff can handle enquiries.")).toBeTruthy()
    expect(mocks.inbox).not.toHaveBeenCalled()
  })
})
