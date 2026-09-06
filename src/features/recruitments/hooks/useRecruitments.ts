import { InfiniteData, useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useAuthStore } from "@/store/auth.store"
import {
  fetchRecruitmentsApi,
  fetchRecruitmentDetailApi,
  fetchMyApplicationsApi,
  fetchRecruitmentDiscoverApi,
  DISCOVER_SECTIONS,
  type FetchRecruitmentsParams,
  type RecruitmentsListResponse,
  type RecruitmentDiscoverResponse,
  type FetchMyApplicationsParams,
  type MyApplicationsResponse,
} from "../services/recruitments.api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  createRecruitmentApi,
  updateRecruitmentApi,
  changeRecruitmentStatusApi,
  applyRecruitmentApi,
  fetchRecruitmentApplicantsApi,
  fetchApplicationDetailApi,
  withdrawApplicationApi,
  bulkUpdateApplicationStatusApi,
  updateApplicationStatusApi,
  type CreateRecruitmentPayload,
  type RecruitmentPayload,
  type RecruitmentStatus,
  type ApplyRecruitmentPayload,
  type RecruitmentApplicantsResponse,
  type FetchRecruitmentApplicantsParams,
  type BulkStatusTarget,
  type SingleStatusTarget,
  type Recruitment,
  type RecruitmentDetail,
} from "../services/recruitments.api"
import {
  toggleSaveRecruitmentApi,
  type SavedRecruitmentsResponse,
} from "../services/saved.api"
import { useToast } from "@/shared/components/ui/Toast/Toast"


// ── Query keys ────────────────────────────────────────────────

export const recruitmentKeys = {
  list: (p: FetchRecruitmentsParams) => ["recruitments", "list", p] as const,
  detail: (id: string) => ["recruitments", "detail", id] as const,
  // Scoped by actor: the discover payload is personalized to whoever asked for
  // it, and an actor switch must not hand a player their club's rails (or the
  // other way round) out of cache.
  discover: (actorKey: string, p: { max_distance_km?: number }) =>
    ["recruitments", "discover", actorKey, p] as const,
}

export const applicantKeys = {
  list: (recruitmentId: string, p: FetchRecruitmentApplicantsParams) =>
    ["recruitments", "applicants", recruitmentId, p] as const,
  detail: (applicationId: string) =>
    ["recruitments", "application", applicationId] as const,
}

export const myApplicationKeys = {
  list: (p: FetchMyApplicationsParams) =>
    ["recruitments", "my-applications", p] as const,
}

// ── Infinite list ──────────────────────────────────────────────

const LIMIT = 10

/**
 * `enabled` is opt-out: the public org profile already has its listings from
 * the server render and must not fire this — /recruitments/list is
 * IsAuthenticated.
 */
export const useRecruitmentsList = (
  params: FetchRecruitmentsParams = {},
  limit = LIMIT,
  enabled = true
) =>
  useInfiniteQuery<RecruitmentsListResponse, Error>({
    queryKey: recruitmentKeys.list({ ...params, limit }),
    queryFn: ({ pageParam = 0 }) =>
      fetchRecruitmentsApi({ ...params, limit, offset: pageParam as number }),
    enabled,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.results.length, 0)
      return fetched < lastPage.count ? fetched : undefined
    },
    staleTime: 1000 * 60 * 5,
  })

// ── Discover (§4) ─────────────────────────────────────────────

/**
 * The four personalized rails. Never errors on a thin profile — an org actor
 * or a sportless player gets the same shape back with `is_personalized: false`,
 * which is what drives the profile-completion prompt.
 *
 * `staleTime` matches the server's own 10-minute cache: refetching sooner
 * would just re-read the same cached payload over the network.
 */
export const useRecruitmentDiscover = (params: { max_distance_km?: number } = {}) => {
  const actorType = useAuthStore((s) => s.actorType)
  const actorId = useAuthStore((s) => s.actorId)
  const userId = useAuthStore((s) => s.user?.id)
  const actorKey =
    actorType === "organization" ? `org:${actorId ?? ""}` : `user:${userId ?? ""}`

  return useQuery<RecruitmentDiscoverResponse, Error>({
    queryKey: recruitmentKeys.discover(actorKey, params),
    queryFn: () => fetchRecruitmentDiscoverApi(params),
    staleTime: 1000 * 60 * 10,
  })
}

// ── Save / unsave (shortlist) ─────────────────────────────────

/** The shortlist is per-actor, exactly like the saved-posts list. */
export const savedRecruitmentKeys = {
  list: (actorType: string, actorId: string | null) =>
    ["recruitments", "saved", actorType, actorId] as const,
  all: ["recruitments", "saved"] as const,
}

type RecruitmentPages = InfiniteData<{ results: Recruitment[] }>

// Every cache that holds `Recruitment[]` under `pages[].results`. The bookmark
// can be on screen in more than one of them at a time (the "All" tab behind a
// modal, the org profile behind a route), so a flip has to reach all of them or
// the user sees two different truths on two screens.
// `["recruitments","saved"]` is deliberately NOT here — see the remover below.
const RECRUITMENT_LIST_CACHE_KEYS = [["recruitments", "list"]] as const

