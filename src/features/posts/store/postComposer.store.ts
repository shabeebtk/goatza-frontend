import { create } from "zustand"

import type { PostVisibility } from "@/features/posts/services/posts.api"
import type { PlaceResult } from "@/shared/services/places.service"

/**
 * "Edit" on a post the upload queue could not publish: reopen the composer
 * with what the author wrote, so they can change what was refused (a clip
 * too long, a file the server would not take) instead of starting over.
 *
 * AppNav and OrgNav — whichever shell is mounted — open their own composer
 * while a draft is waiting here, and clear it when that composer closes.
 * No `persist`: the files are only in memory.
 */
export type PostComposerDraft = {
    content: string
    visibility: PostVisibility
    /** null: never touched — the actor's primary sport is preselected again. */
    sportId: string | null
    location: PlaceResult | null
    /** As they were posted (crops applied). */
    files: File[]
}

type PostComposerState = {
    draft: PostComposerDraft | null
    open: (draft: PostComposerDraft) => void
    clear: () => void
}

export const usePostComposerStore = create<PostComposerState>((set) => ({
    draft: null,
    open: (draft) => set({ draft }),
    clear: () => set({ draft: null }),
}))

/** Reopen the composer with `draft` — for the upload queue's Edit. */
export const reopenPostComposer = (draft: PostComposerDraft) =>
    usePostComposerStore.getState().open(draft)
