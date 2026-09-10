"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"

import { useAuthStore } from "@/store/auth.store"

import { useGuardianStore } from "../store/guardian.store"

/**
 * Keeps a child whose guardian has not approved the account out of the app.
 *
 * Mounted once inside AuthGuard, beside OnboardingGate and LegalConsentGate, so
 * it follows the user everywhere and typing a URL around it does nothing.
 *
 * WHY IT EXISTS. A verified minor HAS a real session — the OTP handed back a
 * token — so nothing in the client stopped them typing /home and browsing while
 * their parent had not answered. The server refuses all of it (403
 * GUARDIAN_CONSENT_REQUIRED, on reads as well as writes), but a wall of failed
 * requests is not a screen. This turns that refusal into the right screen.
 *
 * IT IS NOT THE ENFORCEMENT. `guardians/permissions.py` is, on every request.
 * This only decides what the child looks at, and it is fed by three server
 * signals in order of how early they arrive: `guardian_required` on the OTP and
 * role responses, the `guardian` block on GET /user/details at session start,
 * and a 403 from any gated endpoint as the backstop. All three write to the
 * same store, so any one of them is enough.
 *
 * WHERE IT SENDS THEM depends on how far the flow got — the details step and
 * the hand-the-phone step both live on /auth, the wait has its own route.
 */

/**
 * Paths the gate leaves alone.
 *
 * `/auth` is where the flow itself renders, so redirecting to it from inside it
 * would be a loop. `/guardian/` is the PARENT's consent page — a parent who
 * happens to have their own Goatza session must be able to open their child's
 * link without this bouncing them into their own signup flow.
 */
const ALLOWED_PREFIXES = ["/auth", "/guardian/"]

export default function GuardianGate() {
  const router = useRouter()
  const pathname = usePathname()

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  const required = useGuardianStore((s) => s.required)
  const mode = useGuardianStore((s) => s.mode)

  useEffect(() => {
    if (isLoading || !isAuthenticated || !required) return

    const path = pathname ?? ""
    if (ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix))) return

    // `replace`, not `push`: the page they were bounced off is not somewhere
    // Back should return them to.
    router.replace(mode === "link_sent" ? "/auth/guardian/waiting" : "/auth")
  }, [isLoading, isAuthenticated, required, mode, pathname, router])

  // Renders nothing, ever. Unlike its two siblings it has no modal of its own —
  // the guardian screens are full steps on /auth, not an overlay, because the
  // parent has to be able to read them without the child's half-finished app
  // showing through behind.
  return null
}
