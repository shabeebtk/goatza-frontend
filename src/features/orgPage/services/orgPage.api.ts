import api from "@/core/api/axios"

import type { OrganizationDetail } from "@/features/organization/types"
import type {
  Coach,
  CoachCreatePayload,
  CoachUpdatePayload,
  FacilityPhoto,
  LocationFacilities,
  PageAdmin,
  PageCoaches,
  PageContact,
  PageFacilities,
  PageFactsPayload,
  PagePlayers,
  PageSettings,
  Program,
  ProgramWritePayload,
  SwitchableSection,
} from "../types"

// Every call names its org rather than reading the store's active actor, the same
// rule as squads.api.ts: a screen that outlives an account switch can never edit
// the wrong page. No trailing slashes.
const asOrg = (orgId: string) => ({ actor: { type: "organization" as const, id: orgId } })

// ── The hub ───────────────────────────────────────────────────

export const getPageAdminApi = async (orgId: string): Promise<PageAdmin> => {
  const res = await api.get("/page/admin", asOrg(orgId))
  return res.data.data
}

// ── Settings: each write answers the whole PageSettings ───────

/**
 * Send numbers as they were typed: the server normalizes them (a 10-digit Indian
 * mobile, with or without 0 or 91, becomes +91…; "+" and 8–15 digits is kept).
 */
export const updateContactApi = async (
  orgId: string,
  payload: Partial<PageContact>
): Promise<PageSettings> => {
  const res = await api.patch("/page/contact", payload, asOrg(orgId))
  return res.data.data
}

export const updateFactsApi = async (
  orgId: string,
  payload: PageFactsPayload
): Promise<PageSettings> => {
  const res = await api.patch("/page/facts", payload, asOrg(orgId))
  return res.data.data
}

export const updateSectionsApi = async (
  orgId: string,
  payload: Partial<Record<SwitchableSection, boolean>>
): Promise<PageSettings> => {
  const res = await api.patch("/page/sections", payload, asOrg(orgId))
  return res.data.data
}

// ── About ─────────────────────────────────────────────────────

/** The About text is the org's own description, saved where the profile saves it. */
export const updateAboutApi = async (
  orgId: string,
  description: string
): Promise<OrganizationDetail> => {
  const res = await api.patch("/organizations/update", { description }, asOrg(orgId))
  return res.data.data
}

// ── Programs & fees ───────────────────────────────────────────

export const getProgramsApi = async (orgId: string): Promise<Program[]> => {
  const res = await api.get("/page/programs", asOrg(orgId))
  return res.data.data.programs
}

export const createProgramApi = async (
  orgId: string,
  payload: ProgramWritePayload
): Promise<Program> => {
  const res = await api.post("/page/programs", payload, asOrg(orgId))
  return res.data.data
}

export const updateProgramApi = async (
  orgId: string,
  programId: string,
  payload: Partial<ProgramWritePayload>
): Promise<Program> => {
  const res = await api.patch(`/page/programs/${programId}`, payload, asOrg(orgId))
  return res.data.data
}

export const deleteProgramApi = async (orgId: string, programId: string): Promise<void> => {
  await api.post(`/page/programs/${programId}/delete`, null, asOrg(orgId))
}

/** `ids` must be exactly the org's programs, else 400 "The list changed…". */
export const reorderProgramsApi = async (orgId: string, ids: string[]): Promise<Program[]> => {
  const res = await api.post("/page/programs/reorder", { ids }, asOrg(orgId))
  return res.data.data.programs
}

// ── Facilities ────────────────────────────────────────────────

export const getFacilitiesApi = async (orgId: string): Promise<PageFacilities> => {
  const res = await api.get("/page/facilities", asOrg(orgId))
  return res.data.data
}

export const saveLocationFacilitiesApi = async (
  orgId: string,
  locationId: string,
  payload: { items: string[]; custom_items: string[] }
): Promise<LocationFacilities> => {
  const res = await api.put(`/page/facilities/${locationId}`, payload, asOrg(orgId))
  return res.data.data
}

export const addFacilityPhotoApi = async (
  orgId: string,
  locationId: string,
  payload: { photo_url: string; photo_public_id: string }
): Promise<LocationFacilities> => {
  const res = await api.post(`/page/facilities/${locationId}/photos`, payload, asOrg(orgId))
  return res.data.data
}

export const deleteFacilityPhotoApi = async (orgId: string, photoId: string): Promise<void> => {
  await api.post(`/page/facilities/photos/${photoId}/delete`, null, asOrg(orgId))
}

export const reorderFacilityPhotosApi = async (
  orgId: string,
  locationId: string,
  ids: string[]
): Promise<FacilityPhoto[]> => {
  const res = await api.post(
    `/page/facilities/${locationId}/photos/reorder`,
    { ids },
    asOrg(orgId)
  )
  return res.data.data.photos
}

// ── Coaches ───────────────────────────────────────────────────

export const getCoachesApi = async (orgId: string): Promise<PageCoaches> => {
  const res = await api.get("/page/coaches", asOrg(orgId))
  return res.data.data
}

export const createCoachApi = async (orgId: string, payload: CoachCreatePayload): Promise<Coach> => {
  const res = await api.post("/page/coaches", payload, asOrg(orgId))
  return res.data.data
}

export const updateCoachApi = async (
  orgId: string,
  coachId: string,
  payload: CoachUpdatePayload
): Promise<Coach> => {
  const res = await api.patch(`/page/coaches/${coachId}`, payload, asOrg(orgId))
  return res.data.data
}

export const deleteCoachApi = async (orgId: string, coachId: string): Promise<void> => {
  await api.post(`/page/coaches/${coachId}/delete`, null, asOrg(orgId))
}

export const reorderCoachesApi = async (orgId: string, ids: string[]): Promise<Coach[]> => {
  const res = await api.post("/page/coaches/reorder", { ids }, asOrg(orgId))
  return res.data.data.coaches
}

// ── Players we developed: every call answers {players, candidates} ──

/** `q` narrows the candidates only; the picked list is always whole. */
export const getPlayersApi = async (orgId: string, q = ""): Promise<PagePlayers> => {
  const res = await api.get("/page/players", {
    ...asOrg(orgId),
    params: q.trim() ? { q: q.trim() } : undefined,
  })
  return res.data.data
}

export const addPlayerApi = async (
  orgId: string,
  payload: { user_id: string; highlight?: string }
): Promise<PagePlayers> => {
  const res = await api.post("/page/players", payload, asOrg(orgId))
  return res.data.data
}

export const updatePlayerApi = async (
  orgId: string,
  featuredId: string,
  payload: { highlight: string }
): Promise<PagePlayers> => {
  const res = await api.patch(`/page/players/${featuredId}`, payload, asOrg(orgId))
  return res.data.data
}

export const removePlayerApi = async (orgId: string, featuredId: string): Promise<PagePlayers> => {
  const res = await api.post(`/page/players/${featuredId}/remove`, null, asOrg(orgId))
  return res.data.data
}

export const reorderPlayersApi = async (orgId: string, ids: string[]): Promise<PagePlayers> => {
  const res = await api.post("/page/players/reorder", { ids }, asOrg(orgId))
  return res.data.data
}
