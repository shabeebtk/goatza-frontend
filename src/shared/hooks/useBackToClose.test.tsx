// @vitest-environment jsdom

/**
 * useBackToClose — the history contract that two overlays used to break.
 *
 * Every close here is awaited because it goes through history.back() and
 * popstate is asynchronous — the same reasoning as MediaLightbox.test.tsx.
 * jsdom keeps ONE history for the whole file, so afterEach wipes the state of
 * whatever entry we are left on: a stale overlay entry from one test must not
 * make the next one start at depth 2.
 */

import { StrictMode, useEffect } from "react"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearRestoreState,
  OVERLAY_STATE_KEY,
  readRestoreState,
  SCROLL_RESTORATION_RESTORE_MS,
  useBackToClose,
  type BackToClose,
} from "./useBackToClose"

const push = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

function Overlay({
  onClose,
  apiRef,
  enabled,
  adoptCurrentEntry,
}: {
  onClose: () => void
  apiRef: { current: BackToClose | null }
  enabled?: boolean
  adoptCurrentEntry?: boolean
}) {
  const api = useBackToClose(onClose, { enabled, adoptCurrentEntry })
  // Published in an effect, not during render — the tests read it after
  // render() has committed anyway.
  useEffect(() => {
    apiRef.current = api
  })
  return <div data-testid="overlay" />
}

function apiHolder() {
  return { current: null as BackToClose | null }
}

function depth(): number {
  return (window.history.state?.[OVERLAY_STATE_KEY]?.depth as number | undefined) ?? 0
}

afterEach(() => {
  cleanup()
  push.mockReset()
  window.history.replaceState(null, "")
})

