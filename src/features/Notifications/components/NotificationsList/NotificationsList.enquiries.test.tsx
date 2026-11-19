// @vitest-environment jsdom
/**
 * enquiry_received: the server's own text, the inbox icon, and the server's url,
 * which is the enquiry's detail route.
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Notification } from "../../services/notifications.api"
import NotificationsList from "./NotificationsList"

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
}))

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))
vi.mock("@/shared/components/ui/Avatar/Avatar", () => ({
  default: ({ src }: { src?: string }) => <span data-src={src} />,
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
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
  useMarkAllRead: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock("@/features/orgMembers/components/OrgInviteActions/OrgInviteActions", () => ({ default: () => null }))
vi.mock("@/features/squads/components/SquadInviteActions/SquadInviteActions", () => ({ default: () => null }))

const URL = "/organization/admin/org-1/enquiries/enq-1"

const row: Notification = {
  id: "n1",
  type: "enquiry_received",
  text: "New enquiry: Aditya, 11 · U12 Football Foundation",
  actors: [],
  others_count: 0,
  is_read: false,
  created_at: "2026-11-19T08:00:00Z",
  url: URL,
  actor_type: "user",
  recipient_type: "user",
  post: null,
  comment: null,
  data: {
    enquiry_id: "enq-1",
    player_age: 11,
    organization: { id: "org-1", name: "Thrissur Tigers", username: "thrissur_tigers", logo: "" },
  },
} as Notification

beforeEach(() => {
  mocks.rows = [row]
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

describe("An enquiry_received row", () => {
  it("shows the server's text with the inbox icon and opens the enquiry", () => {
    const { container } = render(<NotificationsList />)

    const text = screen.getByText("New enquiry: Aditya, 11 · U12 Football Foundation")
    expect(text.closest("a")?.getAttribute("href")).toBe(URL)
    expect(container.querySelector('[data-icon="mdi:inbox-arrow-down-outline"]')).toBeTruthy()
  })
})
