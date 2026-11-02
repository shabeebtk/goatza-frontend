// @vitest-environment jsdom
/**
 * One realtime connection for the whole app.
 *
 * NotificationsSocket owns THE ws/notifications/ socket and hands every
 * message to realtimeBus; the conversations list no longer opens a socket of
 * its own, it listens on the bus. What must hold: one socket, and a
 * `conversation_updated` still refreshes the list (never the open thread).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, render } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { REALTIME_OPEN, realtimeBus } from "@/core/ws/realtimeBus"
import NotificationsSocket from "@/core/ws/NotificationsSocket"
import { useConversationsSocket } from "@/features/messages/hooks/useConversationsSocket"
import { useAuthStore } from "@/store/auth.store"

class FakeSocket extends EventTarget {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    static instances: FakeSocket[] = []

    readyState = FakeSocket.CONNECTING
    constructor(public url: string) {
        super()
        FakeSocket.instances.push(this)
    }
    send() {}
    close() {
        this.readyState = FakeSocket.CLOSED
    }

    open() {
        this.readyState = FakeSocket.OPEN
        this.dispatchEvent(new Event("open"))
    }
    receive(data: unknown) {
        this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }))
    }
}

function ConversationsList() {
    useConversationsSocket()
    return null
}

const mount = (client: QueryClient, children: ReactNode) =>
    render(<QueryClientProvider client={client}>{children}</QueryClientProvider>)

beforeEach(() => {
    FakeSocket.instances = []
    vi.stubGlobal("WebSocket", FakeSocket)
    useAuthStore.setState({
        user: { id: "user-1", username: "player1" } as never,
        actorType: "user",
        actorId: null,
        accessToken: "token",
    } as never)
})

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

describe("realtimeBus", () => {
    it("hands a message to its type's subscribers only, and unsubscribes", () => {
        const seen: string[] = []
        const off = realtimeBus.on("publication_updated", () => seen.push("publication"))
        realtimeBus.on("other", () => seen.push("other"))

        realtimeBus.emit({ notification_type: "publication_updated" })
        off()
        realtimeBus.emit({ notification_type: "publication_updated" })

        expect(seen).toEqual(["publication"])
    })

    it("keeps going when one handler throws", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        const after = vi.fn()
        const offA = realtimeBus.on("x", () => {
            throw new Error("boom")
        })
        const offB = realtimeBus.on("x", after)

        realtimeBus.emit({ notification_type: "x" })

        expect(after).toHaveBeenCalledTimes(1)
        offA()
        offB()
        error.mockRestore()
    })
})

describe("NotificationsSocket + useConversationsSocket", () => {
    it("opens ONE socket, and a conversation_updated still refreshes the list", () => {
        const client = new QueryClient()
        const invalidate = vi.spyOn(client, "invalidateQueries")

        mount(
            client,
            <>
                <NotificationsSocket />
                <ConversationsList />
            </>
        )

        expect(FakeSocket.instances).toHaveLength(1)
        expect(FakeSocket.instances[0].url).toContain("/ws/notifications/")

        act(() => {
            FakeSocket.instances[0].open()
            FakeSocket.instances[0].receive({
                type: "notification_message",
                notification_type: "conversation_updated",
            })
        })

        expect(invalidate).toHaveBeenCalledTimes(1)
        // The list, never the open thread's history.
        const { predicate } = invalidate.mock.calls[0][0] as unknown as {
            predicate: (q: { queryKey: unknown[] }) => boolean
        }
        expect(predicate({ queryKey: ["conversations", "list"] })).toBe(true)
        expect(predicate({ queryKey: ["conversations", "messages", "c-1"] })).toBe(false)
    })

    it("announces every (re)connect on the bus", () => {
        const opened = vi.fn()
        const off = realtimeBus.on(REALTIME_OPEN, opened)

        mount(new QueryClient(), <NotificationsSocket />)
        act(() => FakeSocket.instances[0].open())

        expect(opened).toHaveBeenCalledTimes(1)
        off()
    })

    it("opens nothing for a signed-out visitor", () => {
        useAuthStore.setState({ user: null } as never)

        mount(new QueryClient(), <NotificationsSocket />)

        expect(FakeSocket.instances).toHaveLength(0)
    })
})
