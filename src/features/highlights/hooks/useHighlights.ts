/**
 * React Query bindings for the highlights rail.
 *
 * Writes are always for the LOGGED-IN player (the API allows nothing else), so
 * the mutations resolve their own cache key from the auth store instead of
 * making every caller pass a username around.
 *
 * Optimistic where the spec asks for instant feedback (§3): a drag reorders the
 * rail on drop, a delete removes the tile at once, an edit shows the new title
 * immediately — each snapshotted and rolled back if the server disagrees.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { profileKeys } from "@/features/profile/hooks/useProfileQueries"
import { useAuthStore } from "@/store/auth.store"
import {
    createHighlightApi,
    fetchHighlightStatsApi,
    fetchHighlightsByUsernameApi,
    getHighlightErrorMessage,
    removeHighlightApi,
    reorderHighlightsApi,
    updateHighlightApi,
    type CreateHighlightPayload,
    type UpdateHighlightPayload,
} from "../services/highlights.api"
import type { Highlight, HighlightsList } from "../types"

// ── Query keys ────────────────────────────────────────────────

export const highlightKeys = {
    all: ["highlights"] as const,
    list: (username: string) => ["highlights", "list", username] as const,
    stats: () => ["highlights", "stats"] as const,
}

// ── List ──────────────────────────────────────────────────────

/**
 * The rail as the CURRENT actor may see it — the server filters by visibility,
 * so switching actors must not reuse a cached list. React Query keys on the
 * username only, so `useHighlights` is scoped per profile and the whole
 * `highlights` tree is invalidated on actor switch by the caller's page.
 */
/**
 * Pass null to disable — the public profile already has the rail from its
 * server render, and this endpoint is IsAuthenticated.
 */
export const useHighlights = (username?: string | null) =>
    useQuery({
        queryKey: highlightKeys.list(username ?? ""),
        queryFn: () => fetchHighlightsByUsernameApi(username as string),
        enabled: Boolean(username),
        staleTime: 1000 * 60 * 2,
    })

// ── Stats (owner only) ────────────────────────────────────────

/**
 * The signed-in player's reel analytics — per-clip views and "Seen by N
 * recruiters". Only fetched where it is shown (the manage screen), so nobody
 * pays for it while browsing.
 */
export const useHighlightStats = (options?: { enabled?: boolean }) =>
    useQuery({
        queryKey: highlightKeys.stats(),
        queryFn: fetchHighlightStatsApi,
        enabled: options?.enabled ?? true,
        staleTime: 1000 * 60,
    })

// ── Shared cache helpers ──────────────────────────────────────

/**
 * The profile chip's `highlights_count` and the manage screen's totals both move
 * with the rail — refresh them whenever a clip is added or removed.
 */
const invalidateProfileChip = (qc: QueryClient, username: string) => {
    qc.invalidateQueries({ queryKey: profileKeys.user(username) })
    qc.invalidateQueries({ queryKey: profileKeys.me() })
    qc.invalidateQueries({ queryKey: highlightKeys.stats() })
}

const useOwnRailKey = () => {
    const username = useAuthStore((s) => s.user?.username)
    return {
        username: username ?? null,
        key: highlightKeys.list(username ?? ""),
    }
}

// ── Create ────────────────────────────────────────────────────

/**
 * Create in either mode (direct upload or promote-from-post). The new clip is
 * written straight into the rail cache so it appears without waiting for a
 * refetch, then the list is invalidated to pick up server truth.
 */
export const useCreateHighlight = () => {
    const qc = useQueryClient()
    const { username, key } = useOwnRailKey()

    return useMutation({
        mutationFn: (payload: CreateHighlightPayload) => createHighlightApi(payload),
        onSuccess: (created) => {
            qc.setQueryData<HighlightsList>(key, (old) =>
                old
                    ? {
                        ...old,
                        count: old.count + 1,
                        results: [...old.results, created],
                    }
                    : old
            )
        },
        onError: (err) => {
            toast.error(getHighlightErrorMessage(err))
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: key })
            if (username) invalidateProfileChip(qc, username)
        },
    })
}

