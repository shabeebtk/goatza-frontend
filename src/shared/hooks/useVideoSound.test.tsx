// @vitest-environment jsdom

import { createRef, useRef } from "react"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { useSoundStore } from "@/store/sound.store"
import { useVideoSound, type VideoSound } from "./useVideoSound"

/**
 * The hook binds one <video> to the global sound state. The two things worth
 * asserting are the ones that were real bugs: the mute state has to reach the
 * element as a PROPERTY (the autoplay policy does not read the attribute), and
 * the element -> store sync must not echo its own writes back.
 */

function Harness({ apiRef }: { apiRef: { current: VideoSound | null } }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const sound = useVideoSound(videoRef)
  apiRef.current = sound

  return (
    <video
      ref={videoRef}
      data-testid="video"
      // Bare `muted` — the rule every call site follows.
      muted
      onVolumeChange={sound.onVolumeChange}
    />
  )
}

function mount() {
  const apiRef = createRef<VideoSound | null>() as { current: VideoSound | null }
  const utils = render(<Harness apiRef={apiRef} />)
  // Scoped to this render's container: the "two videos" case mounts twice,
  // and a body-wide query would find both.
  const el = utils.container.querySelector("video") as HTMLVideoElement
  return { apiRef, el, ...utils }
}

describe("useVideoSound", () => {
  beforeEach(() => {
    useSoundStore.setState({ muted: true })
  })

  // vitest runs without globals here, so RTL's auto-cleanup is not registered.
  afterEach(cleanup)

  it("pushes the store onto the element as a property", () => {
    const { el } = mount()
    expect(el.muted).toBe(true)
    expect(el.defaultMuted).toBe(true)

    act(() => {
      useSoundStore.getState().setMuted(false)
    })

    expect(el.muted).toBe(false)
    expect(el.defaultMuted).toBe(false)
  })

  it("applyMuted writes the element in the same tick", () => {
    // The mute button and the observer both need this: play() reads the
    // property immediately, so waiting a render for the effect loses the
    // gesture.
    const { apiRef, el } = mount()

    act(() => {
      apiRef.current!.applyMuted(false)
    })

    expect(el.muted).toBe(false)
  })

  it("mutedRef tracks the store", () => {
    const { apiRef } = mount()
    expect(apiRef.current!.mutedRef.current).toBe(true)

    act(() => {
      useSoundStore.getState().setMuted(false)
    })

    expect(apiRef.current!.mutedRef.current).toBe(false)
  })

  it("native controls sync back into the store", () => {
    const { el } = mount()

    act(() => {
      useSoundStore.getState().setMuted(false)
    })
    expect(el.muted).toBe(false)

    // What the browser's own mute button does.
    act(() => {
      el.muted = true
      el.dispatchEvent(new Event("volumechange", { bubbles: true }))
    })

    expect(useSoundStore.getState().muted).toBe(true)
  })

  it("does not loop when the volumechange came from our own write", () => {
    const { el } = mount()
    const before = useSoundStore.getState()

    act(() => {
      // Value already matches the store — the guard must swallow this.
      el.dispatchEvent(new Event("volumechange", { bubbles: true }))
    })

    expect(useSoundStore.getState()).toBe(before)
  })

  it("reportBlocked drops the whole app to muted", () => {
    // One refused autoplay must not leave every other icon claiming sound is
    // on.
    const { apiRef } = mount()

    act(() => {
      useSoundStore.getState().setMuted(false)
    })
    act(() => {
      apiRef.current!.reportBlocked()
    })

    expect(useSoundStore.getState().muted).toBe(true)
  })

  it("two videos share one state", () => {
    const first = mount()
    const second = mount()

    act(() => {
      first.apiRef.current!.toggleMuted()
    })

    expect(first.el.muted).toBe(false)
    expect(second.el.muted).toBe(false)
  })
})
