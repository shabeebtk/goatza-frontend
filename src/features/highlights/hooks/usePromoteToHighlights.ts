/**
 * usePromoteToHighlights — "Add to Highlights" from one of the player's own
 * video posts (HIGHLIGHTS_SPEC.md §3).
 *
 * The server copies the media fields off the PostMedia row, so the clip outlives
 * the post. Success gets an inline "Manage" action that lands the player on
 * their own manage sheet; failures (including the 10-clip cap) already toast
 * inside `useCreateHighlight` with the server's own wording.
 */

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { useNavigation } from "@/shared/services/navigation.service"
import { useCreateHighlight } from "./useHighlights"

export function usePromoteToHighlights() {
    const create = useCreateHighlight()
    const router = useRouter()
    const { toHighlightsManage } = useNavigation()

    const promote = useCallback(
        (sourceMediaId: string, options?: { onDone?: () => void }) => {
            create.mutate(
                { source_media_id: sourceMediaId },
                {
                    onSuccess: () => {
                        toast.success("Added to your highlights", {
                            action: {
                                label: "Manage",
                                onClick: () => router.push(toHighlightsManage()),
                            },
                        })
                        options?.onDone?.()
                    },
                    onError: () => options?.onDone?.(),
                }
            )
        },
        [create, router, toHighlightsManage]
    )

    return { promote, isPromoting: create.isPending }
}
