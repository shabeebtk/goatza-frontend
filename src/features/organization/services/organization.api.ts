import { isAxiosError } from "axios"
import api from "@/core/api/axios"
import {
  CreateEligibility,
  CreatedOrganization,
  CreateOrganizationPayload,
  CreateOrgErrorCode,
  OrganizationDetail,
  OrganizationMini,
} from "../types"



export const getOrganizationsApi = async (): Promise<OrganizationMini[]> => {
  const res = await api.get("/organizations/list")
  return res.data.data
}

 
// ── API ───────────────────────────────────────────────────────
 
/** What a create that failed for want of a connection (or a 5xx) says. */
export const CREATE_ORG_CONNECTION_MESSAGE =
  "Couldn't create your page. Check your connection and try again."

/**
 * A refused create, typed. `code` is the server's (`username_taken`,
 * `username_invalid`, `org_limit`, `invalid`) or `network` for no response /
 * a 5xx. `field` names the input it belongs to; `fields` carries every field
 * message an `invalid` answer had.
 */
export class CreateOrgError extends Error {
  readonly code: CreateOrgErrorCode
  readonly field?: string
  readonly fields: Record<string, string>

  constructor(init: {
    code: CreateOrgErrorCode
    message: string
    field?: string
    fields?: Record<string, string>
  }) {
    super(init.message)
    this.name = "CreateOrgError"
    this.code = init.code
    this.field = init.field
    this.fields = init.fields ?? {}
  }
}

const KNOWN_CODES: CreateOrgErrorCode[] = [
  "username_taken",
  "username_invalid",
  "org_limit",
  "invalid",
]

/** Any throw from the create → a CreateOrgError the page can switch on. */
export function toCreateOrgError(err: unknown): CreateOrgError {
  if (err instanceof CreateOrgError) return err

  if (isAxiosError(err) && err.response && err.response.status < 500) {
    const body = err.response.data as
      | {
          message?: string
          data?: {
            code?: string
            field?: string
            message?: string
            errors?: Record<string, unknown>
          }
        }
      | undefined
    const data = body?.data ?? {}

    const fields: Record<string, string> = {}
    for (const [key, value] of Object.entries(data.errors ?? {})) {
      if (key !== "non_field_errors" && typeof value === "string" && value.trim()) {
        fields[key] = value
      }
    }

    const code = KNOWN_CODES.find((known) => known === data.code) ?? "unknown"
    return new CreateOrgError({
      code,
      message: data.message || body?.message || CREATE_ORG_CONNECTION_MESSAGE,
      field: data.field || undefined,
      fields,
    })
  }

  return new CreateOrgError({ code: "network", message: CREATE_ORG_CONNECTION_MESSAGE })
}

/** Rejects with a {@link CreateOrgError}, never a raw axios error. */
export const createOrganizationApi = async (
  payload: CreateOrganizationPayload
): Promise<CreatedOrganization> => {
  try {
    const res = await api.post("/organizations/create", payload)
    return res.data.data
  } catch (err) {
    throw toCreateOrgError(err)
  }
}

/** May this person make another page? (`{allowed, limit, used}`; 3 pages each.) */
export const getCreateEligibilityApi = async (): Promise<CreateEligibility> => {
  const res = await api.get("/organizations/create/eligibility")
  return res.data.data
}


export const getOrganizationDetailApi = async (
  identifier: string,
  by: "id" | "username" = "id"
): Promise<OrganizationDetail> => {
  const res = await api.get("/organizations/details", {
    params: {
      ...(by === "id" ? { organization_id: identifier } : { username: identifier }),
      type: "all",
    },
  })
  return res.data.data
}


// ── Logo / cover update ───────────────────────────────────────────
 
export type OrgMediaPayload =
  | { logo: string; logo_public_id: string }
  | { cover_image: string; cover_image_public_id: string }
  | { is_delete_logo: true }
  | { is_delete_cover: true }
 
/**
 * Attach (or clear) the logo / cover. Resolves with the stored URL of the
 * photo just attached — `?v=` included — when the server sends it back.
 *
 * org_id goes in the query string and names the org explicitly, so this works
 * while acting as the person too (the create page attaches the first logo
 * before it switches to the new page).
 */
export const updateOrgMediaApi = async (
  orgId:   string,
  payload: OrgMediaPayload,
  signal?: AbortSignal,
): Promise<string | undefined> => {
  const res = await api.post("/organizations/update/logo/cover", payload, {
    params: { org_id: orgId },
    signal,
  })
  const data = res.data?.data
  if (!data || typeof data !== "object") return undefined
  const url =
    "logo" in payload ? data.logo : "cover_image" in payload ? data.cover_image : undefined
  return typeof url === "string" && url ? url : undefined
}

// ── Update ───────────────────────────────────────────────────────

export const updateOrganizationApi = async (
  payload: Partial<OrganizationDetail>
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

export type OrgFollowPayload = {
  target_type: "organization"
  target_id: string
}

export const followOrganizationApi = async (
  payload: OrgFollowPayload
): Promise<void> => {
  await api.post("/connections/user/follow", payload)
}

export const unfollowOrganizationApi = async (
  payload: OrgFollowPayload
): Promise<void> => {
  await api.post("/connections/user/unfollow", payload)
}
