import { useInfiniteQuery } from "@tanstack/react-query"
import { useAuthStore } from "@/store/auth.store"
import { savedRecruitmentKeys } from "@/features/recruitments/hooks/useRecruitments"
import {
  fetchSavedRecruitmentsApi,
  type SavedRecruitmentsResponse,
} from "@/features/recruitments/services/saved.api"

const LIMIT = 10

/**
 * Recruitments the ACTIVE ACTOR shortlisted, most recently saved first.
 *
 * The actor is part of the cache key, not just the request headers: a person
 * and an org they run have separate lists, and sharing one cache entry would
 * leak one into the other on an account switch.
 *
 * Paged on limit/offset rather than a cursor — that is the envelope every
 * recruitments list endpoint speaks, and the saved list is no exception.
 */
export const useSavedRecruitments = () => {
  const actorType = useAuthStore((s) => s.actorType)
  const actorId = useAuthStore((s) => s.actorId)

  return useInfiniteQuery<SavedRecruitmentsResponse, Error>({
    queryKey: savedRecruitmentKeys.list(actorType, actorId),
    queryFn: ({ pageParam = 0 }) =>
      fetchSavedRecruitmentsApi({ limit: LIMIT, offset: pageParam as number }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.results.length, 0)
      return fetched < lastPage.count ? fetched : undefined
    },
    staleTime: 1000 * 60 * 2,
  })
}
