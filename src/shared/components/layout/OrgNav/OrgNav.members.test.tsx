// @vitest-environment jsdom
/**
 * Members is the org's own people now, and the followers page it used to open is
 * Network. Both surfaces carry both, and Network living under /profile must not
 * light up Org profile with it.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render } from "@testing-library/react"
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
}))

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
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
