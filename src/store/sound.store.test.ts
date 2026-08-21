import { beforeEach, describe, expect, it } from "vitest"

import { useSoundStore } from "./sound.store"

describe("sound.store", () => {
  beforeEach(() => {
    useSoundStore.setState({ muted: true })
  })

  it("starts muted", () => {
    // Not a preference — autoplay policy blocks unmuted playback before a
    // gesture, and the server has to render the same value the client does.
    expect(useSoundStore.getState().muted).toBe(true)
  })

  it("toggles", () => {
    useSoundStore.getState().toggleMuted()
    expect(useSoundStore.getState().muted).toBe(false)

    useSoundStore.getState().toggleMuted()
    expect(useSoundStore.getState().muted).toBe(true)
  })

  it("forceMute always lands on muted", () => {
    useSoundStore.getState().setMuted(false)
    useSoundStore.getState().forceMute()
    expect(useSoundStore.getState().muted).toBe(true)

    // Already muted — still muted, and no new object.
    const before = useSoundStore.getState()
    useSoundStore.getState().forceMute()
    expect(useSoundStore.getState().muted).toBe(true)
    expect(useSoundStore.getState()).toBe(before)
  })

  it("setMuted with the current value does not produce a new state", () => {
    // This is what stops the element -> store sync in useVideoSound echoing
    // its own writes into a render loop.
    const before = useSoundStore.getState()
    useSoundStore.getState().setMuted(true)
    expect(useSoundStore.getState()).toBe(before)
  })

  it("is not persisted", async () => {
    // A persisted value would rehydrate to unmuted after a hard reload, which
    // both contradicts the requirement and mismatches the server's `muted`.
    useSoundStore.getState().setMuted(false)
    expect(
      Object.keys(globalThis.localStorage ?? {}).some((k) =>
        k.toLowerCase().includes("sound")
      )
    ).toBe(false)
  })
})
