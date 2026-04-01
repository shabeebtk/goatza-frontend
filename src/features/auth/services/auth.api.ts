import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

export type LoginPayload = {
  email: string
  password: string
}

export type SignupPayload = {
  name: string
  email: string
  password: string
  role: string
}

export type VerifyOtpPayload = {
  email: string
  otp: string
}

export type AuthUser = {
  id: string
  username: string
  email: string
  role: string
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