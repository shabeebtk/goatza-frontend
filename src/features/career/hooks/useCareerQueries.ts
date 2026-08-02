/**
 * React Query bindings for career history.
 *
 * Two audiences, two cache trees:
 *   - `careerKeys.list(userId)`            one person's history, read by anyone
 *   - `careerKeys.verificationRequests()`  the ACTING org's review queue
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
    addCareerFromApplicationApi,
    createCareerEntryApi,
    deleteCareerEntryApi,
    fetchUserCareerApi,
    fetchVerificationRequestsApi,
    getCareerErrorMessage,
    rejectCareerEntryApi,
    updateCareerEntryApi,
    verifyCareerEntryApi,
    type CareerFromApplicationPayload,
    type CreateCareerEntryPayload,
    type UpdateCareerEntryPayload,
} from "../services/career.api"
import type {
    CareerEntry,
    CareerList,
    CareerReviewTab,
    CareerVerificationRequestList,
} from "../types"

// ── Query keys ────────────────────────────────────────────────

export const careerKeys = {
    all: ["career"] as const,
    lists: () => ["career", "list"] as const,
    list: (userId: string) => ["career", "list", userId] as const,
    verificationRequestsAll: () => ["career", "verification-requests"] as const,
    /** Every tab of one org's review screen. */
    verificationRequests: (organizationId: string) =>
        ["career", "verification-requests", organizationId] as const,
    /** One tab. A decision moves a row BETWEEN tabs, so both get invalidated. */
    verificationTab: (organizationId: string, tab: CareerReviewTab) =>
        ["career", "verification-requests", organizationId, tab] as const,
}

/** Page size for the org review tabs. */
const REVIEW_PAGE_SIZE = 20

// ── Shared cache helpers ──────────────────────────────────────

const useOwnCareerKey = () => {
    const userId = useAuthStore((s) => s.user?.id)
    return {
        userId: userId ?? null,
        key: careerKeys.list(userId ?? ""),
    }
}

/**
 * An owner-side write can move an entry in or out of some org's review queue —
 * linking a club, or a material edit that knocks a verified entry back to
 * pending. We don't know which org from here, so the whole queue subtree is
 * invalidated rather than guessing.
 */
const invalidateVerificationQueues = (qc: QueryClient) => {
    qc.invalidateQueries({ queryKey: careerKeys.verificationRequestsAll() })
}

// ── One person's history ──────────────────────────────────────

/**
 * A user's career, in profile order (current first, then most recently ended).
 * `is_owner` on the response is the server's word on whether the requesting
 * actor may edit it — trust that over comparing ids locally, because acting as
 * an organization never counts as owning your own history.
 */
export const useUserCareer = (userId?: string | null) =>
    useQuery({
        queryKey: careerKeys.list(userId ?? ""),
        queryFn: () => fetchUserCareerApi(userId as string),
        enabled: Boolean(userId),
        staleTime: 1000 * 60 * 2,
    })

// ── Create ────────────────────────────────────────────────────

/**
 * Add an entry to the signed-in user's own history. The new entry is written
 * straight into the list cache so it appears without waiting for a refetch,
 * then the list is invalidated to pick up the server's ordering.
 */
