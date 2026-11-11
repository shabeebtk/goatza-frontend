// @vitest-environment jsdom
/**
 * Every request that meets a 401 waits on the refresh in flight, so the refresh
 * must always end: the request itself has a timeout, and waiting for another
 * tab's lock gives up and refreshes anyway.
 */

import axios from "axios"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import {
    LOCK_WAIT_MS,
    REFRESH_TIMEOUT_MS,
    getFreshAccessToken,
} from "./refreshManager"

// Not JWT-shaped on purpose: no exp, so no proactive timer is scheduled.
const ok = { data: { data: { access_token: "fresh-token" } } }

let post: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    post = vi.spyOn(axios, "post").mockResolvedValue(ok)
    useAuthStore.setState({ accessToken: "old-token" } as never)
})

afterEach(() => {
    post.mockRestore()
    vi.useRealTimers()
    Reflect.deleteProperty(navigator, "locks")
})

const installLocks = (request: LockManager["request"]) =>
    Object.defineProperty(navigator, "locks", {
        value: { request },
        configurable: true,
    })

describe("the refresh", () => {
    it("is sent with a timeout", async () => {
        await expect(getFreshAccessToken()).resolves.toBe("fresh-token")

        expect(post).toHaveBeenCalledTimes(1)
        expect(post.mock.calls[0][2]).toMatchObject({
            withCredentials: true,
            timeout: REFRESH_TIMEOUT_MS,
        })
    })

    it("stops waiting for another tab's lock and refreshes without it", async () => {
        vi.useFakeTimers()
        // A lock some frozen tab never lets go of.
        installLocks(((_name: string, options: LockOptions) =>
            new Promise((_, reject) => {
                options.signal?.addEventListener("abort", () =>
                    reject(options.signal?.reason)
                )
            })) as unknown as LockManager["request"])

        const token = getFreshAccessToken()
        await vi.advanceTimersByTimeAsync(LOCK_WAIT_MS - 1)
        expect(post).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(1)
        await expect(token).resolves.toBe("fresh-token")
        expect(post).toHaveBeenCalledTimes(1)
    })

    it("refreshes once under the lock when it is granted", async () => {
        vi.useFakeTimers()
        installLocks(((_name: string, _options: LockOptions, callback: () => unknown) =>
            Promise.resolve(callback())) as unknown as LockManager["request"])

        await expect(getFreshAccessToken()).resolves.toBe("fresh-token")
        await vi.advanceTimersByTimeAsync(LOCK_WAIT_MS * 2)

        expect(post).toHaveBeenCalledTimes(1)
    })
})
