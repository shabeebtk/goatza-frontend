// @vitest-environment jsdom
/**
 * useWebSocket across a reconnect and a url change — the account switch of
 * the app-wide notifications socket (NotificationsSocket).
 *
 * connect → drop → reconnect → url change must leave exactly ONE live socket,
 * for the new url, delivering each message once; the old url's socket must
 * neither keep emitting nor schedule a reconnect of its own.
 */

import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import { useWebSocket } from "./useWebSocket"

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
    /** The network drops it (or the browser finishes closing it). */
    drop() {
        this.readyState = FakeSocket.CLOSED
        this.dispatchEvent(new CloseEvent("close", { code: 1006 }))
    }
    receive(data: unknown) {
        this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }))
    }
}

const live = () => FakeSocket.instances.filter((s) => s.readyState !== FakeSocket.CLOSED)

let run = 0

beforeEach(() => {
    vi.useFakeTimers()
    FakeSocket.instances = []
    vi.stubGlobal("WebSocket", FakeSocket)
    useAuthStore.setState({ accessToken: "token" } as never)
    run++
})

afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe("useWebSocket", () => {
    it("after a reconnect, a url change leaves one live socket — the new one", () => {
        // wsManager is a module singleton: fresh urls per test.
        const oldUrl = `wss://test/${run}/as-person`
        const newUrl = `wss://test/${run}/as-club`
        const onMessage = vi.fn()

        const { rerender } = renderHook(({ url }) => useWebSocket({ url, onMessage }), {
            initialProps: { url: oldUrl },
        })
        const first = FakeSocket.instances[0]
        act(() => first.open())

        // iOS drops it; the backoff reconnects.
        act(() => first.drop())
        act(() => {
            vi.advanceTimersByTime(2000)
        })
        expect(FakeSocket.instances).toHaveLength(2)
        const reconnected = FakeSocket.instances[1]
        expect(reconnected.url).toBe(oldUrl)
        act(() => reconnected.open())

        // The account switch.
        rerender({ url: newUrl })
        const current = FakeSocket.instances[2]
        expect(current.url).toBe(newUrl)
        act(() => current.open())

        // The old socket finishes closing — and must not come back.
        act(() => reconnected.drop())
        act(() => {
            vi.advanceTimersByTime(60_000)
        })

        expect(live()).toEqual([current])
        expect(FakeSocket.instances.filter((s) => s.url === oldUrl)).toHaveLength(2)

        // Nothing from the old socket reaches the caller; the new one's
        // messages arrive exactly once.
        act(() => reconnected.receive({ from: "old" }))
        act(() => current.receive({ from: "new" }))
        expect(onMessage.mock.calls).toEqual([[{ from: "new" }]])
    })

    it("unmounting stops a pending reconnect", () => {
        const url = `wss://test/${run}/unmount`
        const { unmount } = renderHook(() => useWebSocket({ url }))
        act(() => FakeSocket.instances[0].open())
        act(() => FakeSocket.instances[0].drop())

        unmount()
        act(() => {
            vi.advanceTimersByTime(60_000)
        })

        expect(FakeSocket.instances).toHaveLength(1)
    })
})
