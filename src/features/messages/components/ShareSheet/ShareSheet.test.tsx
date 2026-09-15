// @vitest-environment jsdom

/**
 * ShareSheet — the iOS keyboard contract.
 *
 * With the search or note input focused, a tap on a row, on Send or on the
 * search clear button must NOT move focus: the keyboard closing mid-tap is
 * what moved the sheet under the finger and landed the click on the next
 * person. Focus moves on pointerdown/mousedown, so both are cancelled, the
 * click still fires, and the sheet itself closes the keyboard after Send and
 * when the list is scrolled.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ToastProvider } from "@/shared/components/ui/Toast/Toast"
import type { Conversation } from "../../services/conversations.api"
import ShareSheet from "./ShareSheet"

vi.mock("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

const share = vi.fn()

vi.mock("../../hooks/useConversationQueries", () => ({
  useConversations: () => ({
    data: conversations,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useMessageTargetSearch: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useShareContent: () => ({ mutate: share, isPending: false }),
}))

const person = (id: string, name: string): Conversation => ({
  id: `conv-${id}`,
  type: "direct",
  status: "active",
  last_message: null,
  last_message_at: null,
  other_participant: {
    id,
    username: name.toLowerCase(),
    name,
    avatar: "",
    type: "user",
  },
  unread_count: 0,
})

const conversations = [person("u1", "Riya"), person("u2", "Arjun")]

function renderSheet() {
  return render(
    <ToastProvider>
      <ShareSheet open onClose={() => {}} target={{ type: "post", id: "p1" }} />
    </ToastProvider>
  )
}

const searchInput = () =>
  screen.getByLabelText("Search people and organizations to share with")

afterEach(() => {
  cleanup()
  share.mockClear()
})

describe("ShareSheet — taps while the keyboard is up", () => {
  it("a pointerdown on a row does not move focus, and the click still selects", () => {
    renderSheet()
    const input = searchInput()
    input.focus()
    expect(document.activeElement).toBe(input)

    const row = screen.getByRole("button", { name: /Riya/ })

    // fireEvent returns false when the handler called preventDefault.
    expect(fireEvent.pointerDown(row)).toBe(false)
    expect(fireEvent.mouseDown(row)).toBe(false)
    expect(document.activeElement).toBe(input)

    fireEvent.click(row)
    expect(row.getAttribute("aria-pressed")).toBe("true")
    expect(document.activeElement).toBe(input)
  })

  it("a pointerdown on Send does not move focus; the send closes the keyboard itself", () => {
    renderSheet()
    fireEvent.click(screen.getByRole("button", { name: /Arjun/ }))

    const note = screen.getByLabelText("Write a message to send with this")
    note.focus()
    expect(document.activeElement).toBe(note)

    const send = screen.getByRole("button", { name: /Send \(1\)/ })
    expect(fireEvent.pointerDown(send)).toBe(false)
    expect(fireEvent.mouseDown(send)).toBe(false)
    expect(document.activeElement).toBe(note)

    fireEvent.click(send)
    expect(share).toHaveBeenCalledTimes(1)
    expect(share.mock.calls[0][0]).toMatchObject({
      target: { type: "post", id: "p1" },
      conversation_ids: ["conv-u2"],
      recipients: [],
    })
    // Sent: now the keyboard goes, on purpose.
    expect(document.activeElement).not.toBe(note)
  })

  it("a pointerdown on the search clear button keeps the search focused", () => {
    renderSheet()
    const input = searchInput()
    input.focus()
    fireEvent.change(input, { target: { value: "ri" } })

    const clear = screen.getByRole("button", { name: "Clear search" })
    expect(fireEvent.pointerDown(clear)).toBe(false)
    expect(document.activeElement).toBe(input)

    fireEvent.click(clear)
    expect((input as HTMLInputElement).value).toBe("")
    expect(document.activeElement).toBe(input)
  })

  it("scrolling the list closes the keyboard", () => {
    renderSheet()
    const input = searchInput()
    input.focus()

    const list = screen.getByRole("button", { name: /Riya/ }).closest("ul")!
      .parentElement!
    fireEvent.touchMove(list)
    expect(document.activeElement).not.toBe(input)
  })

  it("publishes the visible area while open and clears it on close", () => {
    const { unmount } = renderSheet()
    const root = document.documentElement
    expect(root.style.getPropertyValue("--vv-height")).not.toBe("")

    unmount()
    expect(root.style.getPropertyValue("--vv-height")).toBe("")
  })
})