describe("useBackToClose", () => {
  it("reserves one entry per overlay, at increasing depth", () => {
    const a = apiHolder()
    const b = apiHolder()
    render(<Overlay onClose={() => {}} apiRef={a} />)
    expect(depth()).toBe(1)

    render(<Overlay onClose={() => {}} apiRef={b} />)
    expect(depth()).toBe(2)
  })

  // The bug this hook exists for: two overlays, two listeners, one back
  // press closing both.
  it("one back press closes only the top overlay", async () => {
    const closeBottom = vi.fn()
    const closeTop = vi.fn()
    render(<Overlay onClose={closeBottom} apiRef={apiHolder()} />)
    render(<Overlay onClose={closeTop} apiRef={apiHolder()} />)

    window.history.back()

    await waitFor(() => expect(closeTop).toHaveBeenCalledTimes(1))
    expect(closeBottom).not.toHaveBeenCalled()
    expect(depth()).toBe(1)

    window.history.back()

    await waitFor(() => expect(closeBottom).toHaveBeenCalledTimes(1))
    expect(closeTop).toHaveBeenCalledTimes(1)
    expect(depth()).toBe(0)
  })

  it("history.go(-n) closes n overlays, top-most first", async () => {
    const order: string[] = []
    render(<Overlay onClose={() => order.push("bottom")} apiRef={apiHolder()} />)
    render(<Overlay onClose={() => order.push("top")} apiRef={apiHolder()} />)

    window.history.go(-2)

    await waitFor(() => expect(order).toHaveLength(2))
    expect(order).toEqual(["top", "bottom"])
    expect(depth()).toBe(0)
  })

  it("requestClose on the top overlay consumes its entry and closes it once", async () => {
    const onClose = vi.fn()
    const api = apiHolder()
    render(<Overlay onClose={onClose} apiRef={api} />)
    expect(depth()).toBe(1)

    act(() => api.current!.requestClose())

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(depth()).toBe(0)
  })

  // A parent closing an overlay that has another one on top of it: close it
  // directly rather than popping — back() would close the TOP one instead.
  it("requestClose on a covered overlay closes it directly, leaving the top alone", async () => {
    const closeBottom = vi.fn()
    const closeTop = vi.fn()
    const bottom = apiHolder()
    render(<Overlay onClose={closeBottom} apiRef={bottom} />)
    render(<Overlay onClose={closeTop} apiRef={apiHolder()} />)

    act(() => bottom.current!.requestClose())

    expect(closeBottom).toHaveBeenCalledTimes(1)
    expect(closeTop).not.toHaveBeenCalled()
    expect(depth()).toBe(2)

    // The top is still the top: one back closes it.
    window.history.back()
    await waitFor(() => expect(closeTop).toHaveBeenCalledTimes(1))
  })

  // Back from the destination page must land on the list, not on a blank
  // "overlay" entry — so the push must happen from the page's own entry.
  it("navigateAway closes every overlay and pushes from the page's entry", async () => {
    const closeBottom = vi.fn()
    const closeTop = vi.fn()
    const top = apiHolder()
    render(<Overlay onClose={closeBottom} apiRef={apiHolder()} />)
    render(<Overlay onClose={closeTop} apiRef={top} />)
    expect(depth()).toBe(2)

    let depthAtPush = -1
    push.mockImplementation(() => { depthAtPush = depth() })

    act(() => top.current!.navigateAway("/profile/riya"))

    await waitFor(() => expect(push).toHaveBeenCalledTimes(1))
    expect(push).toHaveBeenCalledWith("/profile/riya")
    expect(depthAtPush).toBe(0)
    expect(closeTop).toHaveBeenCalledTimes(1)
    expect(closeBottom).toHaveBeenCalledTimes(1)
  })

  // Dev-only, but the failure mode is total: a second push would leave an
  // entry no back press ever closes, and a cleanup that called back() would
  // close the overlay the instant it opened.
  it("pushes once under a StrictMode double mount and does not self-close", async () => {
    const onClose = vi.fn()
    const pushState = vi.spyOn(window.history, "pushState")

    render(
      <StrictMode>
        <Overlay onClose={onClose} apiRef={apiHolder()} />
      </StrictMode>
    )

    expect(pushState).toHaveBeenCalledTimes(1)
    expect(depth()).toBe(1)

    // Give a stray back() every chance to surface.
    await new Promise((r) => setTimeout(r, 20))
    expect(onClose).not.toHaveBeenCalled()

    pushState.mockRestore()
  })

  it("pushes nothing while disabled, and requestClose closes directly", () => {
    const onClose = vi.fn()
    const api = apiHolder()
    render(<Overlay onClose={onClose} apiRef={api} enabled={false} />)
    expect(depth()).toBe(0)

    act(() => api.current!.requestClose())
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // The list's error state unmounting an open viewer used to leave the
  // viewer's entry as the current one: back then popped it and closed
  // nothing, which reads as back doing nothing at all.
  describe("orphan entries", () => {
    it("pops the entry of an overlay that really unmounted", async () => {
      const { unmount } = render(<Overlay onClose={() => {}} apiRef={apiHolder()} />)
      expect(depth()).toBe(1)

      unmount()

      await waitFor(() => expect(depth()).toBe(0))
    })

    it("pops every entry above the deepest overlay still open", async () => {
      const bottom = render(<Overlay onClose={() => {}} apiRef={apiHolder()} />)
      const top = render(<Overlay onClose={() => {}} apiRef={apiHolder()} />)
      expect(depth()).toBe(2)

      // A viewer and the sheet over it go together when the list unmounts.
      top.unmount()
      bottom.unmount()

      await waitFor(() => expect(depth()).toBe(0))
    })

    it("leaves the entry alone under a StrictMode remount", async () => {
      const onClose = vi.fn()
      render(
        <StrictMode>
          <Overlay onClose={onClose} apiRef={apiHolder()} />
        </StrictMode>
      )
      expect(depth()).toBe(1)

      // The check is deferred a tick; give it every chance to run.
      await new Promise((r) => setTimeout(r, 30))
      expect(depth()).toBe(1)
      expect(onClose).not.toHaveBeenCalled()
    })

    it("does not pop twice when the close was already on its way through back()", async () => {
      // Sit on a marked page-level entry, so a second pop would be visible
      // as leaving it.
      window.history.pushState({ marker: "page" }, "")
      const onClose = vi.fn()
      const api = apiHolder()
      const { unmount } = render(<Overlay onClose={onClose} apiRef={api} />)
      expect(depth()).toBe(1)

      // requestClose → back() is in flight; the parent unmounts before the
      // popstate lands (a list refetch dropping the post at the same time).
      act(() => api.current!.requestClose())
      unmount()

      await waitFor(() => expect(depth()).toBe(0))
      await new Promise((r) => setTimeout(r, 30))
      expect(window.history.state).toEqual({ marker: "page" })
    })
  })
})

// iOS Safari restores the page entry's saved scroll position AFTER the
// popstate that closed the viewer — over the landing. The page's entry has
// to be "manual" before the first overlay pushes (new entries inherit the
// mode, and the browser reads the mode of the entry it returns to), and the
// previous mode must not come back until landing has settled.
describe("scroll restoration", () => {
  beforeEach(() => {
    // jsdom has no scrollRestoration; the hook only takes it over when it exists.
    Object.defineProperty(window.history, "scrollRestoration", {
      value: "auto",
      writable: true,
      configurable: true,
    })
    // Fake throughout: the restore is a one-second timer, and jsdom delivers
    // popstate on a timer too, so every wait here is an advance.
    vi.useFakeTimers()
  })

  afterEach(async () => {
    // Unmount and let the deferred restore run, so the hook's module-level
    // "we hold the mode" state is clean for the next test.
    cleanup()
    await vi.runAllTimersAsync()
    vi.useRealTimers()
    delete (window.history as { scrollRestoration?: string }).scrollRestoration
  })

  const mode = () => window.history.scrollRestoration

  it("goes manual BEFORE the first overlay's pushState", () => {
    const pushState = window.history.pushState.bind(window.history)
    const modeAtPush: string[] = []
    const spy = vi.spyOn(window.history, "pushState").mockImplementation((...args) => {
      modeAtPush.push(mode())
      return pushState(...args)
    })

    render(<Overlay onClose={() => {}} apiRef={apiHolder()} />)

    expect(modeAtPush).toEqual(["manual"])
    expect(mode()).toBe("manual")
    spy.mockRestore()
  })

  it("gives the previous mode back only after the deferred timeout, and not while an overlay is still open", async () => {
    vi.useFakeTimers()
    const closeBottom = vi.fn()
    const closeTop = vi.fn()
    render(<Overlay onClose={closeBottom} apiRef={apiHolder()} />)
    render(<Overlay onClose={closeTop} apiRef={apiHolder()} />)
    expect(mode()).toBe("manual")

    // The top overlay closes; the bottom one is still up.
    act(() => window.history.back())
    await act(() => vi.advanceTimersByTimeAsync(20))
    expect(closeTop).toHaveBeenCalledTimes(1)
    expect(depth()).toBe(1)

    await act(() => vi.advanceTimersByTimeAsync(SCROLL_RESTORATION_RESTORE_MS * 3))
    expect(mode()).toBe("manual")

    // The last one closes: deferred, not on the popstate.
    act(() => window.history.back())
    await act(() => vi.advanceTimersByTimeAsync(20))
    expect(closeBottom).toHaveBeenCalledTimes(1)
    expect(depth()).toBe(0)
    expect(mode()).toBe("manual")

    await act(() => vi.advanceTimersByTimeAsync(SCROLL_RESTORATION_RESTORE_MS - 40))
    expect(mode()).toBe("manual")

    await act(() => vi.advanceTimersByTimeAsync(40))
    expect(mode()).toBe("auto")
  })

  it("keeps the mode taken over when another overlay opens before the restore", async () => {
    vi.useFakeTimers()
    const { unmount } = render(<Overlay onClose={() => {}} apiRef={apiHolder()} />)
    act(() => window.history.back())
    await act(() => vi.advanceTimersByTimeAsync(20))
    unmount()
    expect(depth()).toBe(0)
    expect(mode()).toBe("manual")

    render(<Overlay onClose={() => {}} apiRef={apiHolder()} />)
    await act(() => vi.advanceTimersByTimeAsync(SCROLL_RESTORATION_RESTORE_MS * 3))
    expect(mode()).toBe("manual")
  })

  it("navigateAway restores the mode before pushing the destination", async () => {
    const top = apiHolder()
    render(<Overlay onClose={() => {}} apiRef={apiHolder()} />)
    render(<Overlay onClose={() => {}} apiRef={top} />)
    expect(mode()).toBe("manual")

    let modeAtPush = ""
    push.mockImplementation(() => { modeAtPush = mode() })

    act(() => top.current!.navigateAway("/profile/riya"))
    await act(() => vi.advanceTimersByTimeAsync(20))

    expect(push).toHaveBeenCalledTimes(1)
    expect(modeAtPush).toBe("auto")
    expect(mode()).toBe("auto")
  })
})

/**
 * SUSPENDING AN OVERLAY — navigateKeeping.
 *
 * The other half of navigateAway. Instead of popping the overlay's entry
 * and pushing the destination in its place, the destination goes ON TOP and
 * the entry stays, so one back press comes back to the overlay. Only the
 * post viewer uses it; everything else still wants its entry consumed.
 */
describe("navigateKeeping", () => {
  function overlayState() {
    return window.history.state?.[OVERLAY_STATE_KEY] as
      | { id: number; depth: number; restore?: unknown }
      | undefined
  }

  it("pushes without popping, and closes nothing", () => {
    const api = apiHolder()
    const onClose = vi.fn()
    render(<Overlay onClose={onClose} apiRef={api} />)
    expect(depth()).toBe(1)

    act(() => api.current!.navigateKeeping("/profile/meera"))

    expect(push).toHaveBeenCalledWith("/profile/meera")
    // The entry is still ours and still there — the destination lands on
    // top of it, which is the whole point.
    expect(depth()).toBe(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("leaves the entry alone when the overlay then unmounts", async () => {
    const api = apiHolder()
    const { unmount } = render(<Overlay onClose={() => {}} apiRef={api} />)
    act(() => api.current!.navigateKeeping("/profile/meera"))

    // The route change unmounts the overlay with its entry outstanding —
    // which is exactly what the orphan check exists to clean up, and
    // exactly what must NOT happen here.
    unmount()
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })

    expect(depth()).toBe(1)
  })

  it("records a payload on its own entry, and reads it back", () => {
    const api = apiHolder()
    render(<Overlay onClose={() => {}} apiRef={api} />)

    act(() => api.current!.setRestoreState({ postId: "p7", slide: 2 }))

    expect(readRestoreState()).toEqual({ postId: "p7", slide: 2 })
    // Replaced, never pushed.
    expect(depth()).toBe(1)
  })

  it("refuses to write onto another overlay's entry", () => {
    const first = apiHolder()
    const second = apiHolder()
    render(<Overlay onClose={() => {}} apiRef={first} />)
    render(<Overlay onClose={() => {}} apiRef={second} />)
    expect(depth()).toBe(2)

    // The sheet on top owns the current entry; the viewer underneath must
    // not stamp its position onto it.
    act(() => first.current!.setRestoreState({ postId: "p7", slide: 0 }))

    expect(readRestoreState()).toBeNull()
  })

  it("adopts the entry it is standing on instead of pushing a second", () => {
    const api = apiHolder()
    render(<Overlay onClose={() => {}} apiRef={api} />)
    act(() => api.current!.setRestoreState({ postId: "p7", slide: 0 }))
    const before = overlayState()!
    cleanup()

    // Coming back: the browser is still on that entry and the overlay
    // mounts onto it.
    render(<Overlay onClose={() => {}} apiRef={api} adoptCurrentEntry />)

    const after = overlayState()!
    expect(after.id).toBe(before.id)
    expect(after.depth).toBe(before.depth)
    expect(depth()).toBe(1)
  })

  it("still pushes when there is no entry to adopt", () => {
    const api = apiHolder()
    render(<Overlay onClose={() => {}} apiRef={api} adoptCurrentEntry />)

    // Nothing of ours underneath, so adoptCurrentEntry is simply ignored.
    expect(depth()).toBe(1)
  })

  it("clearRestoreState drops the payload and leaves the entry", () => {
    const api = apiHolder()
    render(<Overlay onClose={() => {}} apiRef={api} />)
    act(() => api.current!.setRestoreState({ postId: "p7", slide: 0 }))

    clearRestoreState()

    expect(readRestoreState()).toBeNull()
    expect(depth()).toBe(1)
  })
})
