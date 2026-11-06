// @vitest-environment jsdom
/**
 * A thread whose other side has gone: it can still be read, and the composer is
 * replaced by a sentence. Only the parts of the window that decide that are real.
 */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import ChatWindow from "./ChatWindow"

const mocks = vi.hoisted(() => ({ detail: {} as Record<string, unknown> }))

vi.mock("@iconify/react", () => ({
  Icon: ({ "aria-label": label }: { "aria-label"?: string }) => <span aria-label={label} />,
}))
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    "aria-label": label,
  }: {
    href: string
    children: React.ReactNode
    "aria-label"?: string
  }) => (
    <a href={href} aria-label={label}>
      {children}
    </a>
  ),
}))
vi.mock("@/shared/components/ui/Toast/Toast", () => ({
  useToast: () => ({ show: vi.fn() }),
}))
vi.mock("@/shared/services/navigation.service", () => ({
  useNavigation: () => ({ toProfile: (username: string) => `/${username}` }),
}))
vi.mock("@/shared/services/mediaCapabilities", () => ({
  useMediaCapabilities: () => ({ server_processing: false }),
}))
vi.mock("../../hooks/useChatSocket", () => ({
  useChatSocket: () => ({ send: vi.fn(), status: "open", otherLastReadAt: 0 }),
}))
vi.mock("../../hooks/useChatImageUpload", () => ({
  useChatMediaUpload: () => ({
    sendImages: vi.fn(),
    sendVideo: vi.fn(),
    retry: vi.fn(),
    remove: vi.fn(),
  }),
}))
vi.mock("../../hooks/useConversationQueries", () => ({
  useConversationDetail: () => ({ data: mocks.detail, isLoading: false }),
  useMessages: () => ({
    data: {
      pages: [
        {
          next_cursor: null,
          results: [
            {
              id: "m1",
              content: "An old message",
              sender_id: "u2",
              created_at: "2026-01-01T00:00:00Z",
              message_type: "text",
            },
          ],
        },
      ],
    },
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  useMarkRead: () => ({ mutate: vi.fn() }),
  useAcceptConversation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteMessage: () => ({ mutate: vi.fn() }),
}))
vi.mock("@/features/moderation/components/BlockMenuButton/BlockMenuButton", () => ({
  default: () => <button>Block menu</button>,
}))
vi.mock("@/features/moderation/components/ReportSheet/ReportSheet", () => ({
  default: () => null,
}))
vi.mock("../MessageActions/MessageActions", () => ({
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

const NOTICE = "You can't reply to this conversation."

const someone = {
  id: "u2",
  username: "riya",
  name: "Riya",
  avatar: "",
  type: "user",
}

const conversation = (overrides: Record<string, unknown> = {}) => ({
  id: "c1",
  type: "direct",
  status: "active",
  can_message: true,
  is_accepted: true,
  is_blocked: false,
  other_participant: someone,
  other_last_read_at: null,
  counterpart_unavailable: false,
  counterpart_unavailable_reason: "",
  ...overrides,
})

const profileLink = () =>
  screen.queryAllByRole("link").filter((link) => link.getAttribute("href") === "/riya")

beforeEach(() => {
  useAuthStore.setState({
    user: { id: "me", username: "me" } as never,
    isOrgAdminView: false,
    actorId: null,
    actorType: "user",
  } as never)
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  Element.prototype.scrollTo = () => undefined
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("A thread with somebody still here", () => {
  it("has a composer and links to their profile", async () => {
    mocks.detail = conversation()

    render(<ChatWindow conversationId="c1" />)

    await screen.findByText("Riya")
    expect(screen.queryByText(NOTICE)).toBeNull()
    expect(profileLink()).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Block menu" })).toBeTruthy()
  })
})

describe("A thread whose counterpart is unavailable", () => {
  beforeEach(() => {
    mocks.detail = conversation({
      counterpart_unavailable: true,
      counterpart_unavailable_reason: "This account is no longer active.",
    })
  })

  it("replaces the composer with the notice", async () => {
    render(<ChatWindow conversationId="c1" />)

    expect(await screen.findByText(NOTICE)).toBeTruthy()
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("can still be read", async () => {
    render(<ChatWindow conversationId="c1" />)

    expect(await screen.findByText("An old message")).toBeTruthy()
  })

  it("has no way to their profile, and nobody left to block", async () => {
    render(<ChatWindow conversationId="c1" />)

    await screen.findByText(NOTICE)
    expect(profileLink()).toHaveLength(0)
    expect(screen.queryByRole("button", { name: "Block menu" })).toBeNull()
  })
})

describe("A thread with a deleted account", () => {
  beforeEach(() => {
    mocks.detail = conversation({
      counterpart_unavailable: true,
      counterpart_unavailable_reason: "This account has been deleted.",
      other_participant: {
        id: "u2",
        username: "",
        name: "Deleted account",
        avatar: "",
        type: "user",
      },
    })
  })

  it("shows the placeholder and the default avatar, and links nowhere", async () => {
    render(<ChatWindow conversationId="c1" />)

    expect(await screen.findByText("Deleted account")).toBeTruthy()
    expect(screen.getByLabelText("Deleted account")).toBeTruthy()
    expect(
      screen.queryAllByRole("link").filter((link) => link.getAttribute("href") === "/")
    ).toHaveLength(0)
  })

  it("is treated as gone even if the flag is missing: there is no username", async () => {
    mocks.detail = {
      ...mocks.detail,
      counterpart_unavailable: undefined,
    }

    render(<ChatWindow conversationId="c1" />)

    expect(await screen.findByText(NOTICE)).toBeTruthy()
  })
})
