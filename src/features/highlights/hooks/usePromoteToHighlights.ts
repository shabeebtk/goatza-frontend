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

import { useToast } from "@/shared/components/ui/Toast/Toast"
import { navigateAwayFromOverlays } from "@/shared/hooks/useBackToClose"
import { useNavigation } from "@/shared/services/navigation.service"
import { useCreateHighlight } from "./useHighlights"

export function usePromoteToHighlights() {
    const create = useCreateHighlight()
    const router = useRouter()
    const { toHighlightsManage } = useNavigation()
    const { show: showToast } = useToast()

    const promote = useCallback(
        (sourceMediaId: string, options?: { onDone?: () => void }) => {
            create.mutate(
                { source_media_id: sourceMediaId },
                {
                    onSuccess: () => {
                        showToast({
                            title: "Added to your highlights",
                            variant: "success",
                            // The viewer may still be open underneath; a plain
                            // push would leave its history entry behind.
                            action: {
                                label: "Manage",
                                onClick: () =>
                                    navigateAwayFromOverlays(toHighlightsManage(), router),
                            },
                        })
                        options?.onDone?.()
                    },
                    onError: () => options?.onDone?.(),
                }
            )
        },
        [create, router, toHighlightsManage, showToast]
    )

    return { promote, isPromoting: create.isPending }
}
