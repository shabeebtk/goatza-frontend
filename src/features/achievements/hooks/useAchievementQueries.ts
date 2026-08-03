/**
 * React Query bindings for achievements.
 *
 * Two audiences, two cache trees — the same split careers uses:
 *   - `achievementKeys.list(userId)`            one person's shelf, read by anyone
 *   - `achievementKeys.verificationRequests()`  the ACTING org's review queue
 *
 * The org queue is keyed by the acting org id, not just by "verification
 * requests": the same person can hold two clubs in the AccountSwitcher, and one
 * club's queue must never be served from the other's cache.
 *
 * Writes are always for the LOGGED-IN user (the API allows nothing else), so
 * the owner mutations resolve their own cache key from the auth store instead
 * of making every caller pass an id around.
 *
 * Error toasts use the shared sonner + getApiErrorMessage pattern; success
 * toasts are left to the calling component, which knows the context the message
 * should read in.
 */

import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
} from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { useAuthStore } from "@/store/auth.store"
import {
    createAchievementApi,
    deleteAchievementApi,
    fetchAchievementVerificationRequestsApi,
    fetchUserAchievementsApi,
    getAchievementErrorMessage,
    rejectAchievementApi,
    updateAchievementApi,
    verifyAchievementApi,
    type CreateAchievementPayload,
    type UpdateAchievementPayload,
} from "../services/achievement.api"
import type {
    AchievementList,
    AchievementReviewTab,
    AchievementVerificationRequestList,
} from "../types"

// ── Query keys ────────────────────────────────────────────────

export const achievementKeys = {
    all: ["achievements"] as const,
    lists: () => ["achievements", "list"] as const,
    list: (userId: string) => ["achievements", "list", userId] as const,
    verificationRequestsAll: () =>
        ["achievements", "verification-requests"] as const,
    /** Every tab of one org's review screen. */
    verificationRequests: (organizationId: string) =>
        ["achievements", "verification-requests", organizationId] as const,
    /** One tab. A decision moves a row BETWEEN tabs, so both get invalidated. */
    verificationTab: (organizationId: string, tab: AchievementReviewTab) =>
        ["achievements", "verification-requests", organizationId, tab] as const,
}

// ── Shared cache helpers ──────────────────────────────────────

const useOwnAchievementsKey = () => {
    const userId = useAuthStore((s) => s.user?.id)
    return {
        userId: userId ?? null,
        key: achievementKeys.list(userId ?? ""),
    }
}

/**
 * An owner-side write can move an achievement in or out of some org's review
 * queue — linking an issuer, or a material edit that knocks a verified award
 * back to pending. We don't know which org from here, so the whole queue
 * subtree is invalidated rather than guessing.
 */
const invalidateVerificationQueues = (qc: QueryClient) => {
    qc.invalidateQueries({
        queryKey: achievementKeys.verificationRequestsAll(),
    })
}

// ── One person's shelf ────────────────────────────────────────

/**
 * A user's achievements, in profile order (pinned first, then most recently
 * achieved). `is_owner` on the response is the server's word on whether the
 * requesting actor may edit them — trust that over comparing ids locally,
 * because acting as an organization never counts as owning your own profile.
 */
export const useUserAchievements = (userId?: string | null) =>
    useQuery({
        queryKey: achievementKeys.list(userId ?? ""),
        queryFn: () => fetchUserAchievementsApi(userId as string),
        enabled: Boolean(userId),
        staleTime: 1000 * 60 * 2,
    })

// ── Create ────────────────────────────────────────────────────

/**
 * Add an achievement to the signed-in user's own shelf. The new row is written
 * straight into the list cache so it appears without waiting for a refetch,
 * then the list is invalidated to pick up the server's ordering — which matters
 * more here than it does for careers, because a pinned award jumps to the top.
 */
