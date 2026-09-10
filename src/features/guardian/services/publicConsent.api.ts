/**
 * The PARENT-FACING half of the guardian flow: a token in a URL, no account.
 *
 * Plain `fetch`, not the shared axios instance, for the same reason
 * `features/support/services/publicSupport.api.ts` avoids it: that instance
 * exists to read a JWT and the `X-Actor-*` headers out of `useAuthStore`, and
 * the person opening this link has neither. Worse, a parent who happens to have
 * their OWN Goatza session would have that token attached to a request
 * authorised by the link — two identities on one call, and a 401 on it would
 * drag them through the refresh interceptor for no reason.
 *
 * THE TOKEN IS THE CREDENTIAL. It is path-encoded on every call and never
 * logged, never put in a query string, and never sent anywhere but here.
 */

import { apiBase } from "@/shared/services/apiBase"

import type { GuardianApprovalPayload, GuardianConsentView } from "../types"

type ApiEnvelope<T> = {
  success?: boolean
  message?: string
  data?: T
}

/**
 * A request that reached the API and came back refused.
 *
 * Separate from a thrown plain Error, which means the network never completed —
 * a different failure with a different remedy. The page offers a retry for one
 * and a dead end for the other.
 */
export class GuardianConsentError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "GuardianConsentError"
    this.status = status
  }
}

const consentUrl = (token: string, suffix = "") =>
  `${apiBase()}/guardian/consent/${encodeURIComponent(token)}${suffix}`

async function readEnvelope<T>(res: Response): Promise<ApiEnvelope<T> | null> {
  try {
    return (await res.json()) as ApiEnvelope<T>
  } catch {
    return null
  }
}

/**
 * GET /guardian/consent/<token>
 *
 * A 404 or a 410 is NOT an error here — it is the answer. A link that has been
 * used, revoked or never existed resolves to `invalid`/`expired` and the page
 * shows its generic screen, which mentions no child and no account. Throwing
 * instead would land the parent on a retry button for something that will never
 * succeed.
 */
export async function fetchGuardianConsent(
  token: string,
): Promise<GuardianConsentView> {
  let res: Response

  try {
    res = await fetch(consentUrl(token), {
      headers: { Accept: "application/json" },
      // A consent state changes the moment the parent acts on it. Serving this
      // from any cache — the browser's, an intermediary's — would show a stale
      // "pending" to somebody who has already approved.
      cache: "no-store",
    })
  } catch {
    throw new Error("network")
  }

  if (res.status === 410) return { state: "expired" }
  if (res.status === 404 || res.status === 403) return { state: "invalid" }

  const parsed = await readEnvelope<GuardianConsentView>(res)

  if (!res.ok || !parsed?.data?.state) {
    throw new GuardianConsentError(
      parsed?.message || "We could not open this link right now.",
      res.status,
    )
  }

  return parsed.data
}

/** Shared by all three writes below — they differ only in the path suffix. */
async function postConsent(
  token: string,
  suffix: string,
  body?: unknown,
): Promise<void> {
  let res: Response

  try {
    res = await fetch(consentUrl(token, suffix), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body ?? {}),
    })
  } catch {
    throw new Error("network")
  }

  if (res.ok) return

  const parsed = await readEnvelope<unknown>(res)

  // 410 here means the link died between opening the page and pressing the
  // button — most often because it was already used in another tab. Its own
  // message, because "check your details" would send a parent hunting for a
  // mistake in a form that was fine.
  if (res.status === 410 || res.status === 404) {
    throw new GuardianConsentError(
      "This link is no longer active. Ask for a new one if you still need it.",
      res.status,
    )
  }

  throw new GuardianConsentError(
    parsed?.message || "That didn't go through. Please try again.",
    res.status,
  )
}

/** POST /guardian/consent/<token>/approve */
export const approveGuardianConsent = (
  token: string,
  payload: GuardianApprovalPayload,
) => postConsent(token, "/approve", payload)

/** POST /guardian/consent/<token>/decline */
export const declineGuardianConsent = (token: string) =>
  postConsent(token, "/decline")

/**
 * POST /guardian/consent/<token>/withdraw
 *
 * Takes permission back after it was given. Reachable from the same link,
 * which is why the approve screen tells the parent to keep the email — this is
 * the only door back in, and there is no account to log into instead.
 */
export const withdrawGuardianConsent = (token: string) =>
  postConsent(token, "/withdraw")
