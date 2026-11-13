import api from "@/core/api/axios"

import type { MySquadItem, SquadInviteView, SquadJoinResult } from "../types"

// Every player call is made AS THE PERSON, whoever is the active actor: a squad
// place belongs to a person, and the server answers "switch_to_personal" to a
// club actor. The same rule as orgMembers' invitee calls.
const asPerson = { actor: { type: "user" as const } }

/** The token is the credential: path-encoded, never logged, never in a query. */
const invitePath = (token: string) => `/squads/invite/${encodeURIComponent(token)}`

/** The invite page for a signed-in person; `me` is about them. */
export const getSquadInviteApi = async (token: string): Promise<SquadInviteView> => {
  const res = await api.get(invitePath(token), asPerson)
  return res.data.data
}

/** 201 a new request ("pending"); 200 an existing one, or an open invite accepted ("active"). */
export const joinSquadApi = async (token: string): Promise<SquadJoinResult> => {
  const res = await api.post(`${invitePath(token)}/join`, null, asPerson)
  return res.data.data
}

export const getMySquadsApi = async (): Promise<MySquadItem[]> => {
  const res = await api.get("/squads/mine", asPerson)
  return res.data.data.items
}

export const acceptSquadInviteApi = async (memberId: string): Promise<MySquadItem> => {
  const res = await api.post(`/squads/mine/${memberId}/accept`, null, asPerson)
  return res.data.data
}

export const declineSquadInviteApi = async (memberId: string): Promise<void> => {
  await api.post(`/squads/mine/${memberId}/decline`, null, asPerson)
}

export const withdrawSquadRequestApi = async (memberId: string): Promise<void> => {
  await api.post(`/squads/mine/${memberId}/withdraw`, null, asPerson)
}

export const leaveSquadApi = async (memberId: string): Promise<void> => {
  await api.post(`/squads/mine/${memberId}/leave`, null, asPerson)
}