// ── Update (title / visibility) ───────────────────────────────

export const useUpdateHighlight = () => {
    const qc = useQueryClient()
    const { key } = useOwnRailKey()

    return useMutation({
        mutationFn: ({
            highlightId,
            payload,
        }: {
            highlightId: string
            payload: UpdateHighlightPayload
        }) => updateHighlightApi(highlightId, payload),

        onMutate: async ({ highlightId, payload }) => {
            await qc.cancelQueries({ queryKey: key })
            const prev = qc.getQueryData<HighlightsList>(key)

            qc.setQueryData<HighlightsList>(key, (old) =>
                old
                    ? {
                        ...old,
                        results: old.results.map((h) =>
                            h.id === highlightId ? { ...h, ...payload } : h
                        ),
                    }
                    : old
            )

            return { prev }
        },

        onSuccess: (updated) => {
            qc.setQueryData<HighlightsList>(key, (old) =>
                old
                    ? {
                        ...old,
                        results: old.results.map((h) =>
                            h.id === updated.id ? updated : h
                        ),
                    }
                    : old
            )
        },

        onError: (err, _vars, ctx) => {
            if (ctx?.prev) qc.setQueryData(key, ctx.prev)
            toast.error(getHighlightErrorMessage(err))
        },

        onSettled: () => {
            qc.invalidateQueries({ queryKey: key })
        },
    })
}

// ── Reorder ───────────────────────────────────────────────────

/**
 * Drag-to-reorder. Send the WHOLE rail: the server rejects a partial list
 * outright, so a dropped tile can never half-apply.
 */
export const useReorderHighlights = () => {
    const qc = useQueryClient()
    const { key } = useOwnRailKey()

    return useMutation({
        mutationFn: (orderedIds: string[]) => reorderHighlightsApi(orderedIds),

        onMutate: async (orderedIds) => {
            await qc.cancelQueries({ queryKey: key })
            const prev = qc.getQueryData<HighlightsList>(key)

            qc.setQueryData<HighlightsList>(key, (old) => {
                if (!old) return old

                const byId = new Map(old.results.map((h) => [h.id, h]))
                const reordered: Highlight[] = []

                orderedIds.forEach((id, index) => {
                    const clip = byId.get(id)
                    if (clip) {
                        reordered.push({ ...clip, order: index })
                        byId.delete(id)
                    }
                })

                // Anything the caller didn't mention keeps its place at the end
                // rather than vanishing from the rail mid-drag.
                return { ...old, results: [...reordered, ...byId.values()] }
            })

            return { prev }
        },

        onSuccess: (results) => {
            qc.setQueryData<HighlightsList>(key, (old) =>
                old ? { ...old, count: results.length, results } : old
            )
        },

        onError: (err, _vars, ctx) => {
            if (ctx?.prev) qc.setQueryData(key, ctx.prev)
            toast.error(getHighlightErrorMessage(err))
        },

        onSettled: () => {
            qc.invalidateQueries({ queryKey: key })
        },
    })
}

// ── Delete (soft) ─────────────────────────────────────────────

export const useDeleteHighlight = () => {
    const qc = useQueryClient()
    const { username, key } = useOwnRailKey()

    return useMutation({
        mutationFn: (highlightId: string) => removeHighlightApi(highlightId),

        onMutate: async (highlightId) => {
            await qc.cancelQueries({ queryKey: key })
            const prev = qc.getQueryData<HighlightsList>(key)

            qc.setQueryData<HighlightsList>(key, (old) =>
                old
                    ? {
                        ...old,
                        count: Math.max(0, old.count - 1),
                        results: old.results.filter((h) => h.id !== highlightId),
                    }
                    : old
            )

            return { prev }
        },

        onError: (err, _vars, ctx) => {
            if (ctx?.prev) qc.setQueryData(key, ctx.prev)
            toast.error(getHighlightErrorMessage(err))
        },

        onSettled: () => {
            qc.invalidateQueries({ queryKey: key })
            if (username) invalidateProfileChip(qc, username)
        },
    })
}
