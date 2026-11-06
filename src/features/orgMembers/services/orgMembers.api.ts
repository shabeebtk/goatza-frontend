import api from "@/core/api/axios"
import { searchMessageTargetsApi, type MessageTarget } from "@/features/messages/services/conversations.api"
import type { OrgMemberRole, OrganizationMini } from "@/features/organization/types"

// ── Types ─────────────────────────────────────────────────────

export type OrgMemberPerson = {
  id: string
  name: string
  username: string
  profile_photo: string
}

export type OrgMemberLabel = { name: string; username: string }

export type OrgMember = {
  id: string
  user: OrgMemberPerson
  role: OrgMemberRole
  joined_at: string
  added_by: OrgMemberLabel | null
  is_me: boolean
}

export type OrgMembersResponse = {
  members: OrgMember[]
  me: { role: OrgMemberRole; permissions: string[] }
}

/** Exactly one of `invited_user` / `email_masked` is set. */
export type PendingInvite = {
  id: string
  role: OrgMemberRole
  invited_user: OrgMemberPerson | null
  email_masked: string | null
  invited_by: OrgMemberLabel | null
  created_at: string
  expires_at: string
}

export type MyInvite = {
  id: string
  organization: { id: string; name: string; username: string; logo: string }
  role: OrgMemberRole
  invited_by: OrgMemberLabel | null
  created_at: string
  expires_at: string
}

export type InviteTarget = { user_id: string } | { email: string }

// ── Query keys ────────────────────────────────────────────────

export const orgMemberKeys = {
  all: () => ["org-members"] as const,
  members: (orgId: string) => ["org-members", orgId, "members"] as const,
  invites: (orgId: string) => ["org-members", orgId, "invites"] as const,
  people: (q: string) => ["org-members", "people", q] as const,
  myInvites: (userId: string | undefined) => ["org-members", "my-invites", userId] as const,
}

// Every org call names its org rather than reading the store's active actor, so
// a screen that outlives a switch cannot manage the wrong club. Every invitee
// call is made as the person, because that is who an invite is for, and the
// account switcher asks for theirs while they are acting as a club.
const asOrg = (orgId: string) => ({ actor: { type: "organization" as const, id: orgId } })
const asPerson = { actor: { type: "user" as const } }

// ── The org's side ────────────────────────────────────────────

export const getOrgMembersApi = async (orgId: string): Promise<OrgMembersResponse> => {
  const res = await api.get("/organizations/members", asOrg(orgId))
  return res.data.data
}

export const getPendingInvitesApi = async (orgId: string): Promise<PendingInvite[]> => {
  const res = await api.get("/organizations/members/invites", asOrg(orgId))
  return res.data.data.invites
}

export const inviteMemberApi = async (
  orgId: string,
  target: InviteTarget,
  role: OrgMemberRole
): Promise<PendingInvite> => {
  const res = await api.post("/organizations/members/invite", { ...target, role }, asOrg(orgId))
  return res.data.data.invite
}

export const cancelInviteApi = async (orgId: string, inviteId: string): Promise<void> => {
  await api.post(`/organizations/members/invites/${inviteId}/cancel`, null, asOrg(orgId))
}

export const changeMemberRoleApi = async (
  orgId: string,
  memberId: string,
  role: OrgMemberRole
): Promise<OrgMember> => {
  const res = await api.post(`/organizations/members/${memberId}/role`, { role }, asOrg(orgId))
  return res.data.data.member
}

export const removeMemberApi = async (orgId: string, memberId: string): Promise<void> => {
  await api.post(`/organizations/members/${memberId}/remove`, null, asOrg(orgId))
}

export const leaveOrganizationApi = async (orgId: string): Promise<void> => {
  await api.post("/organizations/members/leave", null, asOrg(orgId))
}

// ── The invited person's side ─────────────────────────────────

export const getMyInvitesApi = async (): Promise<MyInvite[]> => {
  const res = await api.get("/organizations/invites/mine", asPerson)
  return res.data.data.invites
}

export const acceptInviteApi = async (inviteId: string): Promise<OrganizationMini> => {
  const res = await api.post(`/organizations/invites/${inviteId}/accept`, null, asPerson)
  return res.data.data.organization
}

export const declineInviteApi = async (inviteId: string): Promise<void> => {
  await api.post(`/organizations/invites/${inviteId}/decline`, null, asPerson)
}

// The token is the credential: path-encoded, and never logged or put in a query.
export const acceptInviteByTokenApi = async (token: string): Promise<OrganizationMini> => {
  const res = await api.post(
    `/organizations/invites/token/${encodeURIComponent(token)}/accept`,
    null,
    asPerson
  )
  return res.data.data.organization
}

export const declineInviteByTokenApi = async (token: string): Promise<void> => {
  await api.post(
    `/organizations/invites/token/${encodeURIComponent(token)}/decline`,
    null,
    asPerson
  )
}

// ── Finding someone to invite ─────────────────────────────────

/**
 * People only. The messages search because it covers everyone by name and
 * handle: the explore search only finds players, and a club's coaches and staff
 * are often not players. It hides blocked accounts for the actor too.
 */
export const searchPeopleApi = async (q: string): Promise<MessageTarget[]> => {
  const targets = await searchMessageTargetsApi(q, 20)
  return targets.filter((target) => target.type === "user")
}
