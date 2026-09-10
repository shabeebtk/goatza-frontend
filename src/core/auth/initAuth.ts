import { getUserApi } from "@/features/auth/services/auth.api"
import { useAuthStore } from "@/store/auth.store"
import { syncGuardianFromServer } from "@/features/guardian/store/guardian.store"
import { getFreshAccessToken, SessionExpiredError } from "@/core/auth/refreshManager"

const RETRY_DELAYS_MS = [1_000, 3_000]
let recoveryArmed = false

export const initAuth = async (attempt = 0): Promise<void> => {
  const { setLoading, setSession, clearAuth } = useAuthStore.getState()
  if (attempt === 0) setLoading(true)

  try {
    const token = await getFreshAccessToken()
    const user = await getUserApi()
    setSession({ token, user })

    /*
      THE GUARDIAN LOCK, re-established from the server on every boot.

      The guardian store is per-tab sessionStorage, so without this a locked
      child could open a second tab — or just reload after it expired — and
      arrive with the gate holding nothing. /user/details is exempt from the
      server's own gate precisely so this call still works while the account is
      locked; the block it returns is the authority, and it also clears the
      flow the moment a parent approves.
    */
    syncGuardianFromServer(user?.guardian)
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      clearAuth() // definitive — show login
      return
    }
    // Retryable (offline PWA cold start, flaky network, 5xx)
    if (attempt < RETRY_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
      return initAuth(attempt + 1)
    }
    // Give up for now WITHOUT killing the server-side session (cookie stays).
    // AuthGuard will show /auth; armRecovery() re-runs bootstrap on
    // reconnect/refocus, and the /auth page (Change 6) auto-redirects to
    // /home once it succeeds — self-healing.
    useAuthStore.getState().setLoading(false)
    armRecovery()
    return
  } finally {
    useAuthStore.getState().setLoading(false)
  }
}

function armRecovery() {
  if (recoveryArmed || typeof window === "undefined") return
  recoveryArmed = true
  const retry = () => {
    if (useAuthStore.getState().isAuthenticated) return
    initAuth()
  }
  window.addEventListener("online", retry)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") retry()
  })
}
