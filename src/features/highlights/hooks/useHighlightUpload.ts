/**
 * useHighlightUpload — hand a picked clip to the background upload queue.
 *
 *   pick → validate (mime/size/90s, in the add modal) → Add → QueueTask →
 *   the modal closes; encode/upload/create run in the background
 *   (runHighlightUpload) while UploadScreen, or the pill once it is minimized,
 *   shows the progress.
 *
 * Failures, Retry and "Add without sound" live on that screen, not in a toast:
 * the modal that used to own them is long gone by the time they happen. The
 * clip stays in the task, in memory, so a retry never asks for it again.
 *
 * The one check that stays here is the 10-clip cap, on the rail the screen
 * already loaded plus any clip still on its way up. The server enforces the
 * cap regardless; asking first only saves a player the wasted upload.
 */

import { useCallback } from "react"

import { useNavigation } from "@/shared/services/navigation.service"
import { currentActorKey, enqueueUpload } from "@/shared/upload/uploadQueue"
import { useAuthStore } from "@/store/auth.store"
import { useUploadQueueStore, type QueueTask } from "@/store/uploadQueue.store"
import {
    runHighlightUpload,
    type HighlightDraft,
} from "../services/highlightUpload.service"
import { MAX_HIGHLIGHTS } from "../types"

/** The same sentence the server answers a full rail with. */
export const HIGHLIGHT_CAP_MESSAGE =
    `You already have ${MAX_HIGHLIGHTS} highlights. Delete one to add another.`

/** A clip in these states will take a slot once it lands. */
const IN_FLIGHT = new Set<QueueTask["status"]>([
    "preparing",
    "uploading",
    "publishing",
    "processing",
])

export function useHighlightUpload({ existingCount }: { existingCount: number }) {
    // Where the queue goes when the clip is up — the rail is at the top of the
    // profile. Read at Add, while the posting account is still the active one.
    const { toProfile } = useNavigation()
    const username = useAuthStore((s) => s.user?.username)

    /**
     * Queue the clip — or, when the rail has no room for it, say why and
     * queue nothing. Returns that sentence, or null once it is queued.
     */
    const start = useCallback(
        (draft: HighlightDraft): string | null => {
            const actorKey = currentActorKey()
            const onTheWay = useUploadQueueStore
                .getState()
                .tasks.filter(
                    (t) =>
                        t.kind === "highlight" &&
                        t.actorKey === actorKey &&
                        IN_FLIGHT.has(t.status)
                ).length
            if (existingCount + onTheWay >= MAX_HIGHLIGHTS) return HIGHLIGHT_CAP_MESSAGE

            enqueueUpload({
                kind: "highlight",
                label: draft.title ?? "",
                preview: { mediaType: "video" },
                previewFile: draft.file,
                destination: username
                    ? { href: toProfile(username), kind: "profile" }
                    : undefined,
                run: (ctx) => runHighlightUpload(draft, ctx),
            })
            return null
        },
        [existingCount, toProfile, username]
    )

    return { start }
}
