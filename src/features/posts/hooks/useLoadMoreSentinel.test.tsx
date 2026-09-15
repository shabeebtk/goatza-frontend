// @vitest-environment jsdom

/**
 * useLoadMoreSentinel — one observer, read through refs, quiet while the
 * viewer pages the same query or the last page failed.
 *
 * jsdom has no IntersectionObserver; the stub below records every instance
 * and lets a test fire an intersection by hand.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

import { useLoadMoreSentinel, type LoadMoreSentinelOptions } from "./useLoadMoreSentinel"
import { usePostViewerStore } from "@/store/postViewer.store"

type Callback = (entries: IntersectionObserverEntry[]) => void

class FakeObserver {
  static instances: FakeObserver[] = []
  observed: Element[] = []
  observeCalls = 0
  constructor(public callback: Callback) {
    FakeObserver.instances.push(this)
  }
  observe(el: Element) {
    this.observeCalls++
    this.observed.push(el)
  }
  unobserve(el: Element) {
    this.observed = this.observed.filter((o) => o !== el)
  }
  disconnect() {
    this.observed = []
  }
  /** What the browser does when the sentinel enters the root margin. */
  intersect(isIntersecting = true) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry])
  }
}

function Sentinel(options: LoadMoreSentinelOptions) {
  const ref = useLoadMoreSentinel(options)
  return <div ref={ref} data-testid="sentinel" />
}

beforeEach(() => {
  FakeObserver.instances = []
  vi.stubGlobal("IntersectionObserver", FakeObserver)
  usePostViewerStore.setState({ open: false })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const idle = (fetchNextPage: () => unknown): LoadMoreSentinelOptions => ({
  hasNextPage: true,
  isFetchingNextPage: false,
  isError: false,
  fetchNextPage,
})

describe("useLoadMoreSentinel", () => {
  it("fetches when the sentinel comes into range", () => {
    const fetchNextPage = vi.fn()
    render(<Sentinel {...idle(fetchNextPage)} />)

    act(() => FakeObserver.instances[0].intersect())

    expect(fetchNextPage).toHaveBeenCalledTimes(1)
  })

  // A rebuilt observer reports the sentinel's state straight away — with the
  // sentinel still in range that was a second request behind the first.
  it("keeps ONE observer across fetch-state changes and reads the latest values", () => {
    const fetchNextPage = vi.fn()
    const { rerender } = render(<Sentinel {...idle(fetchNextPage)} />)

    rerender(<Sentinel {...idle(fetchNextPage)} isFetchingNextPage />)
    expect(FakeObserver.instances).toHaveLength(1)

    act(() => FakeObserver.instances[0].intersect())
    expect(fetchNextPage).not.toHaveBeenCalled()

    rerender(<Sentinel {...idle(fetchNextPage)} hasNextPage={false} />)
    act(() => FakeObserver.instances[0].intersect())
    expect(fetchNextPage).not.toHaveBeenCalled()
    expect(FakeObserver.instances).toHaveLength(1)
  })

  it("stays quiet while a viewer is open — the viewer pages on its own", () => {
    const fetchNextPage = vi.fn()
    render(<Sentinel {...idle(fetchNextPage)} />)

    act(() => usePostViewerStore.setState({ open: true }))
    act(() => FakeObserver.instances[0].intersect())
    expect(fetchNextPage).not.toHaveBeenCalled()

    act(() => usePostViewerStore.setState({ open: false }))
    act(() => FakeObserver.instances[0].intersect())
    expect(fetchNextPage).toHaveBeenCalledTimes(1)
  })

  // A failed page that refetched the moment it settled would hammer a
  // server that is already throttling; the inline row is the retry.
  it("stays quiet after the last page failed", () => {
    const fetchNextPage = vi.fn()
    render(<Sentinel {...idle(fetchNextPage)} isError />)

    act(() => FakeObserver.instances[0].intersect())

    expect(fetchNextPage).not.toHaveBeenCalled()
  })

  // A short page can leave the sentinel in range with no intersection change
  // left to report; the list must not stall until the reader scrolls.
  it("observes the sentinel afresh when it comes back to idle", () => {
    const fetchNextPage = vi.fn()
    const { rerender } = render(<Sentinel {...idle(fetchNextPage)} />)
    const observer = FakeObserver.instances[0]
    expect(observer.observeCalls).toBe(1)

    rerender(<Sentinel {...idle(fetchNextPage)} isFetchingNextPage />)
    expect(observer.observeCalls).toBe(1)

    rerender(<Sentinel {...idle(fetchNextPage)} />)
    expect(observer.observeCalls).toBe(2)
    expect(observer.observed).toHaveLength(1)
  })
})
