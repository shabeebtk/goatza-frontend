import api from "@/core/api/axios"
import { CreateOrganizationPayload, Organization, OrganizationMini } from "../types"



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