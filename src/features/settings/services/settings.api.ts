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
