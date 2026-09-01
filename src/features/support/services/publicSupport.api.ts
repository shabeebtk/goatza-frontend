/**
 * The logged-out problem report, called with plain `fetch`.
 *
 * Deliberately NOT the shared axios instance, for the same reason
 * `features/join/services/join.api.ts` and
 * `features/profile/services/publicProfile.api.ts` avoid it: that instance
 * exists to read a JWT and the `X-Actor-*` headers out of `useAuthStore`, and a
 * visitor with no session has neither. This endpoint is anonymous by design —
 * the whole reason it exists is the person who CANNOT log in — so there is no
 * token to send and no actor to name, and reaching for the interceptor stack
 * would only add a store read to a request that must work without one.
 *
 * Runs in the browser only (the form is a client component), so it uses the
 * shared browser-side `apiBase` rather than the server-aware resolution in
 * publicProfile.api.ts.
 */

import { apiBase } from "@/shared/services/apiBase"

import type {
  ProblemCategory,
  ProblemClientContext,
  ProblemReportResult,
} from "./support.api"

/**
 * NO SCREENSHOTS on this payload, and there is no field for them.
 *
 * A presigned upload handed to an anonymous caller is a write path into our
 * bucket from the open internet; the backend refuses attachments without a
 * session, so a field here could only ever produce a 400.
 *
 * `contact_email` is REQUIRED. There is no account to reply through, and a bug
 * we cannot ask a follow-up question about is often a bug we cannot reproduce.
 *
 * `website` is always sent, blank or not — see the form.
 */
export type PublicProblemReportPayload = {
  category: ProblemCategory
  description: string
  contact_email: string
  client_context: ProblemClientContext
  website: string
}

/**
 * A request that reached the API and came back refused.
 *
 * `fieldErrors` carries the backend's per-field map so the form can point at
 * the input that failed rather than showing one generic line at the top. Same
 * shape and same reasoning as `JoinApiError` — a thrown plain Error means the
 * network never completed, which is a different failure with a different
 * remedy (retry).
 */
export class PublicSupportApiError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, string>

  constructor(
    message: string,
    status: number,
    fieldErrors: Record<string, string> = {},
  ) {
    super(message)
    this.name = "PublicSupportApiError"
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

type ApiEnvelope<T> = {
  success?: boolean
  message?: string
  data?: T
}

/** The backend's error envelope: `data.errors` is `{ field: "message" }`. */
function readFieldErrors(data: unknown): Record<string, string> {
  if (!data || typeof data !== "object") return {}

  const errors = (data as { errors?: unknown }).errors
  if (!errors || typeof errors !== "object") return {}

  const out: Record<string, string> = {}
  for (const [field, message] of Object.entries(errors)) {
    if (typeof message === "string") out[field] = message
  }
  return out
}

/**
 * POST /public/support/problem-report
 *
 * A tripped honeypot comes back as an ORDINARY SUCCESS carrying a real-looking
 * reference, with nothing written server-side. That is the design, and it is
 * why there is no branch for it here: a client that could tell the two apart
 * would be a client a bot could read the answer out of.
 */
export async function submitPublicProblemReport(
  payload: PublicProblemReportPayload,
): Promise<ProblemReportResult> {
  let res: Response

  try {
    res = await fetch(`${apiBase()}/public/support/problem-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    })
  } catch {
    // Never reached the server: no status, nothing to show per-field. The form
    // turns this into a retry line and leaves everything as typed.
    throw new Error("network")
  }

  // 429 has its own copy. The generic "check your details" line would send
  // somebody hunting for a mistake in a form that is perfectly fine.
  if (res.status === 429) {
    throw new PublicSupportApiError(
      "Too many reports from this connection. Try again in a little while.",
      429,
    )
  }

  let parsed: ApiEnvelope<ProblemReportResult & { errors?: unknown }> | null

  try {
    parsed = await res.json()
  } catch {
    parsed = null
  }

  if (!res.ok || !parsed?.success || !parsed.data?.reference) {
    throw new PublicSupportApiError(
      parsed?.message || "Could not send your report right now.",
      res.status,
      readFieldErrors(parsed?.data),
    )
  }

  return { reference: parsed.data.reference }
}