export const useCreateCareerEntry = () => {
    const qc = useQueryClient()
    const { key } = useOwnCareerKey()

    return useMutation({
        mutationFn: (payload: CreateCareerEntryPayload) =>
            createCareerEntryApi(payload),

        onSuccess: (created) => {
            qc.setQueryData<CareerList>(key, (old) =>
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
            toast.error(getCareerErrorMessage(err))
        },

        onSettled: () => {
            qc.invalidateQueries({ queryKey: key })
            // Linking a club puts the entry into that club's queue.
            invalidateVerificationQueues(qc)
        },
    })
}

// ── Update ────────────────────────────────────────────────────

/**
 * Edit one of the signed-in user's entries.
 *
 * Not optimistic on `verification_status`: a material edit silently moves a
 * verified entry back to `pending` server-side, and guessing that here would
 * mean showing the wrong badge whenever the guess is off. The server's answer
 * is written into the cache on success instead.
 */
export const useUpdateCareerEntry = () => {
    const qc = useQueryClient()
    const { key } = useOwnCareerKey()

    return useMutation({
        mutationFn: ({
            entryId,
            payload,
        }: {
            entryId: string
            payload: UpdateCareerEntryPayload
        }) => updateCareerEntryApi(entryId, payload),

        onSuccess: (updated) => {
            qc.setQueryData<CareerList>(key, (old) =>
                old
                    ? {
                        ...old,
                        results: old.results.map((entry) =>
                            entry.id === updated.id ? updated : entry
                        ),
                    }
                    : old
            )
        },

        onError: (err) => {
            toast.error(getCareerErrorMessage(err))
        },

        onSettled: () => {
            qc.invalidateQueries({ queryKey: key })
            invalidateVerificationQueues(qc)
        },
    })
}

// ── Delete ────────────────────────────────────────────────────

/** Hard delete, so the optimistic removal is the final state on success. */
export const useDeleteCareerEntry = () => {
    const qc = useQueryClient()
    const { key } = useOwnCareerKey()

    return useMutation({
        mutationFn: (entryId: string) => deleteCareerEntryApi(entryId),

        onMutate: async (entryId) => {
            await qc.cancelQueries({ queryKey: key })
            const prev = qc.getQueryData<CareerList>(key)

            qc.setQueryData<CareerList>(key, (old) =>
                old
                    ? {
                        ...old,
                        count: Math.max(0, old.count - 1),
                        results: old.results.filter((entry) => entry.id !== entryId),
                    }
                    : old
            )

            return { prev }
        },

        onError: (err, _entryId, ctx) => {
            if (ctx?.prev) qc.setQueryData(key, ctx.prev)
            toast.error(getCareerErrorMessage(err))
        },

        onSettled: () => {
            qc.invalidateQueries({ queryKey: key })
            // A deleted entry drops out of whichever queue it was sitting in.
            invalidateVerificationQueues(qc)
        },
    })
}

// ── Recruitment integration ───────────────────────────────────

/**
 * Turn a selected application into a career entry.
 *
 * Idempotent server-side, so the caller may fire it without checking first —
 * `created` on the result says whether an entry was made or an existing one
 * handed back, which is a toast-copy decision rather than a retry decision.
 */
export const useAddCareerFromApplication = () => {
    const qc = useQueryClient()
    const { key } = useOwnCareerKey()

    return useMutation({
        mutationFn: ({
            applicationId,
            payload,
        }: {
            applicationId: string
            payload?: CareerFromApplicationPayload
        }) => addCareerFromApplicationApi(applicationId, payload),

        onSuccess: ({ entry, created }) => {
            if (!created) return

            qc.setQueryData<CareerList>(key, (old) =>
                old
                    ? {
                        ...old,
                        count: old.count + 1,
                        results: [entry, ...old.results],
                    }
                    : old
            )
        },

        onError: (err) => {
            toast.error(getCareerErrorMessage(err))
        },

        onSettled: () => {
            qc.invalidateQueries({ queryKey: key })
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

/**
 * The acting organization's pending review queue.
 *
 * Disabled unless an org is the active actor: the endpoint 403s for a user
 * actor, and firing it just to collect a rejection would put an error toast in
 * front of someone who simply hasn't switched accounts. A COACH/STAFF member
 * still gets a 403 — that one IS worth surfacing, because they are on the right
 * account and just lack the role.
 */
export const useVerificationRequests = (
    tab: CareerReviewTab = "pending",
    options?: { enabled?: boolean }
) => {
    const organizationId = useActingOrganizationId()

    return useInfiniteQuery<CareerVerificationRequestList, Error>({
        queryKey: careerKeys.verificationTab(organizationId ?? "", tab),
        queryFn: ({ pageParam }) =>
            fetchVerificationRequestsApi({
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
 * Shared by verify and reject: both take the entry out of the queue and both
 * change what the claimant's own profile shows.
 *
 * `userId` is the claimant, read off the queue row (`request.user.id`). It is
 * only used to refresh their cached history — the server identifies the entry
 * by id alone.
 */
export type ReviewDecisionVariables = {
    entryId: string
    userId?: string
    /** Which tab the row was actioned from, so the right cache is trimmed. */
    tab?: CareerReviewTab
}

export type RejectDecisionVariables = ReviewDecisionVariables & {
    /** Short note for the player; reaches them on the notification. */
    reason?: string
}

/** The infinite-query cache shape for one review tab. */
type ReviewPages = {
    pages: CareerVerificationRequestList[]
    pageParams: unknown[]
}

type QueueSnapshot = { prev?: ReviewPages }

const useReviewDecision = <V extends ReviewDecisionVariables>(
    mutationFn: (variables: V) => Promise<CareerEntry>
) => {
    const qc = useQueryClient()
    const organizationId = useActingOrganizationId()
    const orgKey = careerKeys.verificationRequests(organizationId ?? "")

    return useMutation<CareerEntry, Error, V, QueueSnapshot>({
        mutationFn,

        onMutate: async ({ entryId, tab = "pending" }) => {
            const tabKey = careerKeys.verificationTab(organizationId ?? "", tab)
            await qc.cancelQueries({ queryKey: tabKey })
            const prev = qc.getQueryData<ReviewPages>(tabKey)

            // A decided entry leaves the tab it was in immediately — a reviewer
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
                                (request) => request.id !== entryId
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
                    careerKeys.verificationTab(
                        organizationId ?? "",
                        variables.tab ?? "pending"
                    ),
                    ctx.prev
                )
            }
            toast.error(getCareerErrorMessage(err))
        },

        onSettled: (_data, _err, variables) => {
            // BOTH tabs: a decision moves the row from one to the other, and
            // reversing a decision moves it back.
            qc.invalidateQueries({ queryKey: orgKey })
            // It also changes the badge on the claimant's own profile.
            if (variables?.userId) {
                qc.invalidateQueries({
                    queryKey: careerKeys.list(variables.userId),
                })
            }
        },
    })
}

/** Confirm a claim. Owner/admin only — the server enforces it. */
export const useVerifyCareerEntry = () =>
    useReviewDecision<ReviewDecisionVariables>(({ entryId }) =>
        verifyCareerEntryApi(entryId)
    )

/**
 * Decline a claim, with an optional short note that reaches the player on the
 * notification. The entry is not deleted; it stays on their profile marked
 * rejected and comes back here if they edit it.
 */
export const useRejectCareerEntry = () =>
    useReviewDecision<RejectDecisionVariables>(({ entryId, reason }) =>
        rejectCareerEntryApi(entryId, { reason })
    )
