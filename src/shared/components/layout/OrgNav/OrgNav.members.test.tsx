// @vitest-environment jsdom
/**
 * Members is the org's own people now, and the followers page it used to open is
 * Network. Both surfaces carry both, and Network living under /profile must not
 * light up Org profile with it.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import type { MoreMenuRow } from "@/shared/components/layout/NavMoreMenu/NavMoreMenu"
import type { NavSheetGroup } from "@/shared/components/layout/MobileNavSheet/MobileNavSheet"
import OrgNav from "./OrgNav"

const mocks = vi.hoisted(() => ({
  pathname: "/organization/admin/org-1/dashboard",
  moreRows: [] as MoreMenuRow[],
  sections: [] as NavSheetGroup[],
  sheetProps: {} as Record<string, unknown>,
  newEnquiries: 0,
  enquiryCountEnabled: [] as boolean[],
}))

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: ({ icon }: { icon: string }) => <span data-icon={icon} /> }))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({ default: () => <span /> }))
vi.mock("@/features/auth/hooks/useLogout", () => ({
  LOGOUT_CONFIRM: {},
  useLogout: () => vi.fn(),
}))
vi.mock("@/features/Notifications/hooks/useNotificationQueries", () => ({
  useUnreadCount: () => ({ data: { count: 0 } }),
}))
vi.mock("@/features/messages/hooks/useConversationQueries", () => ({
  useConversationsUnreadSummary: () => ({ data: { total: 0 } }),
}))
// The unread count, as the hook would answer it; it is only asked with enquiries.manage.
vi.mock("@/features/enquiries/hooks/useEnquiries", () => ({
  useEnquiryUnreadCount: (_orgId: string, { enabled = true }: { enabled?: boolean } = {}) => {
    mocks.enquiryCountEnabled.push(enabled)
    return { data: enabled ? { new: mocks.newEnquiries } : undefined }
  },
}))
vi.mock("@/shared/components/layout/AccountSwitcher/AccountSwitcher", () => ({
  default: () => null,
}))
vi.mock("@/shared/components/layout/CreateMenu/CreateMenu", () => ({ default: () => null }))
vi.mock("@/features/posts/components/CreatePostModal/CreatePostModal", () => ({
  default: () => null,
}))
vi.mock(
  "@/features/recruitments/components/CreateRecruitmentModal/CreateRecruitmentTrigger",
  () => ({ default: () => null })
)
vi.mock("@/shared/components/layout/NavMoreMenu/NavMoreMenu", () => ({
  default: ({ rows }: { rows: MoreMenuRow[] }) => {
    mocks.moreRows = rows
    return null
  },
}))
vi.mock("@/shared/components/layout/MobileNavSheet/MobileNavSheet", () => ({
  default: (props: { sections: NavSheetGroup[] }) => {
    mocks.sections = props.sections
    mocks.sheetProps = props
    return null
  },
}))

const BASE = "/organization/admin/org-1"
const NETWORK = `${BASE}/profile/org/club/network`

const renderAt = (pathname: string) => {
  mocks.pathname = pathname
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <OrgNav orgId="org-1" />
    </QueryClientProvider>
  )
}

const moreRow = (id: string) => mocks.moreRows.find((row) => row.id === id) as MoreMenuRow & {
  href: string
  active?: boolean
  icon: string
  disabled?: boolean
}

const sheetTile = (id: string) =>
  mocks.sections.flatMap((section) => section.items).find((item) => item.id === id)

const ORG = { id: "org-1", username: "club", name: "Club", my_role: "coach" }

beforeEach(() => {
  useAuthStore.setState({
    user: { id: "u1", username: "owner" } as never,
    actorType: "organization",
    actorId: "org-1",
    organizations: [ORG] as never,
    currentOrganization: ORG as never,
  })
})

afterEach(cleanup)

describe("The desktop More menu", () => {
  it("has Members for the people and Network for the followers", () => {
    renderAt(`${BASE}/dashboard`)

    expect(moreRow("members").label).toBe("Members")
    expect(moreRow("members").href).toBe(`${BASE}/members`)
    expect(moreRow("members").icon).toBe("mdi:account-group-outline")

    expect(moreRow("network").label).toBe("Network")
    expect(moreRow("network").href).toBe(NETWORK)
    expect(moreRow("network").icon).toBe("mdi:account-network-outline")
  })

  it("lights up Members on the members page and nothing else", () => {
    renderAt(`${BASE}/members`)

    expect(moreRow("members").active).toBe(true)
    expect(moreRow("network").active).toBe(false)
    expect(moreRow("org_profile").active).toBe(false)
  })

  it("lights up Network and not Org profile on the network page", () => {
    renderAt(NETWORK)

    expect(moreRow("network").active).toBe(true)
    expect(moreRow("org_profile").active).toBe(false)
    expect(moreRow("members").active).toBe(false)
  })

  it("lights up Org profile on the profile page", () => {
    renderAt(`${BASE}/profile`)

    expect(moreRow("org_profile").active).toBe(true)
    expect(moreRow("network").active).toBe(false)
  })

  it("does not take a different route with the same start for the members page", () => {
    renderAt(`${BASE}/membership`)

    expect(moreRow("members").active).toBe(false)
  })

  it("dims Network until the org's handle is known", () => {
    useAuthStore.setState({
      organizations: [{ ...ORG, username: "" }] as never,
      currentOrganization: { ...ORG, username: "" } as never,
    })
    renderAt(`${BASE}/dashboard`)

    expect(moreRow("network").disabled).toBe(true)
    expect(moreRow("members").disabled).toBeFalsy()
  })
})

describe("The mobile dock's sheet", () => {
  it("has both tiles, each going to its own page", () => {
    renderAt(`${BASE}/dashboard`)

    expect(sheetTile("members")).toMatchObject({
      label: "Members",
      href: `${BASE}/members`,
      icon: "mdi:account-group-outline",
      iconActive: "mdi:account-group",
    })
    expect(sheetTile("network")).toMatchObject({
      label: "Network",
      href: NETWORK,
      icon: "mdi:account-network-outline",
    })
  })
})

describe("The role beside the org's name", () => {
  it("says what this person is, and never Admin", () => {
    const { container } = renderAt(`${BASE}/dashboard`)

    expect(container.textContent).toContain("Coach")
    expect(container.textContent).not.toContain("Admin")
    expect((mocks.sheetProps.account as { roleLabel: string }).roleLabel).toBe(
      "Coach · Switch account"
    )
  })
})

describe("Your page", () => {
  const EDITOR = { ...ORG, my_permissions: ["members.view", "page.manage"] }

  const asEditor = () =>
    useAuthStore.setState({
      organizations: [EDITOR] as never,
      currentOrganization: EDITOR as never,
    })

  it("comes right after Dashboard in the sheet's Manage group, for page.manage", () => {
    asEditor()
    renderAt(`${BASE}/dashboard`)

    const manage = mocks.sections.find((section) => section.id === "manage")!
    expect(manage.items.map((item) => item.id).slice(0, 3)).toEqual(["dashboard", "page", "feed"])
    expect(sheetTile("page")).toMatchObject({
      label: "Your page",
      href: `${BASE}/page`,
      icon: "mdi:card-account-details-outline",
      iconActive: "mdi:card-account-details",
    })
  })

  it("is the first row of the More menu, for page.manage", () => {
    asEditor()
    renderAt(`${BASE}/dashboard`)

    expect(mocks.moreRows[0].id).toBe("page")
    expect(moreRow("page")).toMatchObject({
      label: "Your page",
      href: `${BASE}/page`,
      icon: "mdi:card-account-details-outline",
      active: false,
    })
  })

  it("is lit, and filled, on the hub and every editor under it", () => {
    asEditor()
    for (const path of [`${BASE}/page`, `${BASE}/page/contact`, `${BASE}/page/about`]) {
      cleanup()
      renderAt(path)
      expect(moreRow("page").active).toBe(true)
      expect(moreRow("page").icon).toBe("mdi:card-account-details")
    }
  })

  it("is not lit by a different route with the same start", () => {
    asEditor()
    renderAt(`${BASE}/pages`)

    expect(moreRow("page").active).toBe(false)
  })

  it("is absent without page.manage, whatever the role", () => {
    useAuthStore.setState({
      organizations: [{ ...ORG, my_role: "owner", my_permissions: ["members.view"] }] as never,
      currentOrganization: { ...ORG, my_role: "owner", my_permissions: ["members.view"] } as never,
    })
    renderAt(`${BASE}/dashboard`)

    expect(moreRow("page")).toBeUndefined()
    expect(sheetTile("page")).toBeUndefined()
  })
})

describe("Enquiries", () => {
  const HANDLER = { ...ORG, my_permissions: ["members.view", "page.manage", "enquiries.manage"] }

  const asHandler = () =>
    useAuthStore.setState({
      organizations: [HANDLER] as never,
      currentOrganization: HANDLER as never,
    })

  beforeEach(() => {
    mocks.newEnquiries = 0
    mocks.enquiryCountEnabled = []
  })

  it("comes right after Your page in the sheet and the More menu, with the new count", () => {
    asHandler()
    mocks.newEnquiries = 3
    renderAt(`${BASE}/dashboard`)

    const manage = mocks.sections.find((section) => section.id === "manage")!
    expect(manage.items.map((item) => item.id).slice(0, 4)).toEqual(["dashboard", "page", "enquiries", "feed"])
    expect(sheetTile("enquiries")).toMatchObject({
      label: "Enquiries",
      href: `${BASE}/enquiries`,
      icon: "mdi:inbox-arrow-down-outline",
      iconActive: "mdi:inbox-arrow-down",
      badge: 3,
    })
    expect(mocks.moreRows.map((row) => row.id).slice(0, 2)).toEqual(["page", "enquiries"])
    expect((moreRow("enquiries") as MoreMenuRow & { badge?: number }).badge).toBe(3)
  })

  it("puts a dot on the desktop More button only while there are new ones", () => {
    asHandler()
    mocks.newEnquiries = 2
    const { getByTestId, getByRole } = renderAt(`${BASE}/dashboard`)
    expect(getByTestId("more-dot")).toBeTruthy()
    expect(getByRole("button", { name: "More, new enquiries" })).toBeTruthy()

    cleanup()
    mocks.newEnquiries = 0
    const second = renderAt(`${BASE}/dashboard`)
    expect(second.queryByTestId("more-dot")).toBeNull()
  })

  it("is lit, and filled, on the inbox and an enquiry", () => {
    asHandler()
    renderAt(`${BASE}/enquiries/enq-1`)

    expect(moreRow("enquiries").active).toBe(true)
    expect(moreRow("enquiries").icon).toBe("mdi:inbox-arrow-down")
    expect(moreRow("page").active).toBe(false)
  })

  const mobileBar = () => within(screen.getByRole("banner", { name: "Organization mobile header" }))

  it("has an icon in the phone's top bar, before the bell, with the new count", () => {
    asHandler()
    mocks.newEnquiries = 12
    renderAt(`${BASE}/dashboard`)

    const bar = mobileBar()
    const links = bar.getAllByRole("link")
    const inbox = bar.getByRole("link", { name: "Enquiries, 12 new" })
    expect(inbox.getAttribute("href")).toBe(`${BASE}/enquiries`)
    expect(links.indexOf(inbox)).toBe(links.indexOf(bar.getByRole("link", { name: "Notifications" })) - 1)
    expect(inbox.textContent).toBe("9+")
    expect(inbox.querySelector("[data-icon]")?.getAttribute("data-icon")).toBe("mdi:inbox-arrow-down-outline")
  })

  it("says just Enquiries with nothing new, and is filled on the inbox", () => {
    asHandler()
    renderAt(`${BASE}/enquiries`)

    const inbox = mobileBar().getByRole("link", { name: "Enquiries" })
    expect(inbox.textContent).toBe("")
    expect(inbox.getAttribute("aria-current")).toBe("page")
    expect(inbox.querySelector("[data-icon]")?.getAttribute("data-icon")).toBe("mdi:inbox-arrow-down")
  })

  it("is absent without enquiries.manage, and the count is never asked for", () => {
    const editorOnly = { ...ORG, my_permissions: ["members.view", "page.manage"] }
    useAuthStore.setState({ organizations: [editorOnly] as never, currentOrganization: editorOnly as never })
    mocks.newEnquiries = 5
    renderAt(`${BASE}/dashboard`)

    expect(moreRow("enquiries")).toBeUndefined()
    expect(sheetTile("enquiries")).toBeUndefined()
    expect(mobileBar().queryByRole("link", { name: /^Enquiries/ })).toBeNull()
    expect(mocks.enquiryCountEnabled.every((enabled) => enabled === false)).toBe(true)
  })
})
