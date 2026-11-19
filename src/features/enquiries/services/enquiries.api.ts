import api from "@/core/api/axios"

import type {
  EnquiryAlerts,
  EnquiryDetail,
  InboxFilters,
  InboxPage,
  UpdateEnquiryBody,
} from "../types"

// The inbox belongs to the ORG: every call names it (asOrg), like squads and the
// page editor, so a screen that outlives an account switch reads the right one.
const asOrg = (orgId: string) => ({ actor: { type: "organization" as const, id: orgId } })

// The email switch belongs to the PERSON, whatever account is active: it is
// their inbox the emails land in. The org is named in the call instead. A 404
// means they don't hold enquiries.manage at that org (any more).
const asPerson = { actor: { type: "user" as const } }

// ── The inbox (enquiries.manage) ──────────────────────────────

export const getInboxApi = async (
  orgId: string,
  { status, program_id, location_id, cursor }: InboxFilters & { cursor?: string | null }
): Promise<InboxPage> => {
  const res = await api.get("/enquiries/inbox", {
    ...asOrg(orgId),
    params: {
      status,
      ...(program_id ? { program_id } : {}),
      ...(location_id ? { location_id } : {}),
      ...(cursor ? { cursor } : {}),
    },
  })
  return res.data.data
}

export const getEnquiryApi = async (orgId: string, enquiryId: string): Promise<EnquiryDetail> => {
  const res = await api.get(`/enquiries/${enquiryId}`, asOrg(orgId))
  return res.data.data
}

export const updateEnquiryApi = async (
  orgId: string,
  enquiryId: string,
  body: UpdateEnquiryBody
): Promise<EnquiryDetail> => {
  const res = await api.patch(`/enquiries/${enquiryId}`, body, asOrg(orgId))
  return res.data.data
}

export const getUnreadCountApi = async (orgId: string): Promise<{ new: number }> => {
  const res = await api.get("/enquiries/inbox/unread-count", asOrg(orgId))
  return res.data.data
}

// ── The person's email switch ─────────────────────────────────

export const getEnquiryAlertsApi = async (orgId: string): Promise<EnquiryAlerts> => {
  const res = await api.get("/enquiries/alerts", { ...asPerson, params: { org_id: orgId } })
  return res.data.data
}

export const updateEnquiryAlertsApi = async (
  orgId: string,
  email: boolean
): Promise<EnquiryAlerts> => {
  const res = await api.patch("/enquiries/alerts", { org_id: orgId, email }, asPerson)
  return res.data.data
}
