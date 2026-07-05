import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import {
  fetchRecruitmentsApi,
  fetchRecruitmentDetailApi,
  type FetchRecruitmentsParams,
  type RecruitmentsListResponse,
} from "../services/recruitments.api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  createRecruitmentApi,
  updateRecruitmentApi,
  changeRecruitmentStatusApi,
  applyRecruitmentApi,
  fetchRecruitmentApplicantsApi,
  fetchApplicationDetailApi,
  type CreateRecruitmentPayload,
  type RecruitmentPayload,
  type RecruitmentStatus,
  type ApplyRecruitmentPayload,
  type RecruitmentApplicantsResponse,
  type FetchRecruitmentApplicantsParams,
} from "../services/recruitments.api"


// ── Query keys ────────────────────────────────────────────────

export const recruitmentKeys = {
  list: (p: FetchRecruitmentsParams) => ["recruitments", "list", p] as const,
  detail: (id: string) => ["recruitments", "detail", id] as const,
}

export const applicantKeys = {
  list: (recruitmentId: string, p: FetchRecruitmentApplicantsParams) =>
    ["recruitments", "applicants", recruitmentId, p] as const,
  detail: (applicationId: string) =>
    ["recruitments", "application", applicationId] as const,
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

export const useUpdateRecruitment = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      recruitmentId,
      payload,
    }: {
      recruitmentId: string
      payload: RecruitmentPayload
    }) => updateRecruitmentApi(recruitmentId, payload),
    onSuccess: (_data, variables) => {
      // Refresh the edited recruitment's detail + all lists
      queryClient.invalidateQueries({
        queryKey: recruitmentKeys.detail(variables.recruitmentId),
      })
      queryClient.invalidateQueries({ queryKey: ["recruitments"] })
    },
  })
}

export const useChangeRecruitmentStatus = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      recruitmentId,
      status,
    }: {
      recruitmentId: string
      status: RecruitmentStatus
    }) => changeRecruitmentStatusApi(recruitmentId, status),
    onSuccess: (_data, variables) => {
      // Refresh the recruitment's detail (status pill) + all lists
      queryClient.invalidateQueries({
        queryKey: recruitmentKeys.detail(variables.recruitmentId),
      })
      queryClient.invalidateQueries({ queryKey: ["recruitments"] })
    },
  })
}

// ── Org-side applicants (read-only) ───────────────────────────

const APPLICANTS_LIMIT = 20

export const useRecruitmentApplicants = (
  recruitmentId: string,
  params: { status?: FetchRecruitmentApplicantsParams["status"]; search?: string } = {}
) =>
  useInfiniteQuery<RecruitmentApplicantsResponse, Error>({
    queryKey: applicantKeys.list(recruitmentId, { ...params, limit: APPLICANTS_LIMIT }),
    queryFn: ({ pageParam = 0 }) =>
      fetchRecruitmentApplicantsApi(recruitmentId, {
        ...params,
        limit: APPLICANTS_LIMIT,
        offset: pageParam as number,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.results.length, 0)
      return fetched < lastPage.count ? fetched : undefined
    },
    enabled: !!recruitmentId,
    staleTime: 1000 * 60,
  })

export const useApplicationDetail = (applicationId: string | null) =>
  useQuery({
    queryKey: applicantKeys.detail(applicationId ?? ""),
    queryFn: () => fetchApplicationDetailApi(applicationId as string),
    enabled: !!applicationId,
    staleTime: 1000 * 60,
  })

// ── Apply (player) ────────────────────────────────────────────

export const useApplyRecruitment = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      recruitmentId,
      payload,
    }: {
      recruitmentId: string
      payload: ApplyRecruitmentPayload
    }) => applyRecruitmentApi(recruitmentId, payload),
    onSuccess: (_data, variables) => {
      // Refresh the recruitment's detail so my_application appears and the
      // apply CTA is replaced by the application-status banner.
      queryClient.invalidateQueries({
        queryKey: recruitmentKeys.detail(variables.recruitmentId),
      })
    },
  })
}