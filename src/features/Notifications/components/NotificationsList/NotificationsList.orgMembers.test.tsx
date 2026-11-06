// @vitest-environment jsdom
/**
 * org_invite is the one org-member type that answers in place. The rest are rows
 * that open wherever the backend says.
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Notification } from "../../services/notifications.api"
import NotificationsList from "./NotificationsList"

const mocks = vi.hoisted(() => ({ rows: [] as unknown[], markRead: vi.fn() }))

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock("@iconify/react", () => ({ Icon: () => <span /> }))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({
  default: ({ src }: { src?: string }) => <img src={src} alt="" />,
}))
vi.mock("@/features/career/components/CareerAddPromptSheet/CareerAddPromptSheet", () => ({
  default: () => null,
}))
vi.mock("../NotificationBell/NotificationBell", () => ({ default: () => null }))
vi.mock("../../hooks/useNotificationQueries", () => ({
  useNotifications: () => ({
    data: { pages: [{ results: mocks.rows }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  useMarkNotificationRead: () => ({ mutate: mocks.markRead }),
  useMarkAllRead: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock("@/features/orgMembers/components/OrgInviteActions/OrgInviteActions", () => ({
  default: ({ inviteId, organizationName }: { inviteId: string; organizationName: string }) => (
    <button>
      Answer {inviteId} for {organizationName}
    </button>
  ),
}))

const LOGO = "https://media.example.com/logo.webp"

const row = (overrides: Partial<Notification>): Notification => ({
  id: "n1",
  type: "org_invite",
  text: "Olive Owner invited you to join Dream FC as Coach",
  actors: [{ id: "org-1", name: "Dream FC", username: "dreamfc", avatar: LOGO, type: "organization" }],
  others_count: 0,
  is_read: false,
  created_at: "2026-11-01T00:00:00Z",
  url: "/notifications",
  actor_type: "organization",
  recipient_type: "user",
  post: null,
  comment: null,
  data: {
    invite_id: "inv-1",
    organization: { id: "org-1", name: "Dream FC", username: "dreamfc", logo: LOGO },
  },
  ...overrides,
})

beforeEach(() => {
  mocks.rows = []
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    }
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("An org_invite row", () => {
  it("shows the org's logo and the question, with the answer in place of a link", () => {
    mocks.rows = [row({})]
    const { container } = render(<NotificationsList />)

    expect(
      screen.getByText("Olive Owner invited you to join Dream FC as Coach")
    ).toBeTruthy()
    expect(container.querySelector("img")?.getAttribute("src")).toBe(LOGO)
    expect(screen.getByRole("button", { name: "Answer inv-1 for Dream FC" })).toBeTruthy()
    // Two buttons inside a link would be invalid, and a tap would navigate away.
    expect(screen.getByText(/invited you to join/).closest("a")).toBeNull()
  })
})

describe("The other org-member rows", () => {
  it.each([
    ["org_invite_accepted", "Cora joined Dream FC", "/organization/admin/org-1/members"],
    ["org_invite_declined", "Cora declined your invite", "/organization/admin/org-1/members"],
    ["org_member_removed", "You were removed from Dream FC", "/home"],
    ["org_role_changed", "You're now Coach at Dream FC", "/organization/admin/org-1/members"],
    ["org_owner_changed", "Olive removed Cora as owner", "/organization/admin/org-1/members"],
  ] as const)("%s opens the backend's url", (type, text, url) => {
    mocks.rows = [row({ type, text, url })]
    render(<NotificationsList />)

    expect(screen.getByText(text).closest("a")?.getAttribute("href")).toBe(url)
    expect(screen.queryByRole("button", { name: /Answer/ })).toBeNull()
  })
})
