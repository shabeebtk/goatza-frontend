import { useMutation } from "@tanstack/react-query"
import {
  forgotPasswordApi,
  googleCallbackApi,
  loginApi,
  resetPasswordApi,
  setRoleApi,
  signupApi,
  verifyOtpApi,
  type ForgotPasswordPayload,
  type LoginPayload,
  type ResetPasswordPayload,
  type SetRoleExtras,
  type SignupPayload,
  type VerifyOtpPayload,
} from "../services/auth.api"
import { useAuthStore } from "@/store/auth.store"
import {
  startGuardianFlow,
  syncGuardianFromServer,
} from "@/features/guardian/store/guardian.store"
import { useOnboardingStore } from "@/features/onboarding/store/onboarding.store"
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
      // Fresh login re-evaluates onboarding (clears any prior "Skip for now").
      useOnboardingStore.getState().resetSession()
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
      // New signup: start onboarding clean, ignoring any stale skip flag.
      useOnboardingStore.getState().resetSession()
      // A minor's account needs a parent or guardian before it is usable.
      // `guardian_required` is a bare boolean at the TOP LEVEL of the response
      // — not a nested block. Reading it in the wrong place is what kept the
      // parent screen from ever appearing.
      startGuardianFlow(data.guardian_required)
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
      // Fresh Google login re-evaluates onboarding (esp. forced role step).
      useOnboardingStore.getState().resetSession()
      /*
        DELIBERATELY NOT the guardian check. The Google callback does not know
        yet — a Google account arrives with no birthdate at all, so there is
        nothing to assess, and the response carries no `guardian_required`.

        The Google path is assessed at the ROLE step (POST /user/role), which
        is the first moment a birthdate is on file and the one step a new
        Google user cannot skip. See useSetRole below.

        `undefined` clears any stale flow left in the tab by a previous signup.
      */
      startGuardianFlow(undefined)
    },
  })
}


// ── Set role (post-Google onboarding) ────────────────────────
// One-time role selection. Updates the store user in place on success.

export const useSetRole = () => {
  const setUserRole = useAuthStore((s) => s.setUserRole)

  return useMutation({
    mutationFn: ({ role, ...extras }: { role: UserRole } & SetRoleExtras) =>
      setRoleApi(role, extras),
    onSuccess: (data) => {
      setUserRole(data.role)

      /*
        THE GOOGLE PATH'S MINOR LOCK, and the twin of the one in useVerifyOtp.

        This endpoint is the age gate for Google signups: it is where the
        birthdate is first collected, so it is the first moment the server can
        tell whether this account needs a parent. It answers on the same
        response, in the same shape as the OTP one.

        Which is why RoleStep has to act on it — an onboarding modal that
        carried on to the next step here would walk the child into a wall of
        403s from every endpoint the rest of onboarding writes to.
      */
      startGuardianFlow(data.guardian_required)
    },
  })
}

/**
 * The `guardian` block from GET /user/details, pushed into the guardian store.
 *
 * Exported for the session bootstrap (core/auth/initAuth), which is not a
 * component and calls this directly. It is what makes a locked account still
 * locked in a brand-new tab — the store is per-tab sessionStorage, so without
 * this a child could open a second tab and find the gate holding nothing.
 */
export { syncGuardianFromServer }

// NOTE: logout lives in ./useLogout — one hook, used by AppNav and Settings.
