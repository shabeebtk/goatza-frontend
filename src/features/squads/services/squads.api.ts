import api from "@/core/api/axios"

import type {
  AddStaffPayload,
  ApproveItem,
  ApproveResult,
  Candidate,
  CreateSquadPayload,
  DeclineResult,
  InvitePayload,
  MemberItem,
  RemoveReason,
  Roster,
  SquadDetail,
  SquadInviteLink,
  SquadListItem,
  SquadPhotoPayload,
  SquadRequests,
  UpdateMemberPayload,
  UpdateSquadPayload,
} from "../types"

// Every club call names its org rather than reading the store's active actor, the
// same rule as orgMembers.api.ts: a screen that outlives an account switch can
// never act on the wrong club. No trailing slashes, and no bare `/squads` root:
// the list is `/squads/list` because the root does not survive the /api rewrite.
const asOrg = (orgId: string) => ({ actor: { type: "organization" as const, id: orgId } })

// ── Squads ────────────────────────────────────────────────────

export const getSquadsApi = async (
  orgId: string,
  sportId?: string
): Promise<SquadListItem[]> => {
  const res = await api.get("/squads/list", {
    ...asOrg(orgId),
    params: sportId ? { sport_id: sportId } : undefined,
  })
  return res.data.data.squads
}

export const createSquadApi = async (
  orgId: string,
  payload: CreateSquadPayload
): Promise<SquadDetail> => {
  const res = await api.post("/squads/create", payload, asOrg(orgId))
  return res.data.data
}

export const getSquadApi = async (orgId: string, squadId: string): Promise<SquadDetail> => {
  const res = await api.get(`/squads/${squadId}`, asOrg(orgId))
  return res.data.data
}

export const updateSquadApi = async (
  orgId: string,
  squadId: string,
  payload: UpdateSquadPayload
): Promise<SquadDetail> => {
  const res = await api.patch(`/squads/${squadId}/update`, payload, asOrg(orgId))
  return res.data.data
}

export const deleteSquadApi = async (orgId: string, squadId: string): Promise<void> => {
  await api.post(`/squads/${squadId}/delete`, null, asOrg(orgId))
}

export const setSquadPhotoApi = async (
  orgId: string,
  squadId: string,
  payload: SquadPhotoPayload
): Promise<SquadDetail> => {
  const res = await api.post(`/squads/${squadId}/photo`, payload, asOrg(orgId))
  return res.data.data
}

// ── The invite link ───────────────────────────────────────────

export const setInviteLinkEnabledApi = async (
  orgId: string,
  squadId: string,
  enabled: boolean
): Promise<SquadInviteLink> => {
  const res = await api.patch(`/squads/${squadId}/invite-link`, { enabled }, asOrg(orgId))
  return res.data.data
}

export const resetInviteLinkApi = async (
  orgId: string,
  squadId: string
): Promise<SquadInviteLink> => {
  const res = await api.post(`/squads/${squadId}/invite-link/reset`, null, asOrg(orgId))
  return res.data.data
}

// ── Staff ─────────────────────────────────────────────────────

export const addSquadStaffApi = async (
  orgId: string,
  squadId: string,
  payload: AddStaffPayload
): Promise<SquadDetail> => {
  const res = await api.post(`/squads/${squadId}/staff`, payload, asOrg(orgId))
  return res.data.data
}

export const removeSquadStaffApi = async (
  orgId: string,
  squadId: string,
  staffId: string
): Promise<SquadDetail> => {
  const res = await api.post(`/squads/${squadId}/staff/${staffId}/remove`, null, asOrg(orgId))
  return res.data.data
}

// ── Players ───────────────────────────────────────────────────

export const getSquadRosterApi = async (orgId: string, squadId: string): Promise<Roster> => {
  const res = await api.get(`/squads/${squadId}/members`, asOrg(orgId))
  const data = res.data.data
  return { count: data.count, groups: data.groups }
}

export const updateSquadMemberApi = async (
  orgId: string,
  squadId: string,
  memberId: string,
  payload: UpdateMemberPayload
): Promise<MemberItem> => {
  const res = await api.patch(`/squads/${squadId}/members/${memberId}`, payload, asOrg(orgId))
  return res.data.data
}

export const removeSquadMemberApi = async (
  orgId: string,
  squadId: string,
  memberId: string,
  reason: RemoveReason
): Promise<void> => {
  await api.post(`/squads/${squadId}/members/${memberId}/remove`, { reason }, asOrg(orgId))
}

/** Resolves with the player's NEW row, in the squad they moved to. */
export const moveSquadMemberApi = async (
  orgId: string,
  squadId: string,
  memberId: string,
  toSquadId: string
): Promise<MemberItem> => {
  const res = await api.post(
    `/squads/${squadId}/members/${memberId}/move`,
    { to_squad_id: toSquadId },
    asOrg(orgId)
  )
  return res.data.data
}

// ── Requests and invites ──────────────────────────────────────

export const getSquadRequestsApi = async (
  orgId: string,
  squadId: string
): Promise<SquadRequests> => {
  const res = await api.get(`/squads/${squadId}/requests`, asOrg(orgId))
  const data = res.data.data
  return { requests: data.requests, invites: data.invites }
}

/** 1–50 at a time. A refusal for one player comes back in `failed`, not as an error. */
export const approveSquadRequestsApi = async (
  orgId: string,
  squadId: string,
  items: ApproveItem[]
): Promise<ApproveResult> => {
  const res = await api.post(`/squads/${squadId}/requests/approve`, { items }, asOrg(orgId))
  return res.data.data
}

export const declineSquadRequestsApi = async (
  orgId: string,
  squadId: string,
  memberIds: string[]
): Promise<DeclineResult> => {
  const res = await api.post(
    `/squads/${squadId}/requests/decline`,
    { member_ids: memberIds },
    asOrg(orgId)
  )
  return res.data.data
}

/** People the club could invite. The server wants at least 2 characters. */
export const getSquadCandidatesApi = async (
  orgId: string,
  squadId: string,
  q: string
): Promise<Candidate[]> => {
  const res = await api.get(`/squads/${squadId}/candidates`, { ...asOrg(orgId), params: { q } })
  return res.data.data.results
}

/** Status "invited", or "active" when the player had already asked to join. */
export const inviteToSquadApi = async (
  orgId: string,
  squadId: string,
  payload: InvitePayload
): Promise<MemberItem> => {
  const res = await api.post(`/squads/${squadId}/invites`, payload, asOrg(orgId))
  return res.data.data
}

export const cancelSquadInviteApi = async (
  orgId: string,
  squadId: string,
  memberId: string
): Promise<void> => {
  await api.post(`/squads/${squadId}/invites/${memberId}/cancel`, null, asOrg(orgId))
}
