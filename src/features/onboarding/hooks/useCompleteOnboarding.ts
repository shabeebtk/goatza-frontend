import { useMutation } from "@tanstack/react-query"
import { completeOnboardingApi } from "../services/onboarding.api"
import { useAuthStore } from "@/store/auth.store"

// Finishes onboarding: flips the flag server-side, then in the auth store so the
// gate closes immediately. Role becomes permanently locked once this succeeds.
export const useCompleteOnboarding = () => {
  const setOnboardingCompleted = useAuthStore((s) => s.setOnboardingCompleted)

  return useMutation({
    mutationFn: completeOnboardingApi,
    onSuccess: () => {
      setOnboardingCompleted()
    },
  })
}
