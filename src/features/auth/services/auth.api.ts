import api from "@/core/api/axios"
import type { GuardianStatusBlock } from "@/features/guardian/types"
import type { UserRole } from "@/shared/constants/roles"

// ── Types ────────────────────────────────────────────────────

export type LoginPayload = {
  email: string
  password: string
}

export type SignupPayload = {
  name: string
  email: string
  password: string
  role: UserRole
  /**
   * The signup checkbox. Always literally `true` — the backend rejects
   * anything else, including the string "false", which is truthy.
   *
   * This is the ONLY place the email flow records consent: the user has no
   * token until the OTP is verified, so the client cannot call legal/accept on
   * their behalf. The server files it in the same transaction that creates the
   * account (accounts/views/user_auth_views.py).
   */
  accepted_terms: true
  /**
   * ISO "YYYY-MM-DD". Required — the backend refuses a signup without it, for
   * the same reason it refuses one without consent: the user is anonymous
   * until the OTP is verified, so there is no later moment at which the client
   * could supply it. An account with no birthdate reads as a minor forever.
   */
  birthdate: string
  /**
   * ISO-3166-1 alpha-2. The LEGAL jurisdiction, which the backend cross-checks
   * against the phone's dialling code and may override with a stricter one —
   * so the value that comes back on the user is not always the one sent here.
   * Unrelated to the profile's location country.
   */
  country_code: string
}

export type VerifyOtpPayload = {
  email: string
  otp: string
}

export type ResendOtpPayload = {
  email: string
}

/**
 * The reply to a resend request, and it deliberately says almost nothing.
 *
 * The server answers the SAME generic success whether the address has an
 * unverified account, is already verified, or has never been seen — telling
 * them apart would turn this endpoint into a "does this person have a Goatza
 * account" oracle for anyone typing addresses at it. So there is no "sent"
 * boolean to branch on here: the client shows "OTP sent" and restarts its
 * timer either way, which is the whole contract.
 */
export type ResendOtpResponse = {
  email: string
}

export type ForgotPasswordPayload = {
  email: string
}

export type ResetPasswordPayload = {
  email: string
  otp: string
  new_password: string
}

export type AuthUser = {
  id: string
  username: string
  email: string
  role: UserRole
  is_role_confirmed: boolean
  is_onboarding_completed: boolean
  name: string
  profile_photo: string
  is_email_verified: boolean
  /** ISO-3166-1 alpha-2 legal jurisdiction, "" for accounts predating the gate. */
  country_code: string
  /**
   * Whether this user is a minor under THEIR OWN country's rules — the consent
   * age differs per jurisdiction, so this is computed server-side and the
   * client branches on the boolean rather than reimplementing the table.
   *
   * True when the birthdate is unknown. Nothing consumes it yet.
   */
  is_minor: boolean
  /**
   * Present on the user from GET /user/details only — the login, OTP and
   * Google responses serialise a user without it. That call is the one the
   * client makes at every session start, which is what lets a locked child's
   * screen render on a cold boot rather than only in the tab that signed up.
   */
  guardian?: GuardianStatusBlock
}

export type AuthTokenResponse = {
  access: string
  user: AuthUser
  /**
   * True when the account cannot be used until a parent or guardian says so.
   *
   * A BARE BOOLEAN, sitting beside `user` rather than inside it — that is the
   * server's shape (`accounts/views/user_auth_views.py`), and it is deliberate
   * on their side: "is this account a minor" and "does it still need a
   * guardian" are different questions, and an approved minor answers True to
   * the first and False to this.
   *
   * It carries no `mode`. Nobody has named a parent at this point, so there is
   * nothing to report — the mode comes back from POST /guardian/details.
   *
   * The token above is still real: the child IS signed in, which is what lets
   * the guardian steps call the API on their behalf. It is the SERVER that
   * keeps them out of everything else (guardians/permissions.py); this flag
   * only tells the client which screen to open.
   */
  guardian_required?: boolean
}

type LoginResponse =
  | {
      access: string
      user: AuthUser
    }
  | {
      email: string
      verification_required: true
    }

