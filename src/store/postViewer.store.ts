import { create } from "zustand"

/**
 * Where the full-screen viewer left each post: the slide that was on screen
 * when it closed, keyed by post id.
 *
 * The list underneath lands on that post (landOnPost) and its inline
 * MediaCarousel picks up the SAME slide from here, so closing on the third
 * photo shows the third photo. Module-level and unpersisted, like the sound
 * store: it only has to outlive the viewer, and a reload starts every
 * carousel at its first slide anyway.
 *
 * Cards subscribe to their own key only — one landing re-renders one card.
 */
/** A fresh object per landing, so landing on the same slide twice still reads as a change. */
export type Landing = { slide: number }

type PostViewerState = {
  landings: Record<string, Landing>
  /** Record where the viewer closed on `postId`. */
  land: (postId: string, slide: number) => void
  /**
   * A viewer is on screen. Inline feed videos pause on this — the viewer
   * plays its own copy, and one video at a time is the rule.
   */
  open: boolean
  setOpen: (open: boolean) => void
}

export const usePostViewerStore = create<PostViewerState>((set) => ({
  landings: {},
  land: (postId, slide) =>
    set((state) => ({ landings: { ...state.landings, [postId]: { slide } } })),
  open: false,
  setOpen: (open) => set((state) => (state.open === open ? state : { open })),
}))
