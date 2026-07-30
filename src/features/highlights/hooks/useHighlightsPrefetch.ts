/**
 * Warm a player's highlight list (and its first poster) before it is needed.
 *
 * Used by the chip on hover / press-start and by the pipeline viewer to stage
 * the next applicant while the current one is being watched, so opening a reel
 * shows frames instead of a spinner (HIGHLIGHTS_SPEC.md §3 performance).
 */

import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { fetchHighlightsByUsernameApi } from "../services/highlights.api"
import { highlightKeys } from "./useHighlights"

export function useHighlightsPrefetch() {
    const queryClient = useQueryClient()

    /**
     * Cheap and idempotent: React Query skips the fetch when the entry is still
     * fresh, so hovering a row repeatedly costs nothing.
     */
    const prefetchHighlights = useCallback(
        (username?: string | null, options?: { withFirstThumbnail?: boolean }) => {
            if (!username) return

            void queryClient
                .prefetchQuery({
                    queryKey: highlightKeys.list(username),
                    queryFn: () => fetchHighlightsByUsernameApi(username),
                    staleTime: 1000 * 60 * 2,
                })
                .then(() => {
                    if (!options?.withFirstThumbnail) return
                    const cached = queryClient.getQueryData(
                        highlightKeys.list(username)
                    ) as { results?: { thumbnail_url?: string }[] } | undefined
                    const first = cached?.results?.[0]?.thumbnail_url
                    if (!first) return
                    // Decode the poster too — the viewer's first paint is an image.
                    const img = new Image()
                    img.src = first
                })
        },
        [queryClient]
    )

    return { prefetchHighlights }
}