export const useCreateAchievement = () => {
    const qc = useQueryClient()
    const { key } = useOwnAchievementsKey()

    return useMutation({
        mutationFn: (payload: CreateAchievementPayload) =>
            createAchievementApi(payload),

        onSuccess: (created) => {
            qc.setQueryData<AchievementList>(key, (old) =>
                old
                    ? {
                        ...old,
                        count: old.count + 1,
                        results: [created, ...old.results],
                    }
                    : old
            )
        },

        onError: (err) => {
            toast.error(getAchievementErrorMessage(err))
        },

        onSettled: () => {
            qc.invalidateQueries({ queryKey: key })
            // Linking an issuer puts the award into that org's queue.
            invalidateVerificationQueues(qc)
        },
    })
}

// ── Update ────────────────────────────────────────────────────

/**
 * Edit one of the signed-in user's achievements. Also the pin/unpin path —
 * there is no separate endpoint, `{ is_pinned }` is the whole request.
 *
 * Not optimistic on `verification_status`: a material edit silently moves a
 * verified award back to `pending` server-side, and guessing that here would
 * mean showing the wrong badge whenever the guess is off. The server's answer
 * is written into the cache on success instead.
 */
export const useUpdateAchievement = () => {
    const qc = useQueryClient()
    const { key } = useOwnAchievementsKey()

    return useMutation({
        mutationFn: ({
            achievementId,
            payload,
        }: {
            achievementId: string
            payload: UpdateAchievementPayload
        }) => updateAchievementApi(achievementId, payload),

        onSuccess: (updated) => {
            qc.setQueryData<AchievementList>(key, (old) =>
                old
                    ? {
                        ...old,
                        results: old.results.map((achievement) =>
                            achievement.id === updated.id ? updated : achievement
                        ),
                    }
                    : old
            )
        },

        onError: (err) => {
            toast.error(getAchievementErrorMessage(err))
        },

        onSettled: () => {
            qc.invalidateQueries({ queryKey: key })
            invalidateVerificationQueues(qc)
        },
    })
}

// ── Delete ────────────────────────────────────────────────────

/** Hard delete, so the optimistic removal is the final state on success. */
export const useDeleteAchievement = () => {
    const qc = useQueryClient()
    const { key } = useOwnAchievementsKey()

    return useMutation({
        mutationFn: (achievementId: string) =>
            deleteAchievementApi(achievementId),

        onMutate: async (achievementId) => {
            await qc.cancelQueries({ queryKey: key })
            const prev = qc.getQueryData<AchievementList>(key)

            qc.setQueryData<AchievementList>(key, (old) =>
                old
                    ? {
                        ...old,
                        count: Math.max(0, old.count - 1),
                        results: old.results.filter(
                            (achievement) => achievement.id !== achievementId
                        ),
                    }
                    : old
            )

            return { prev }
        },

        onError: (err, _achievementId, ctx) => {
            if (ctx?.prev) qc.setQueryData(key, ctx.prev)
            toast.error(getAchievementErrorMessage(err))
        },

        onSettled: () => {
            qc.invalidateQueries({ queryKey: key })
            // A deleted award drops out of whichever queue it was sitting in.
            invalidateVerificationQueues(qc)
        },
    })
}

// ── Org review queue ──────────────────────────────────────────

/**
 * The org currently being acted as, or null.
 *
 * Exported because a disabled query is indistinguishable from an empty one:
 * with `enabled: false` React Query reports `isLoading: false`, no error and
 * no data, which a naive page renders as "nothing pending". Callers need to
 * know the difference between "no requests" and "not acting as an org".
 */
export const useActingOrganizationId = () => {
    const actorType = useAuthStore((s) => s.actorType)
    const actorId = useAuthStore((s) => s.actorId)
    return actorType === "organization" ? actorId : null
}

/** Page size for the org review tabs. */
const REVIEW_PAGE_SIZE = 20

/**
 * The acting organization's achievement review queue.
 *
 * Disabled unless an org is the active actor: the endpoint 403s for a user
 * actor, and firing it just to collect a rejection would put an error toast in
 * front of someone who simply hasn't switched accounts. A COACH/STAFF member
 * still gets a 403 — that one IS worth surfacing, because they are on the right
 * account and just lack the role.
 */
