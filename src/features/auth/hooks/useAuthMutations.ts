import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  googleCallbackApi,
  loginApi,
  logoutApi,
  signupApi,
  verifyOtpApi,
  type LoginPayload,
  type SignupPayload,
  type VerifyOtpPayload,
} from "../services/auth.api"
import { useAuthStore } from "@/store/auth.store"

// ── Login ────────────────────────────────────────────────────

export const useLogin = () => {
  const setSession = useAuthStore((s) => s.setSession)

  return useMutation({
    mutationFn: (data: LoginPayload) => loginApi(data),

    onSuccess: (data) => {
      // CASE 1: OTP required
      if ("verification_required" in data) {
        return
      }
      // CASE 2: Normal login + setauth 
      setSession({
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
  const setSession = useAuthStore((s) => s.setSession)

  return useMutation({
    mutationFn: (data: VerifyOtpPayload) => verifyOtpApi(data),
    onSuccess: (data) => {
      setSession({
        token: data.access,
        user: data.user,
      })
    },
  })
}

export const useGoogleAuth = () => {
  const setSession = useAuthStore((s) => s.setSession)

  return useMutation({
    mutationFn: googleCallbackApi,
    onSuccess: (data) => {
      setSession({
        token: data.access,
        user: data.user,
      })
    },
  })
}


export const useLogout = () => {
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: logoutApi,

    onSettled: async () => {
      clearAuth()
      await queryClient.clear()
    },
  })
}