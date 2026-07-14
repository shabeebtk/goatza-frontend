import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  forgotPasswordApi,
  googleCallbackApi,
  loginApi,
  logoutApi,
  resetPasswordApi,
  setRoleApi,
  signupApi,
  verifyOtpApi,
  type ForgotPasswordPayload,
  type LoginPayload,
  type ResetPasswordPayload,
  type SignupPayload,
  type VerifyOtpPayload,
} from "../services/auth.api"
import { useAuthStore } from "@/store/auth.store"
import type { UserRole } from "@/shared/constants/roles"

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

// ── Forgot password ──────────────────────────────────────────
// Step 1: request an OTP for the given email.

export const useForgotPassword = () => {
  return useMutation({
    mutationFn: (data: ForgotPasswordPayload) => forgotPasswordApi(data),
  })
}

// ── Reset password ───────────────────────────────────────────
// Step 2: verify OTP + set the new password.

export const useResetPassword = () => {
  return useMutation({
    mutationFn: (data: ResetPasswordPayload) => resetPasswordApi(data),
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


// ── Set role (post-Google onboarding) ────────────────────────
// One-time role selection. Updates the store user in place on success.

export const useSetRole = () => {
  const setUserRole = useAuthStore((s) => s.setUserRole)

  return useMutation({
    mutationFn: (role: UserRole) => setRoleApi(role),
    onSuccess: (data) => {
      setUserRole(data.role)
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