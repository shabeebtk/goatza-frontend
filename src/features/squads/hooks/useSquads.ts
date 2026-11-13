"use client"

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"

import {
  addSquadStaffApi,
  approveSquadRequestsApi,
  cancelSquadInviteApi,
  createSquadApi,
  declineSquadRequestsApi,
  deleteSquadApi,
  getSquadApi,
  getSquadCandidatesApi,
  getSquadRequestsApi,
  getSquadRosterApi,
  getSquadsApi,
  inviteToSquadApi,
  moveSquadMemberApi,
  removeSquadMemberApi,
  removeSquadStaffApi,
  resetInviteLinkApi,
  setInviteLinkEnabledApi,
  setSquadPhotoApi,
  updateSquadApi,
  updateSquadMemberApi,
} from "../services/squads.api"
import { uploadSquadPhoto } from "../services/uploadSquadPhoto"
import type {
  AddStaffPayload,
  ApproveItem,
  ApproveResult,
  CreateSquadPayload,
  DeclineResult,
  InvitePayload,
  RemoveReason,
  SquadDetail,
  SquadPhotoPayload,
  UpdateMemberPayload,
  UpdateSquadPayload,
} from "../types"

// ── Query keys ────────────────────────────────────────────────

/**
 * Everything is under the org, so a whole club's squads can be dropped at once,
 * and `lists(orgId)` matches the list for every sport filter.
 */
export const squadKeys = {
  all: () => ["squads"] as const,
  org: (orgId: string) => ["squads", orgId] as const,
  lists: (orgId: string) => ["squads", orgId, "list"] as const,
  list: (orgId: string, sportId?: string) => ["squads", orgId, "list", sportId ?? "all"] as const,
  squad: (orgId: string, id: string) => ["squads", orgId, "squad", id] as const,
  detail: (orgId: string, id: string) => ["squads", orgId, "squad", id, "detail"] as const,
  members: (orgId: string, id: string) => ["squads", orgId, "squad", id, "members"] as const,
  requests: (orgId: string, id: string) => ["squads", orgId, "squad", id, "requests"] as const,
  candidates: (orgId: string, id: string, q: string) =>
    ["squads", orgId, "squad", id, "candidates", q] as const,
}

/** The minimum a candidate search sends; the server refuses fewer. */
export const CANDIDATE_MIN_CHARS = 2

/** The most one approve or decline call takes (MAX_BULK on the server). */
export const BULK_LIMIT = 50

function chunks<T>(items: T[], size = BULK_LIMIT): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

// ── What a write invalidates ──────────────────────────────────

/** A change to the squad itself: its card on the list and its page. */
function invalidateSquad(queryClient: QueryClient, orgId: string, squadId: string) {
  queryClient.invalidateQueries({ queryKey: squadKeys.lists(orgId) })
  queryClient.invalidateQueries({ queryKey: squadKeys.detail(orgId, squadId) })
}

/**
 * A change to who is in the squad. The counts on the card and the page move with
 * it, and so does who can still be invited.
 */
function invalidateMembership(queryClient: QueryClient, orgId: string, squadId: string) {
  queryClient.invalidateQueries({ queryKey: squadKeys.members(orgId, squadId) })
  queryClient.invalidateQueries({ queryKey: squadKeys.requests(orgId, squadId) })
  queryClient.invalidateQueries({
    queryKey: [...squadKeys.squad(orgId, squadId), "candidates"],
  })
  invalidateSquad(queryClient, orgId, squadId)
}

/** A write that answers with the whole squad: show it now, then refresh the rest. */
function storeDetail(queryClient: QueryClient, orgId: string, squad: SquadDetail) {
  queryClient.setQueryData(squadKeys.detail(orgId, squad.id), squad)
  queryClient.invalidateQueries({ queryKey: squadKeys.lists(orgId) })
}

// ── Reads ─────────────────────────────────────────────────────

export const useSquads = (
  orgId: string,
  { sportId, enabled = true }: { sportId?: string; enabled?: boolean } = {}
) =>
  useQuery({
    queryKey: squadKeys.list(orgId, sportId),
    queryFn: () => getSquadsApi(orgId, sportId),
    enabled: enabled && !!orgId,
  })

export const useSquad = (orgId: string, squadId: string) =>
  useQuery({
    queryKey: squadKeys.detail(orgId, squadId),
    queryFn: () => getSquadApi(orgId, squadId),
    enabled: !!squadId,
  })

export const useSquadRoster = (orgId: string, squadId: string, enabled = true) =>
  useQuery({
    queryKey: squadKeys.members(orgId, squadId),
    queryFn: () => getSquadRosterApi(orgId, squadId),
    enabled: enabled && !!squadId,
  })

export const useSquadRequests = (orgId: string, squadId: string, enabled = true) =>
  useQuery({
    queryKey: squadKeys.requests(orgId, squadId),
    queryFn: () => getSquadRequestsApi(orgId, squadId),
    enabled: enabled && !!squadId,
  })

/**
 * `q` is the already-debounced text (300 ms, in the component). Below two
 * characters nothing is asked; the previous answer stays up while the next loads.
 */
export const useSquadCandidates = (orgId: string, squadId: string, q: string) => {
  const term = q.trim()

  return useQuery({
    queryKey: squadKeys.candidates(orgId, squadId, term),
    queryFn: () => getSquadCandidatesApi(orgId, squadId, term),
    enabled: !!squadId && term.length >= CANDIDATE_MIN_CHARS,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 30,
  })
}

// ── Writes on a squad ─────────────────────────────────────────

export const useCreateSquad = (orgId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreateSquadPayload) => createSquadApi(orgId, payload),
    onSuccess: (squad) => storeDetail(queryClient, orgId, squad),
  })
}

