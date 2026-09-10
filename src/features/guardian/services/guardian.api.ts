import api from "@/core/api/axios"

import type {
  GuardianApprovalPayload,
  GuardianDetailsPayload,
  GuardianDetailsResponse,
} from "../types"

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
 * ./publicConsent.api.
 */

/**
 * POST /guardian/details — the parent's name and one way to reach them.
 *
 * The response is the BRANCH POINT for the whole flow: `shared_contact` means
 * the parent is reachable on the device in the child's hand and the approval
 * happens right here; `link_sent` means an email is on its way and the child
 * waits. The client never guesses this — only the server knows whether the
 * address it was given belongs to the child.
 */
export const submitGuardianDetailsApi = async (
  payload: GuardianDetailsPayload,
): Promise<GuardianDetailsResponse> => {
  const res = await api.post("/guardian/details", payload)
  return res.data.data
}

/**
 * POST /guardian/shared/approve — the parent approving on the child's device.
 *
 * Sent from the hand-the-phone step and from nowhere else. Success means the
 * gate is down and the child goes straight into the app, so the caller's next
 * move is to re-read the session rather than to show another screen.
 */
export const approveSharedContactApi = async (
  payload: GuardianApprovalPayload,
): Promise<void> => {
  await api.post("/guardian/shared/approve", payload)
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
 */
export const resendGuardianLinkApi = async (): Promise<GuardianDetailsResponse> => {
  const res = await api.post("/guardian/resend")
  return res.data.data
}
