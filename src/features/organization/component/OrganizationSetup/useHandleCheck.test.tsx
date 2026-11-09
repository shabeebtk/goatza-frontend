// @vitest-environment jsdom

/**
 * useHandleCheck — only the newest request's answer is kept. The create can
 * say "taken" (markTaken) while a check from before it is still out; that
 * older "available" must not undo it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"

const check = vi.hoisted(() => vi.fn())
vi.mock("@/features/profile/services/profile.api", () => ({ checkUsernameApi: check }))

import { HANDLE_CHECK_DEBOUNCE_MS, useHandleCheck } from "./useHandleCheck"

type CheckAnswer = { username: string; valid: boolean; available: boolean; suggestion?: string }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

/** Let a promise chain (then → catch → then) run to its end. */
const settle = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve()
}

beforeEach(() => {
  vi.useFakeTimers()
  check.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("useHandleCheck", () => {
  it("a late 'available' from before markTaken does not overwrite 'taken'", async () => {
    const early = deferred<CheckAnswer>()
    const recheck = deferred<CheckAnswer>()
    check.mockReturnValueOnce(early.promise).mockReturnValueOnce(recheck.promise)

    const { result } = renderHook(() => useHandleCheck("kannur_fc"))
    expect(result.current.status.state).toBe("checking")

    // The debounced check goes out, and is still out when the create answers.
    await act(async () => {
      vi.advanceTimersByTime(HANDLE_CHECK_DEBOUNCE_MS)
    })
    expect(check).toHaveBeenCalledTimes(1)

    act(() => result.current.markTaken("kannur_fc"))
    expect(result.current.status).toEqual({ state: "taken", handle: "kannur_fc" })
    expect(check).toHaveBeenCalledTimes(2)

    // The old check comes back "available": dropped.
    await act(async () => {
      early.resolve({ username: "kannur_fc", valid: true, available: true })
      await settle()
    })
    expect(result.current.status.state).toBe("taken")

    // markTaken's own re-check is the newest: its suggestion is kept.
    await act(async () => {
      recheck.resolve({ username: "kannur_fc", valid: true, available: false, suggestion: "kannur_fc7" })
      await settle()
    })
    expect(result.current.status).toEqual({
      state: "taken",
      handle: "kannur_fc",
      suggestion: "kannur_fc7",
    })
  })

  it("without a markTaken, the answer is the answer", async () => {
    check.mockResolvedValue({ username: "kannur_fc", valid: true, available: true })

    const { result } = renderHook(() => useHandleCheck("kannur_fc"))
    await act(async () => {
      vi.advanceTimersByTime(HANDLE_CHECK_DEBOUNCE_MS)
      await settle()
    })

    expect(result.current.status).toEqual({ state: "available", handle: "kannur_fc" })
  })
})
