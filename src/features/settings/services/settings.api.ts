import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

export type ChangePasswordPayload = {
  current_password: string
  new_password: string
}

/**
 * The backend kills every other session and hands THIS device a brand-new one:
 * a fresh refresh cookie plus the access token below. Store it or the next
 * request goes out on a token whose session no longer exists.
 */
export type ChangePasswordResponse = {
  access_token: string
}

/** Error codes the endpoint returns under `data.code` — see CHANGE_PASSWORD_ERRORS. */
export type ChangePasswordErrorCode =
  | "missing_fields"
  | "invalid_current_password"
  | "invalid_new_password"
  | "same_password"

// ── API calls ────────────────────────────────────────────────

export const changePasswordApi = async (
  data: ChangePasswordPayload
): Promise<ChangePasswordResponse> => {
  const res = await api.post("/user/change/password", data)
  return res.data.data
}

// ── Privacy ──────────────────────────────────────────────────

export type PublicProfileToggleResponse = {
  is_public_profile: boolean
}

/**
 * Show or hide the signed-in user's profile from logged-out visitors.
 *
 * Does NOT affect in-app visibility — every Goatza user still sees the profile
 * exactly as before, and a hidden profile stays shareable in DMs. See
 * UserProfile.is_public_profile on the backend.
 */
export const updatePublicProfileApi = async (
  isPublic: boolean
): Promise<PublicProfileToggleResponse> => {
  const res = await api.patch("/user/privacy/public-profile", {
    is_public_profile: isPublic,
  })
  return res.data.data
}

/**
 * Same for the organization the caller is currently acting as.
 *
 * Owner/admin only, enforced server-side — the disabled state on the settings
 * row is a courtesy, not the gate.
 */
export const updateOrgPublicProfileApi = async (
  isPublic: boolean
): Promise<PublicProfileToggleResponse> => {
  const res = await api.patch("/organizations/privacy/public-profile", {
    is_public_profile: isPublic,
  })
  return res.data.data
}
