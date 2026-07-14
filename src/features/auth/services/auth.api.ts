import api from "@/core/api/axios"
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
}

export type VerifyOtpPayload = {
  email: string
  otp: string
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
  name: string
  profile_photo: string
  is_email_verified: boolean
}

export type AuthTokenResponse = {
  access: string
  user: AuthUser
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

export const refreshApi = async () => {
  const res = await api.post("/user/token/refresh")
  return res.data.data
}


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
}) => {
  const res = await api.get("/user/auth/google/callback", {
    params,
  })
  return res.data.data
}


// One-time onboarding step: set the signed-in user's role (used after Google signup)
export const setRoleApi = async (role: UserRole): Promise<AuthUser> => {
  const res = await api.post("/user/role", { role })
  return res.data.data
}