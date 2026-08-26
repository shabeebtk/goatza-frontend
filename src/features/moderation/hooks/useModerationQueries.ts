import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query"

import { useToast } from "@/shared/components/ui/Toast/Toast"

import type { FeedListResponse } from "@/features/feed/api/feed.api"
import { feedKeys } from "@/features/feed/hooks/useFeedQueries"
import { exploreKeys } from "@/features/explore/hooks/useExploreQueries"
import { orgKeys } from "@/features/organization/hooks/useOrganizations"
import { profileKeys } from "@/features/profile/hooks/useProfileQueries"
import {
  blockApi,
  fetchBlockedListApi,
  unblockApi,
  type BlockedListResponse,
  type BlockPayload,
  type BlockTargetType,
} from "../services/moderation.api"

// ── Query keys ───────────────────────────────────────────────

export const moderationKeys = {
  all: () => ["moderation"] as const,
  blocked: () => ["moderation", "blocked"] as const,
}

const LIMIT = 20

// ── Cache invalidation ───────────────────────────────────────

/**
 * What a block/unblock changes, and therefore what has to be refetched.
 *
 * Blocking is the widest-reaching write in the app: it tears down the follow
 * graph in BOTH directions and removes the pair from every listing surface. So
 * this is deliberately broad — feed, explore and the profile all shift, and a
 * stale card for someone you just blocked is the one thing the feature
 * promises will not happen.
 *
 * `username` is optional because a block can be fired from a post menu, where
 * only the id is to hand; the profile query is keyed by handle, so it is only
 * invalidated when we actually know it.
 */
type InvalidateArgs = {
  targetType: BlockTargetType
  targetId: string
  username?: string
  /**
   * Filter the author's posts out of the feed cache before refetching.
   * BLOCK only — on unblock the same filter would briefly strip cards that the
   * refetch is about to restore, which reads as a flicker in the wrong
   * direction.
   */
  dropFromFeed?: boolean
}

/**
 * Drop every post by a just-blocked author out of the feed cache, in place.
 *
 * The invalidation below refetches the feed and would remove them anyway — but
 * a refetch is a round trip, and blocking someone from their own post and then
 * watching that post sit there is the exact moment the feature has to feel
 * instant. This runs first so the cards are gone on the same frame; the
 * refetch that follows is what makes it true.
 *
 * Every actor's feed tree is walked, not just the active one: a person and the
 * clubs they run have separate feed caches, and a block applies to whichever
 * identity made it.
 */
const dropAuthorFromFeeds = (
  qc: ReturnType<typeof useQueryClient>,
  targetId: string
) => {
  qc.setQueriesData<InfiniteData<FeedListResponse>>(
    { queryKey: feedKeys.lists() },
    (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              results: page.results.filter(
                (post) => post.author?.id !== targetId
              ),
            })),
          }
        : old
  )
}

const invalidateAfterBlockChange = (
  qc: ReturnType<typeof useQueryClient>,
  { targetType, targetId, username, dropFromFeed = false }: InvalidateArgs
) => {
  // The target's profile — carries is_blocked_by_me AND the embedded
  // `relationship` block state the Follow/Message buttons read, so one
  // invalidation covers both.
  if (username) {
    qc.invalidateQueries({ queryKey: profileKeys.user(username) })
  }
  if (targetType === "organization") {
    qc.invalidateQueries({ queryKey: orgKeys.detail(targetId) })
  }

  // Listing surfaces the pair must disappear from / reappear in. On a block
  // the feed is filtered in place FIRST, so the change is visible before the
  // refetch lands.
  if (dropFromFeed) dropAuthorFromFeeds(qc, targetId)
  qc.invalidateQueries({ queryKey: feedKeys.all })
  qc.invalidateQueries({ queryKey: exploreKeys.all })

  // Settings → Blocked accounts.
  qc.invalidateQueries({ queryKey: moderationKeys.blocked() })
}

// ── Mutations ────────────────────────────────────────────────

type BlockVars = BlockPayload & {
  /** Handle, when the caller has it — used for the profile query key + copy. */
  username?: string
}

/**
 * Block an account. Server-side this is idempotent, so a double-tap on a stale
 * toggle is a success rather than a 400 the UI would have to explain.
 */
export const useBlock = () => {
  const qc = useQueryClient()
  const toast = useToast()

  return useMutation({
    // `username` is carried for cache keys + copy only; the wire body is
    // exactly the two fields the endpoint takes.
    mutationFn: (vars: BlockVars) =>
      blockApi({ target_type: vars.target_type, target_id: vars.target_id }),

    onSuccess: (_data, vars) => {
      invalidateAfterBlockChange(qc, {
        targetType: vars.target_type,
        targetId: vars.target_id,
        username: vars.username,
        dropFromFeed: true,
      })
      toast.show({
        title: "Blocked",
        message: "You can unblock anytime from Settings.",
        icon: "mdi:account-cancel-outline",
        position: "top-right",
        duration: 4000,
      })
    },

    onError: () => {
      toast.show({
        title: "Couldn't block this account",
        message: "Try again.",
        variant: "error",
        position: "top-right",
        duration: 4000,
      })
    },
  })
}

/**
 * Unblock. Does NOT restore the follows the block removed — that is the
 * backend's rule, and the copy here must not imply otherwise.
 */
export const useUnblock = () => {
  const qc = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: (vars: BlockVars) =>
      unblockApi({ target_type: vars.target_type, target_id: vars.target_id }),

    onSuccess: (_data, vars) => {
      invalidateAfterBlockChange(qc, {
        targetType: vars.target_type,
        targetId: vars.target_id,
        username: vars.username,
      })
      toast.show({
        title: "Unblocked",
        icon: "mdi:account-check-outline",
        position: "top-right",
        duration: 3000,
      })
    },

    onError: () => {
      toast.show({
        title: "Couldn't unblock this account",
        message: "Try again.",
        variant: "error",
        position: "top-right",
        duration: 4000,
      })
    },
  })
}

// ── Queries ──────────────────────────────────────────────────

/**
 * Settings → Blocked accounts. Offset-paginated, newest first.
 *
 * `has_more` comes from the server rather than being derived from counts: the
 * list mutates while you are reading it (every Unblock removes a row), and a
 * client-side "fetched < count" comparison drifts the moment it does.
 */
export const useBlockedList = () =>
  useInfiniteQuery<BlockedListResponse, Error>({
    queryKey: moderationKeys.blocked(),
    queryFn: ({ pageParam = 0 }) =>
      fetchBlockedListApi({ limit: LIMIT, offset: pageParam as number }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.has_more ? lastPage.offset + lastPage.results.length : undefined,
    staleTime: 1000 * 60,
  })
