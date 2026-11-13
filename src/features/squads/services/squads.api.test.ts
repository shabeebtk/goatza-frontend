import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}))

vi.mock("@/core/api/axios", () => ({ default: api }))

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
} from "./squads.api"

const ORG = "org-1"
const AS_ORG = { type: "organization", id: ORG }

const ok = (data: unknown) => ({ data: { data } })

/** Every call the module made, whatever the verb: [path, config]. */
function calls(): { path: string; config: Record<string, unknown> }[] {
  return [
    ...api.get.mock.calls.map(([path, config]) => ({ path, config })),
    ...api.post.mock.calls.map(([path, , config]) => ({ path, config })),
    ...api.patch.mock.calls.map(([path, , config]) => ({ path, config })),
  ]
}

beforeEach(() => {
  api.get.mockReset()
  api.post.mockReset()
  api.patch.mockReset()
  api.get.mockResolvedValue(ok({}))
  api.post.mockResolvedValue(ok({}))
  api.patch.mockResolvedValue(ok({}))
})

describe("squads.api", () => {
  it("lists through /squads/list, with sport_id only when one is given", async () => {
    api.get.mockResolvedValue(ok({ squads: [{ id: "sq-1" }] }))

    await expect(getSquadsApi(ORG)).resolves.toEqual([{ id: "sq-1" }])
    expect(api.get).toHaveBeenLastCalledWith("/squads/list", { actor: AS_ORG, params: undefined })

    await getSquadsApi(ORG, "sport-9")
    expect(api.get).toHaveBeenLastCalledWith("/squads/list", {
      actor: AS_ORG,
      params: { sport_id: "sport-9" },
    })
  })

  it("names the squad paths and their bodies", async () => {
    await createSquadApi(ORG, { name: "U17 Boys", sport_id: "s1" })
    expect(api.post).toHaveBeenLastCalledWith(
      "/squads/create",
      { name: "U17 Boys", sport_id: "s1" },
      { actor: AS_ORG }
    )

    await getSquadApi(ORG, "sq-1")
    expect(api.get).toHaveBeenLastCalledWith("/squads/sq-1", { actor: AS_ORG })

    await updateSquadApi(ORG, "sq-1", { is_public: false })
    expect(api.patch).toHaveBeenLastCalledWith(
      "/squads/sq-1/update",
      { is_public: false },
      { actor: AS_ORG }
    )

    await deleteSquadApi(ORG, "sq-1")
    expect(api.post).toHaveBeenLastCalledWith("/squads/sq-1/delete", null, { actor: AS_ORG })

    await setSquadPhotoApi(ORG, "sq-1", { remove: true })
    expect(api.post).toHaveBeenLastCalledWith("/squads/sq-1/photo", { remove: true }, {
      actor: AS_ORG,
    })
  })

  it("turns the invite link on or off, and resets it", async () => {
    api.patch.mockResolvedValue(ok({ url: "https://x/i/t", enabled: false }))
    await expect(setInviteLinkEnabledApi(ORG, "sq-1", false)).resolves.toEqual({
      url: "https://x/i/t",
      enabled: false,
    })
    expect(api.patch).toHaveBeenLastCalledWith(
      "/squads/sq-1/invite-link",
      { enabled: false },
      { actor: AS_ORG }
    )

    await resetInviteLinkApi(ORG, "sq-1")
    expect(api.post).toHaveBeenLastCalledWith("/squads/sq-1/invite-link/reset", null, {
      actor: AS_ORG,
    })
  })

  it("adds and removes staff", async () => {
    await addSquadStaffApi(ORG, "sq-1", { member_id: "om-1", role: "other", title: "GK coach" })
    expect(api.post).toHaveBeenLastCalledWith(
      "/squads/sq-1/staff",
      { member_id: "om-1", role: "other", title: "GK coach" },
      { actor: AS_ORG }
    )

    await removeSquadStaffApi(ORG, "sq-1", "st-1")
    expect(api.post).toHaveBeenLastCalledWith("/squads/sq-1/staff/st-1/remove", null, {
      actor: AS_ORG,
    })
  })

  it("reads the roster and changes a player", async () => {
    api.get.mockResolvedValue(ok({ count: 1, groups: [], can_review: true }))
    await expect(getSquadRosterApi(ORG, "sq-1")).resolves.toEqual({ count: 1, groups: [] })
    expect(api.get).toHaveBeenLastCalledWith("/squads/sq-1/members", { actor: AS_ORG })

    await updateSquadMemberApi(ORG, "sq-1", "m-1", { jersey_number: null, position_id: null })
    expect(api.patch).toHaveBeenLastCalledWith(
      "/squads/sq-1/members/m-1",
      { jersey_number: null, position_id: null },
      { actor: AS_ORG }
    )

    await removeSquadMemberApi(ORG, "sq-1", "m-1", "mistake")
    expect(api.post).toHaveBeenLastCalledWith(
      "/squads/sq-1/members/m-1/remove",
      { reason: "mistake" },
      { actor: AS_ORG }
    )

    await moveSquadMemberApi(ORG, "sq-1", "m-1", "sq-2")
    expect(api.post).toHaveBeenLastCalledWith(
      "/squads/sq-1/members/m-1/move",
      { to_squad_id: "sq-2" },
      { actor: AS_ORG }
    )
  })

  it("answers requests in batches with the right bodies", async () => {
    api.get.mockResolvedValue(ok({ requests: [{ id: "r1" }], invites: [] }))
    await expect(getSquadRequestsApi(ORG, "sq-1")).resolves.toEqual({
      requests: [{ id: "r1" }],
      invites: [],
    })
    expect(api.get).toHaveBeenLastCalledWith("/squads/sq-1/requests", { actor: AS_ORG })

    const items = [{ member_id: "r1" }, { member_id: "r2", jersey_number: 9 }]
    await approveSquadRequestsApi(ORG, "sq-1", items)
    expect(api.post).toHaveBeenLastCalledWith(
      "/squads/sq-1/requests/approve",
      { items },
      { actor: AS_ORG }
    )

    await declineSquadRequestsApi(ORG, "sq-1", ["r1", "r2"])
    expect(api.post).toHaveBeenLastCalledWith(
      "/squads/sq-1/requests/decline",
      { member_ids: ["r1", "r2"] },
      { actor: AS_ORG }
    )
  })

  it("searches candidates and sends invites", async () => {
    api.get.mockResolvedValue(ok({ results: [{ state: "none" }] }))
    await expect(getSquadCandidatesApi(ORG, "sq-1", "bil")).resolves.toEqual([{ state: "none" }])
    expect(api.get).toHaveBeenLastCalledWith("/squads/sq-1/candidates", {
      actor: AS_ORG,
      params: { q: "bil" },
    })

    await inviteToSquadApi(ORG, "sq-1", {
      user_id: "u-1",
      application_id: "app-1",
      position_id: "p-1",
      jersey_number: 7,
    })
    expect(api.post).toHaveBeenLastCalledWith(
      "/squads/sq-1/invites",
      { user_id: "u-1", application_id: "app-1", position_id: "p-1", jersey_number: 7 },
      { actor: AS_ORG }
    )

    await cancelSquadInviteApi(ORG, "sq-1", "m-9")
    expect(api.post).toHaveBeenLastCalledWith("/squads/sq-1/invites/m-9/cancel", null, {
      actor: AS_ORG,
    })
  })

  it("acts as the named org on every call, and never sends a trailing slash", async () => {
    await getSquadsApi(ORG)
    await createSquadApi(ORG, { name: "A", sport_id: "s" })
    await getSquadApi(ORG, "sq")
    await updateSquadApi(ORG, "sq", {})
    await deleteSquadApi(ORG, "sq")
    await setSquadPhotoApi(ORG, "sq", { remove: true })
    await setInviteLinkEnabledApi(ORG, "sq", true)
    await resetInviteLinkApi(ORG, "sq")
    await addSquadStaffApi(ORG, "sq", { member_id: "m", role: "physio" })
    await removeSquadStaffApi(ORG, "sq", "st")
    await updateSquadMemberApi(ORG, "sq", "m", {})
    await removeSquadMemberApi(ORG, "sq", "m", "left")
    await moveSquadMemberApi(ORG, "sq", "m", "sq2")
    await approveSquadRequestsApi(ORG, "sq", [{ member_id: "m" }])
    await declineSquadRequestsApi(ORG, "sq", ["m"])
    await inviteToSquadApi(ORG, "sq", { user_id: "u" })
    await cancelSquadInviteApi(ORG, "sq", "m")
    api.get.mockResolvedValue(ok({ results: [], requests: [], invites: [], count: 0, groups: [] }))
    await getSquadRosterApi(ORG, "sq")
    await getSquadRequestsApi(ORG, "sq")
    await getSquadCandidatesApi(ORG, "sq", "ab")

    const made = calls()
    expect(made).toHaveLength(20)
    for (const { path, config } of made) {
      expect(config.actor).toEqual(AS_ORG)
      expect(path.startsWith("/squads/")).toBe(true)
      expect(path.endsWith("/")).toBe(false)
    }
  })
})
