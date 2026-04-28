import api from "@/core/api/axios"
import { CreateOrganizationPayload, Organization, OrganizationDetail, OrganizationMini } from "../types"



export const getOrganizationsApi = async (): Promise<OrganizationMini[]> => {
  const res = await api.get("/organizations/list")
  return res.data.data
}

 
// ── API ───────────────────────────────────────────────────────
 
export const createOrganizationApi = async (
  payload: CreateOrganizationPayload
): Promise<Organization> => {
  const res = await api.post("/organizations/create", payload)
  return res.data.data
}


export const getOrganizationDetailApi = async (
  orgId: string
): Promise<OrganizationDetail> => {
  const res = await api.get("/organizations/details", {
    params: { organization_id: orgId, type: "all" },
  })
  return res.data.data
}



// ── Logo / cover update ───────────────────────────────────────────
 
export type OrgMediaPayload =
  | { logo: string; logo_public_id: string }
  | { cover_image: string; cover_image_public_id: string }
  | { is_delete_logo: true }
  | { is_delete_cover: true }
 
export const updateOrgMediaApi = async (
  orgId:   string,
  payload: OrgMediaPayload,
): Promise<void> => {
  // org_id in query params, body carries the media fields
  await api.post("/organizations/update/logo/cover", payload, {
    params: { org_id: orgId },
  })
}

// ── Update ───────────────────────────────────────────────────────

export const updateOrganizationApi = async (
  payload: Partial<Organization>
): Promise<OrganizationDetail> => {
  const res = await api.patch("/organizations/update", payload)
  return res.data.data
}

// ── Locations ────────────────────────────────────────────────────

import { OrgLocationPayload } from "../types"

export const upsertOrgLocationApi = async (
  payload: OrgLocationPayload
): Promise<void> => {
  await api.post("/organizations/locations/upsert", payload)
}

export const deleteOrgLocationApi = async (
  locationId: string
): Promise<void> => {
  await api.delete("/organizations/locations/delete", {
    params: { location_id: locationId },
  })
}