export const useToggleSaveRecruitment = () => {
  const qc = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: (recruitmentId: string) =>
      toggleSaveRecruitmentApi(recruitmentId),

    onMutate: async (recruitmentId: string) => {
      await Promise.all(
        [
          ...RECRUITMENT_LIST_CACHE_KEYS,
          ["recruitments", "discover"],
          savedRecruitmentKeys.all,
        ].map((queryKey) => qc.cancelQueries({ queryKey: [...queryKey] }))
      )

      // Read the current value off the cache rather than trusting a
      // caller-supplied one, so a double-tap can't desync from what is
      // rendered.
      const flip = (
        old: RecruitmentPages | undefined
      ): RecruitmentPages | undefined => {
        if (!old?.pages) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            results: page.results.map((r) =>
              r.id === recruitmentId ? { ...r, is_saved: !r.is_saved } : r
            ),
          })),
        }
      }

      for (const queryKey of RECRUITMENT_LIST_CACHE_KEYS) {
        qc.setQueriesData<RecruitmentPages>({ queryKey: [...queryKey] }, flip)
      }

      // Discover is NOT an infinite list — it is one object of four rails, and
      // the same recruitment can only be in one of them (the server dedups),
      // but flipping all four costs nothing and needs no lookup.
      qc.setQueriesData<RecruitmentDiscoverResponse>(
        { queryKey: ["recruitments", "discover"] },
        (old) => {
          if (!old) return old
          const next = { ...old }
          for (const section of DISCOVER_SECTIONS) {
            next[section] = (old[section] ?? []).map((r) =>
              r.id === recruitmentId ? { ...r, is_saved: !r.is_saved } : r
            )
          }
          return next
        }
      )

      // The open detail page, if this was tapped from there.
      qc.setQueriesData<RecruitmentDetail>(
        { queryKey: recruitmentKeys.detail(recruitmentId) },
        (old) => (old ? { ...old, is_saved: !old.is_saved } : old)
      )

      // On the Saved tab an unsave means the card no longer belongs there at
      // all — flipping a bookmark on a row that is about to vanish would just
      // flash. Saving from somewhere else is picked up by the invalidate in
      // onSuccess rather than guessed into position.
      qc.setQueriesData<InfiniteData<SavedRecruitmentsResponse>>(
        { queryKey: [...savedRecruitmentKeys.all] },
        (old) => {
          if (!old?.pages) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              results: page.results.filter((r) => r.id !== recruitmentId),
            })),
          }
        }
      )

      // Same contract as useToggleLike in posts: no snapshot, onError refetches
      // the truth for every affected cache.
      return {}
    },

    onSuccess: () => {
      // No success toast, and that IS the divergence from posts: there the save
      // lives behind a ⋯ menu and nothing on the card moves, so the toast is
      // the only confirmation. Here the bookmark itself fills in — a toast on
      // top of it would be the app talking over its own UI.
      //
      // The shortlist's membership and ordering are the server's to decide
      // (newest-saved first), so it is refetched rather than reconstructed.
      qc.invalidateQueries({ queryKey: [...savedRecruitmentKeys.all] })
    },

    onError: (_e, recruitmentId) => {
      toast.show({
        title: "Couldn't update your saved recruitments",
        message: "Check your connection and try again.",
        variant: "error",
        duration: 4000,
      })
      for (const queryKey of [
        ...RECRUITMENT_LIST_CACHE_KEYS,
        ["recruitments", "discover"],
        savedRecruitmentKeys.all,
        recruitmentKeys.detail(recruitmentId),
      ]) {
        qc.invalidateQueries({ queryKey: [...queryKey] })
      }
    },
  })
}

// ── My applications (player) ──────────────────────────────────

const MY_APPLICATIONS_LIMIT = 20

export const useMyApplications = (params: FetchMyApplicationsParams = {}) =>
  useInfiniteQuery<MyApplicationsResponse, Error>({
    queryKey: myApplicationKeys.list({ ...params, limit: MY_APPLICATIONS_LIMIT }),
    queryFn: ({ pageParam = 0 }) =>
      fetchMyApplicationsApi({
        ...params,
        limit: MY_APPLICATIONS_LIMIT,
        offset: pageParam as number,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.results.length, 0)
      return fetched < lastPage.count ? fetched : undefined
    },
    staleTime: 1000 * 60,
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
  params: {
    status?: FetchRecruitmentApplicantsParams["status"]
    search?: string
    age_category?: string
  } = {}
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

// ── Withdraw (player) ─────────────────────────────────────────

export const useWithdrawApplication = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      applicationId,
    }: {
      applicationId: string
      recruitmentId: string
    }) => withdrawApplicationApi(applicationId),
    onSuccess: (_data, variables) => {
      // Refetch detail so the banner flips to Withdrawn (+ Reapply). Never
      // optimistically flip — the server is authoritative.
      queryClient.invalidateQueries({
        queryKey: recruitmentKeys.detail(variables.recruitmentId),
      })
      // Also refresh any recruitment lists so cards elsewhere aren't stale.
      queryClient.invalidateQueries({ queryKey: ["recruitments"] })
    },
  })
}

// ── Org status changes (bulk + single) ────────────────────────

export const useBulkUpdateApplicationStatus = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      recruitmentId,
      applicationIds,
      status,
      note,
    }: {
      recruitmentId: string
      applicationIds: string[]
      status: BulkStatusTarget
      note?: string
    }) =>
      bulkUpdateApplicationStatusApi(recruitmentId, {
        applicationIds,
        status,
        note,
      }),
    onSuccess: (_data, variables) => {
      // Refresh rows + status_counts chips for every filter variation.
      queryClient.invalidateQueries({
        queryKey: ["recruitments", "applicants", variables.recruitmentId],
      })
    },
  })
}

export const useUpdateApplicationStatus = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      applicationId,
      status,
      note,
    }: {
      applicationId: string
      recruitmentId?: string
      status: SingleStatusTarget
      note?: string
    }) => updateApplicationStatusApi(applicationId, { status, note }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: applicantKeys.detail(variables.applicationId),
      })
      if (variables.recruitmentId) {
        queryClient.invalidateQueries({
          queryKey: ["recruitments", "applicants", variables.recruitmentId],
        })
      }
    },
  })
}