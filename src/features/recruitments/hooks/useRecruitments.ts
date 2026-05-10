import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import {
  fetchRecruitmentsApi,
  fetchRecruitmentDetailApi,
  type FetchRecruitmentsParams,
  type RecruitmentsListResponse,
} from "../services/recruitments.api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createRecruitmentApi, type CreateRecruitmentPayload } from "../services/recruitments.api"


// ── Query keys ────────────────────────────────────────────────

export const recruitmentKeys = {
  list: (p: FetchRecruitmentsParams) => ["recruitments", "list", p] as const,
  detail: (id: string) => ["recruitments", "detail", id] as const,
}

// ── Infinite list ──────────────────────────────────────────────

const LIMIT = 10

export const useRecruitmentsList = (
  params: FetchRecruitmentsParams = {},
  limit = LIMIT
) =>
  useInfiniteQuery<RecruitmentsListResponse, Error>({
    queryKey: recruitmentKeys.list({ ...params, limit }),
    queryFn: ({ pageParam = 0 }) =>
      fetchRecruitmentsApi({ ...params, limit, offset: pageParam as number }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.results.length, 0)
      return fetched < lastPage.count ? fetched : undefined
    },
    staleTime: 1000 * 60 * 5,
  })

// ── Detail ─────────────────────────────────────────────────────

export const useRecruitmentDetail = (recruitmentId: string) =>
  useQuery({
    queryKey: recruitmentKeys.detail(recruitmentId),
    queryFn: () => fetchRecruitmentDetailApi(recruitmentId),
    enabled: !!recruitmentId,
    staleTime: 1000 * 60 * 5,
  })


export const useCreateRecruitment = () => {
  const queryClient = useQueryClient()
 
  return useMutation({
    mutationFn: (payload: CreateRecruitmentPayload) => createRecruitmentApi(payload),
    onSuccess: () => {
      // Invalidate all recruitment lists so they refresh
      queryClient.invalidateQueries({ queryKey: ["recruitments"] })
    },
  })
}