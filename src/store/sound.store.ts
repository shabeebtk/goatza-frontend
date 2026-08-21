import { create } from "zustand"

/**
 * ONE mute state for every <video> in the app.
 *
 * Mute used to be per-component, with four different defaults — unmuting a
 * feed video and scrolling to the next re-muted, and the lightbox opened with
 * sound while the tile behind it was silent. Every surface now reads and
 * writes this store through `useVideoSound`.
 *
 * NO `persist` middleware, deliberately:
 *
 *  - A module-level store already survives App Router client-side navigation
 *    (feed → profile → feed keeps the state), which is the requirement.
 *  - It resets to muted on hard reload, which is ALSO the requirement — and
 *    the only achievable behaviour anyway, since autoplay policy blocks
 *    unmuted playback until the page has seen a user gesture.
 *  - Persisting would mean the server renders `muted` and the client rehydrates
 *    to `unmuted`, i.e. a hydration mismatch on a value that must render muted
 *    on the server regardless.
 */
type SoundState = {
  muted: boolean
  setMuted: (v: boolean) => void
  toggleMuted: () => void
  /**
   * Called when the browser refuses unmuted playback. Forces the global state
   * back to muted so every other video's icon tells the truth — without this,
   * one blocked autoplay leaves the rest of the app claiming sound is on.
   */
  forceMute: () => void
}

export const useSoundStore = create<SoundState>((set) => ({
  // Always muted at first paint. See the note above.
  muted: true,

  // No-op when the value already matches, so the element→store sync in
  // useVideoSound cannot start a render loop by echoing what it just applied.
  setMuted: (v) => set((state) => (state.muted === v ? state : { muted: v })),

  toggleMuted: () => set((state) => ({ muted: !state.muted })),

  forceMute: () => set((state) => (state.muted ? state : { muted: true })),
}))