export type SignupResponse = {
  email: string
  verification_required: boolean
}

// ── API calls ────────────────────────────────────────────────

export const loginApi = async (data: LoginPayload): Promise<LoginResponse> => {
  const res = await api.post("/user/login", data)
  return res.data.data
}

export const signupApi = async (data: SignupPayload): Promise<SignupResponse> => {
  const res = await api.post("/user/signup", data)
  return res.data.data
}

export const verifyOtpApi = async (data: VerifyOtpPayload): Promise<AuthTokenResponse> => {
  const res = await api.post("/user/verify/otp", data)
  return res.data.data
}

/**
 * Send the signup verification code again.
 *
 * Two limits sit behind this and the client sees them differently. A 429 with
 * the server's own message is the 30s per-ADDRESS cooldown, which is normal
 * impatience and worth showing verbatim; the per-caller throttle is the abuse
 * limit and shows up the same way. Neither is an error the user can fix by
 * retrying immediately, so the caller keeps the countdown running on both.
 */
export const resendSignupOtpApi = async (
  data: ResendOtpPayload
): Promise<ResendOtpResponse> => {
  const res = await api.post("/user/resend/otp", data)
  return res.data.data
}

export const forgotPasswordApi = async (
  data: ForgotPasswordPayload
): Promise<{ email: string }> => {
  const res = await api.post("/user/forgot/password", data)
  return res.data.data
}

export const resetPasswordApi = async (
  data: ResetPasswordPayload
): Promise<void> => {
  await api.post("/user/reset/password", data)
}

export const logoutApi = async () => {
  await api.post("/user/logout")
}

// NOTE: there is no refreshApi here on purpose — src/core/auth/refreshManager.ts
// is the only caller of /user/token/refresh (single-flight + rotation-safe).

export const getUserApi = async () => {
  const res = await api.get("/user/details")
  return res.data.data
}


export const getGoogleLoginUrl = async () => {
  const res = await api.get("/user/auth/google/login/url")
  return res.data.data
}

export const googleCallbackApi = async (params: {
  code: string
  state: string
}): Promise<AuthTokenResponse> => {
  const res = await api.get("/user/auth/google/callback", {
    params,
  })
  return res.data.data
}


/**
 * One-time onboarding step: set the signed-in user's role (used after Google
 * signup).
 *
 * `acceptedTerms` is the Google half of consent. A Google account is created
 * without anyone having agreed to anything — the button lives on Google's
 * screen — so it is created with the documents PENDING, and this step, which a
 * new Google user cannot skip, is where the agreement is made and recorded.
 * The backend requires it whenever the user still has pending documents and
 * ignores it otherwise, so an existing user changing role sends nothing.
 *
 * `birthdate` and `country_code` are the Google half of the AGE GATE, and they
 * are here for exactly the same reason as consent: a Google account is created
 * without anyone being asked anything, so this step — the one a new Google user
 * cannot skip — is where both are collected. The backend requires them only
 * when the user does not already have them on file, so an email signup passing
 * through, or a role change later in onboarding, sends nothing.
 */
export type SetRoleExtras = {
  acceptedTerms?: boolean
  /** ISO "YYYY-MM-DD". */
  birthdate?: string
  /** ISO-3166-1 alpha-2. */
  countryCode?: string
}

/**
 * The role response is the user payload PLUS the Google path's minor lock.
 *
 * `guardian_required` sits alongside the user rather than inside it, exactly as
 * it does on the OTP response — it says what the client should DO next, which
 * is not a property of the account.
 */
export type SetRoleResponse = AuthUser & { guardian_required?: boolean }

export const setRoleApi = async (
  role: UserRole,
  extras: SetRoleExtras = {},
): Promise<SetRoleResponse> => {
  const { acceptedTerms, birthdate, countryCode } = extras

  const res = await api.post("/user/role", {
    role,
    ...(acceptedTerms ? { accepted_terms: true } : {}),
    ...(birthdate ? { birthdate } : {}),
    ...(countryCode ? { country_code: countryCode } : {}),
  })
  return res.data.data
}