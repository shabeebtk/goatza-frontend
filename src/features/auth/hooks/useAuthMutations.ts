import { useMutation } from "@tanstack/react-query"
import {
  loginApi,
  signupApi,
  verifyOtpApi,
  type LoginPayload,
  type SignupPayload,
  type VerifyOtpPayload,
} from "../services/auth.api"
import { useAuthStore } from "@/store/auth.store"

// ── Login ────────────────────────────────────────────────────

export const useLogin = () => {
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: (data: LoginPayload) => loginApi(data),

    onSuccess: (data) => {
      // CASE 1: OTP required
      if ("verification_required" in data) {
        return
      }
      // CASE 2: Normal login + setauth 
      setAuth({
        token: data.access,
        user: data.user,
      })
    },
  })
}

// ── Signup ───────────────────────────────────────────────────
// Does NOT set auth — user must verify OTP first

export const useSignup = () => {
  return useMutation({
    mutationFn: (data: SignupPayload) => signupApi(data),
  })
}

// ── Verify OTP ───────────────────────────────────────────────

export const useVerifyOtp = () => {
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: (data: VerifyOtpPayload) => verifyOtpApi(data),
    onSuccess: (data) => {
      setAuth({ token: data.access, user: data.user })
    },
  })
}