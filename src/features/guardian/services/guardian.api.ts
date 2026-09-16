import api from "@/core/api/axios"

import type { GuardianDetailsPayload, GuardianDetailsResponse } from "../types"

/**
 * The SIGNED-IN half of the guardian flow — the two calls the child's own
 * device makes, straight after the OTP.
 *
 * These go through the shared axios instance because by this point there IS a
 * session: verify/otp returned an access token and the store already holds it.
 * The child is signed in and gated, not signed out — which is what lets the
 * flow resume after a refresh instead of starting the signup again.
 *
 * The parent-facing consent page is the other half and shares nothing with
 * this: no session, no interceptors, a token in the URL. It lives in
 * ./publicConsent.api. Nothing on THIS side approves anything: every approval
 * arrives through the parent's link, whichever inbox it went to.
 */

/**
 * POST /guardian/details — the parent's name and one way to reach them.
 *
 * Always answers `link_sent`: an email goes out whatever the address, the
 * child's own sign-up email included. `same_as_login_contact` is the server
 * saying so — the client never guesses whether the address it was given
 * belongs to the child — and the waiting screen words itself accordingly.
 */
export const submitGuardianDetailsApi = async (
  payload: GuardianDetailsPayload,
): Promise<GuardianDetailsResponse> => {
  const res = await api.post("/guardian/details", payload)
  return res.data.data
}

/**
 * POST /guardian/resend — send the link again, on a fresh token.
 *
 * NO BODY, deliberately, and that is the whole point of it existing separately
 * from /guardian/details: the guardian and the channel come from the standing
 * request, so a resend cannot quietly become "email a different address". That
 * would be /guardian/details with a rate limit somebody forgot.
 *
 * Throttled hard on the server. The person on the other end has no account and
 * no way to unsubscribe, so a child tapping this repeatedly must not turn into
 * a parent being mailed repeatedly.
 *
 * Refused with `code: "consent_declined"` once the parent has said no to the
 * standing request — the waiting screen hides this button in that state and
 * offers a fresh request instead.
 */
export const resendGuardianLinkApi = async (): Promise<GuardianDetailsResponse> => {
  const res = await api.post("/guardian/resend")
  return res.data.data
}
