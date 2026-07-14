import api from "@/core/api/axios"
import type { AuthUser } from "@/features/auth/services/auth.api"

// Marks the post-signup onboarding flow finished. Idempotent server-side, so it's
// safe to call even if the flag is already set. Returns the refreshed user.
export const completeOnboardingApi = async (): Promise<AuthUser> => {
  const res = await api.post("/user/onboarding/complete")
  return res.data.data
}
