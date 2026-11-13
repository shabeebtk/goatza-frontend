// @vitest-environment jsdom
/**
 * The squad notifications. Every row shows the server's own text with its type's
 * icon; squad_invite answers in place, like org_invite, and the rest open the
 * backend's url.
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Notification } from "../../services/notifications.api"
import NotificationsList from "./NotificationsList"

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  markRead: vi.fn(),
  inviteProps: [] as Record<string, unknown>[],
}))

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
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
  useMarkNotificationRead: () => ({ mutate: mocks.markRead }),
  useMarkAllRead: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock("@/features/orgMembers/components/OrgInviteActions/OrgInviteActions", () => ({
  default: () => null,
}))
vi.mock("@/features/squads/components/SquadInviteActions/SquadInviteActions", () => ({
  default: (props: Record<string, unknown>) => {
    mocks.inviteProps.push(props)
    return <button>Answer {String(props.memberId)}</button>
  },
}))

const LOGO = "https://media.example.com/logo.webp"
const ORG = { id: "org-1", name: "Dream FC", username: "dreamfc", logo: LOGO }

const row = (overrides: Partial<Notification>): Notification => ({
  id: "n1",
  type: "squad_request_approved",
  text: "Dream FC added you to U17 Boys",
  actors: [{ id: "org-1", name: "Dream FC", username: "dreamfc", avatar: LOGO, type: "organization" }],
  others_count: 0,
  is_read: false,
  created_at: "2026-11-01T00:00:00Z",
  url: "/organization/profile/dreamfc/squads/sq-1",
  actor_type: "organization",
  recipient_type: "user",
  post: null,
  comment: null,
  data: { squad: { id: "sq-1", name: "U17 Boys" }, organization: ORG },
  ...overrides,
})

/** The small badge on the avatar carries the type's icon. */
const typeIcon = (container: HTMLElement) =>
  container.querySelector('[aria-hidden="true"] [data-icon]')?.getAttribute("data-icon")

beforeEach(() => {
  mocks.rows = []
  mocks.inviteProps = []
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

describe("The squad rows that open a page", () => {
  it.each([
    [
      "squad_join_request",
      "Asha and 2 others asked to join U17 Boys",
      "/organization/admin/org-1/squads/sq-1/requests",
      "mdi:account-multiple-plus-outline",
    ],
    [
      "squad_request_approved",
      "Dream FC added you to U17 Boys",
      "/organization/profile/dreamfc/squads/sq-1",
      "mdi:check-decagram",
    ],
    [
      "squad_request_declined",
      "Dream FC didn't add you to U17 Boys",
      "/squads/mine",
      "mdi:close-circle-outline",
    ],
    [
      "squad_invite_accepted",
      "Asha joined U17 Boys",
      "/organization/admin/org-1/squads/sq-1",
      "mdi:account-check-outline",
    ],
    [
      "squad_member_removed",
      "Dream FC removed you from U17 Boys",
      "/profile/asha",
      "mdi:account-remove-outline",
    ],
    [
      "squad_member_moved",
      "Dream FC moved you to Seniors",
      "/organization/profile/dreamfc/squads/sq-2",
      "mdi:swap-horizontal",
    ],
  ] as const)("%s shows the server's text and opens its url", (type, text, url, icon) => {
    mocks.rows = [row({ type, text, url })]
    const { container } = render(<NotificationsList />)

    expect(screen.getByText(text).closest("a")?.getAttribute("href")).toBe(url)
    expect(typeIcon(container)).toBe(icon)
    expect(screen.queryByRole("button", { name: /Answer/ })).toBeNull()
  })
})

describe("A squad_invite row", () => {
  it("answers in place with what the club offered, never as a link", () => {
    mocks.rows = [
      row({
        type: "squad_invite",
        text: "Dream FC invited you to join U17 Boys",
        data: {
          squad: { id: "sq-1", name: "U17 Boys" },
          organization: ORG,
          member_id: "mem-7",
          jersey_number: 9,
          position_name: "Striker",
          recruitment_title: "U17 Open Trials",
          inviter_name: "Olive Owner",
        },
      }),
    ]
    const { container } = render(<NotificationsList />)

    expect(screen.getByText("Dream FC invited you to join U17 Boys")).toBeTruthy()
    expect(typeIcon(container)).toBe("mdi:shield-account-outline")
    expect(screen.getByRole("button", { name: "Answer mem-7" })).toBeTruthy()
    // Two buttons inside a link would be invalid, and a tap would navigate away.
    expect(screen.getByText(/invited you to join/).closest("a")).toBeNull()

    expect(mocks.inviteProps.at(-1)).toEqual(
      expect.objectContaining({
        memberId: "mem-7",
        squadId: "sq-1",
        squadName: "U17 Boys",
        orgUsername: "dreamfc",
        jerseyNumber: 9,
        positionName: "Striker",
        recruitmentTitle: "U17 Open Trials",
      })
    )
  })

  it("is a plain row when the payload has no member id", () => {
    mocks.rows = [
      row({
        type: "squad_invite",
        text: "Dream FC invited you to join U17 Boys",
        data: { squad: { id: "sq-1", name: "U17 Boys" }, organization: ORG },
      }),
    ]
    render(<NotificationsList />)

    expect(screen.getByText("Dream FC invited you to join U17 Boys")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Answer/ })).toBeNull()
  })
})