export const useAchievementVerificationRequests = (
    tab: AchievementReviewTab = "pending",
    options?: { enabled?: boolean }
) => {
    const organizationId = useActingOrganizationId()

    return useInfiniteQuery<AchievementVerificationRequestList, Error>({
        queryKey: achievementKeys.verificationTab(organizationId ?? "", tab),
        queryFn: ({ pageParam }) =>
            fetchAchievementVerificationRequestsApi({
                status: tab,
                limit: REVIEW_PAGE_SIZE,
                offset: pageParam as number,
            }),
        initialPageParam: 0,
        getNextPageParam: (lastPage) =>
            lastPage.has_more
                ? lastPage.offset + lastPage.results.length
                : undefined,
        enabled: Boolean(organizationId) && (options?.enabled ?? true),
        staleTime: 1000 * 60,
    })
}

/**
 * Shared by verify and reject: both take the achievement out of the queue and
 * both change what the claimant's own profile shows.
 *
 * `userId` is the claimant, read off the queue row (`request.user.id`). It is
 * only used to refresh their cached shelf — the server identifies the row by id
 * alone.
 */
export type AchievementDecisionVariables = {
    achievementId: string
    userId?: string
    /** Which tab the row was actioned from, so the right cache is trimmed. */
    tab?: AchievementReviewTab
}

export type AchievementRejectVariables = AchievementDecisionVariables & {
    /** Short note for the owner; reaches them on the notification. */
    reason?: string
}

/** The infinite-query cache shape for one review tab. */
type ReviewPages = {
    pages: AchievementVerificationRequestList[]
    pageParams: unknown[]
}

type QueueSnapshot = { prev?: ReviewPages }

const useAchievementDecision = <V extends AchievementDecisionVariables>(
    mutationFn: (variables: V) => Promise<unknown>
) => {
    const qc = useQueryClient()
    const organizationId = useActingOrganizationId()
    const orgKey = achievementKeys.verificationRequests(organizationId ?? "")

    return useMutation<unknown, Error, V, QueueSnapshot>({
        mutationFn,

        onMutate: async ({ achievementId, tab = "pending" }) => {
            const tabKey = achievementKeys.verificationTab(
                organizationId ?? "",
                tab
            )
            await qc.cancelQueries({ queryKey: tabKey })
            const prev = qc.getQueryData<ReviewPages>(tabKey)

            // A decided row leaves the tab it was in immediately — a reviewer
            // working down a list shouldn't watch the row they just actioned
            // sit there. It reappears in the other tab on the refetch below.
            qc.setQueryData<ReviewPages>(tabKey, (old) =>
                old
                    ? {
                        ...old,
                        pages: old.pages.map((page) => ({
                            ...page,
                            count: Math.max(0, page.count - 1),
                            results: page.results.filter(
                                (request) => request.id !== achievementId
                            ),
                        })),
                    }
                    : old
            )

            return { prev }
        },

        onError: (err, variables, ctx) => {
            if (ctx?.prev) {
                qc.setQueryData(
                    achievementKeys.verificationTab(
                        organizationId ?? "",
                        variables.tab ?? "pending"
                    ),
                    ctx.prev
                )
            }
            toast.error(getAchievementErrorMessage(err))
        },

        onSettled: (_data, _err, variables) => {
            // BOTH tabs: a decision moves the row from one to the other, and
            // reversing a decision moves it back.
            qc.invalidateQueries({ queryKey: orgKey })
            // It also changes the badge on the claimant's own profile.
            if (variables?.userId) {
                qc.invalidateQueries({
                    queryKey: achievementKeys.list(variables.userId),
                })
            }
        },
    })
}

/** Confirm a claim. Owner/admin only — the server enforces it. */
export const useVerifyAchievement = () =>
    useAchievementDecision<AchievementDecisionVariables>(({ achievementId }) =>
        verifyAchievementApi(achievementId)
    )

/**
 * Decline a claim, with an optional short note that reaches the owner on the
 * notification. The achievement is not deleted; it stays on their profile
 * marked rejected and comes back here if they edit it.
 */
export const useRejectAchievement = () =>
    useAchievementDecision<AchievementRejectVariables>(
        ({ achievementId, reason }) => rejectAchievementApi(achievementId, { reason })
    )