export const useUpdateSquad = (orgId: string, squadId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: UpdateSquadPayload) => updateSquadApi(orgId, squadId, payload),
    onSuccess: (squad) => storeDetail(queryClient, orgId, squad),
  })
}

export const useDeleteSquad = (orgId: string, squadId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => deleteSquadApi(orgId, squadId),
    onSuccess: () => {
      // Gone: nothing under it is worth refetching. Only what nobody is
      // watching is dropped now: the page still on screen would otherwise
      // refetch its own detail, get a 404 and flash "not available" before it
      // navigates away. Its queries go with it once it unmounts (gcTime).
      queryClient.removeQueries({ queryKey: squadKeys.squad(orgId, squadId), type: "inactive" })
      queryClient.invalidateQueries({ queryKey: squadKeys.lists(orgId) })
    },
  })
}

export const useSetSquadPhoto = (orgId: string, squadId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: SquadPhotoPayload) => setSquadPhotoApi(orgId, squadId, payload),
    onSuccess: (squad) => storeDetail(queryClient, orgId, squad),
  })
}

/** Compress, upload and attach a cropped photo; the squad it answers with goes into the cache. */
export const useUploadSquadPhoto = (orgId: string, squadId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ blob, originalName }: { blob: Blob; originalName: string }) =>
      uploadSquadPhoto({ orgId, squadId, blob, originalName }),
    onSuccess: (squad) => storeDetail(queryClient, orgId, squad),
  })
}

export const useSetInviteLinkEnabled = (orgId: string, squadId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (enabled: boolean) => setInviteLinkEnabledApi(orgId, squadId, enabled),
    onSuccess: (invite) => {
      queryClient.setQueryData<SquadDetail>(squadKeys.detail(orgId, squadId), (squad) =>
        squad ? { ...squad, invite, invite_enabled: invite.enabled } : squad
      )
      invalidateSquad(queryClient, orgId, squadId)
    },
  })
}

export const useResetInviteLink = (orgId: string, squadId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => resetInviteLinkApi(orgId, squadId),
    onSuccess: (invite) => {
      queryClient.setQueryData<SquadDetail>(squadKeys.detail(orgId, squadId), (squad) =>
        squad ? { ...squad, invite, invite_enabled: invite.enabled } : squad
      )
      invalidateSquad(queryClient, orgId, squadId)
    },
  })
}

export const useAddSquadStaff = (orgId: string, squadId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: AddStaffPayload) => addSquadStaffApi(orgId, squadId, payload),
    onSuccess: (squad) => storeDetail(queryClient, orgId, squad),
  })
}

export const useRemoveSquadStaff = (orgId: string, squadId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (staffId: string) => removeSquadStaffApi(orgId, squadId, staffId),
    onSuccess: (squad) => storeDetail(queryClient, orgId, squad),
  })
}

// ── Writes on who is in it ────────────────────────────────────

export const useUpdateSquadMember = (orgId: string, squadId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ memberId, payload }: { memberId: string; payload: UpdateMemberPayload }) =>
      updateSquadMemberApi(orgId, squadId, memberId, payload),
    onSuccess: () => invalidateMembership(queryClient, orgId, squadId),
  })
}

export const useRemoveSquadMember = (orgId: string, squadId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ memberId, reason }: { memberId: string; reason: RemoveReason }) =>
      removeSquadMemberApi(orgId, squadId, memberId, reason),
    onSuccess: () => invalidateMembership(queryClient, orgId, squadId),
  })
}

/** Both squads change: the one they left and the one they joined. */
export const useMoveSquadMember = (orgId: string, squadId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ memberId, toSquadId }: { memberId: string; toSquadId: string }) =>
      moveSquadMemberApi(orgId, squadId, memberId, toSquadId),
    onSuccess: (_row, { toSquadId }) => {
      invalidateMembership(queryClient, orgId, squadId)
      invalidateMembership(queryClient, orgId, toSquadId)
    },
  })
}

export const useApproveSquadRequests = (orgId: string, squadId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    // A squad can hold up to 100 requests and one call takes 50, so "Select
    // all" goes up in batches and the answers are put back together.
    mutationFn: async (items: ApproveItem[]): Promise<ApproveResult> => {
      const result: ApproveResult = { approved: [], failed: [] }
      for (const batch of chunks(items)) {
        const answer = await approveSquadRequestsApi(orgId, squadId, batch)
        result.approved.push(...answer.approved)
        result.failed.push(...answer.failed)
      }
      return result
    },
    // Settled, not success: a batch can half-land, and a refusal for one player
    // comes back inside a 200.
    onSettled: () => invalidateMembership(queryClient, orgId, squadId),
  })
}

export const useDeclineSquadRequests = (orgId: string, squadId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (memberIds: string[]): Promise<DeclineResult> => {
      const result: DeclineResult = { declined: [], failed: [] }
      for (const batch of chunks(memberIds)) {
        const answer = await declineSquadRequestsApi(orgId, squadId, batch)
        result.declined.push(...answer.declined)
        result.failed.push(...answer.failed)
      }
      return result
    },
    onSettled: () => invalidateMembership(queryClient, orgId, squadId),
  })
}

export const useInviteToSquad = (orgId: string, squadId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: InvitePayload) => inviteToSquadApi(orgId, squadId, payload),
    onSuccess: () => invalidateMembership(queryClient, orgId, squadId),
  })
}

export const useCancelSquadInvite = (orgId: string, squadId: string) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (memberId: string) => cancelSquadInviteApi(orgId, squadId, memberId),
    onSettled: () => invalidateMembership(queryClient, orgId, squadId),
  })
}
