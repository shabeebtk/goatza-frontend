import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

/** The seven categories, exactly as the backend's `ProblemCategory` spells them. */
export type ProblemCategory =
  | "not_working"
  | "display_issue"
  | "performance"
  | "account_login"
  | "media_upload"
  | "suggestion"
  | "other"

/**
 * One attached screenshot.
 *
 * BOTH halves travel. The key is not redundant with the URL: the server
 * re-checks that it sits under the caller's own storage prefix before it
 * trusts the URL, and a URL with no key cannot be checked at all.
 */
export type ProblemScreenshot = {
  url: string
  key: string
}

/**
 * Diagnostics collected by the client — see `clientContext.ts`.
 *
 * A loose record rather than a fixed shape, because the server allow-lists
 * what it stores anyway and a client that learns to report something new
 * should not need a type change to send it. Everything outside the allow-list
 * is dropped server-side, silently.
 */
export type ProblemClientContext = Record<string, string>

export type ProblemReportPayload = {
  category: ProblemCategory
  description: string
  screenshots?: ProblemScreenshot[]
  contact_email?: string
  client_context: ProblemClientContext
}

/**
 * The whole answer: a reference code, and nothing else.
 *
 * No id, no status, no echo of what was sent — a confirmation is not a
 * receipt. The code is for correspondence ("any update on GZ-7K4M2P") and
 * there is deliberately no endpoint that looks one up.
 */
export type ProblemReportResult = {
  reference: string
}

// ── API ──────────────────────────────────────────────────────

/**
 * The AUTHENTICATED report route, so the shared axios instance is what we
 * want: the JWT it attaches is what lets screenshots be uploaded and attached
 * at all, and the X-Actor-* headers are what record whether the bug was hit
 * from a personal account or from a club.
 *
 * The logged-out route is a different endpoint under /public/ and does not
 * belong on this instance.
 */
export const submitProblemReportApi = async (
  payload: ProblemReportPayload
): Promise<ProblemReportResult> => {
  const res = await api.post("/support/problem-report", payload)
  return res.data.data
}
