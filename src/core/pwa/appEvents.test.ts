// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useAuthStore } from "@/store/auth.store"
import { appDay, deviceId, trackAppEvent, trackOpenedOncePerDay } from "./appEvents"
import { DEVICE_ID_KEY, OPENED_DAY_KEY } from "./constants"
import { resetBrowser, setStandalone, setUserAgent } from "./testing/browserEnv"
import { UA } from "./testing/userAgents"

const post = vi.hoisted(() => vi.fn())
vi.mock("@/core/api/axios", () => ({ default: { post } }))

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Lets the auth wait and the post run. */
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

beforeEach(() => {
  resetBrowser()
  localStorage.clear()
  post.mockReset().mockResolvedValue({ data: {} })
  useAuthStore.setState({ isLoading: false })
  setUserAgent(UA.androidChrome)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetBrowser()
})

describe("deviceId", () => {
  it("is made once and then kept", () => {
    const first = deviceId()

    expect(first).toMatch(UUID)
    expect(deviceId()).toBe(first)
    expect(localStorage.getItem(DEVICE_ID_KEY)).toBe(first)
  })

  it("is null when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError")
    })

    expect(deviceId()).toBeNull()
  })
})

describe("trackAppEvent", () => {
  it("posts the device, the event and coarse buckets, as the person", async () => {
    trackAppEvent("installed", { source: "prompt" })
    await flush()

    expect(post).toHaveBeenCalledWith(
      "/app/events",
      {
        device_id: localStorage.getItem(DEVICE_ID_KEY),
        event: "installed",
        platform: "android",
        browser: "chrome",
        source: "prompt",
      },
      { actor: { type: "user" } }
    )
  })

  it("waits for the session bootstrap before sending", async () => {
    useAuthStore.setState({ isLoading: true })

    trackAppEvent("opened")
    await flush()
    expect(post).not.toHaveBeenCalled()

    useAuthStore.setState({ isLoading: false })
    await flush()
    expect(post).toHaveBeenCalledTimes(1)
  })

  it("sends nothing when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError")
    })

    trackAppEvent("opened")
    await flush()

    expect(post).not.toHaveBeenCalled()
  })

  it("a failed request throws nothing and is not retried", async () => {
    post.mockRejectedValue(new Error("Network Error"))

    expect(() => trackAppEvent("installed", { source: "browser_menu" })).not.toThrow()
    await flush()

    expect(post).toHaveBeenCalledTimes(1)
  })
})

describe("trackOpenedOncePerDay", () => {
  it("sends nothing in an ordinary browser tab", async () => {
    trackOpenedOncePerDay()
    await flush()

    expect(post).not.toHaveBeenCalled()
  })

  it("sends at most once per Asia/Kolkata day", async () => {
    setStandalone(true)
    vi.useFakeTimers({ toFake: ["Date"] })

    // 23:30 IST on the 14th.
    vi.setSystemTime(new Date("2026-11-14T18:00:00Z"))
    trackOpenedOncePerDay()
    await flush()
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0][1]).toMatchObject({ event: "opened" })

    // 23:50 IST, the same day.
    vi.setSystemTime(new Date("2026-11-14T18:20:00Z"))
    trackOpenedOncePerDay()
    await flush()
    expect(post).toHaveBeenCalledTimes(1)

    // 00:10 IST on the 15th, still the 14th in UTC: a new day.
    vi.setSystemTime(new Date("2026-11-14T18:40:00Z"))
    trackOpenedOncePerDay()
    await flush()
    expect(post).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem(OPENED_DAY_KEY)).toBe("2026-11-15")

    // A new UTC day, the same IST day.
    vi.setSystemTime(new Date("2026-11-15T00:10:00Z"))
    trackOpenedOncePerDay()
    await flush()
    expect(post).toHaveBeenCalledTimes(2)
  })

  it("sends nothing when storage throws", async () => {
    setStandalone(true)
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError")
    })

    trackOpenedOncePerDay()
    await flush()

    expect(post).not.toHaveBeenCalled()
  })
})

describe("appDay", () => {
  it("is the India calendar day", () => {
    expect(appDay(new Date("2026-11-14T18:29:00Z"))).toBe("2026-11-14")
    expect(appDay(new Date("2026-11-14T18:30:00Z"))).toBe("2026-11-15")
  })
})
