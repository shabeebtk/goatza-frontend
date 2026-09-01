/**
 * /report-problem — the logged-out bug report.
 *
 * THE HYPHEN IS LOAD-BEARING. `/[username]` sits directly beside these
 * top-level segments, and usernames are `[a-z0-9_]` with no hyphens
 * (`utils.validations.validate_username_format` on the backend), so a
 * hyphenated segment can never be claimed by an account. That is why this
 * route needs no entry in RESERVED_USERNAMES — and why RENAMING IT to
 * something without a hyphen ("report", "support") MUST be accompanied by
 * adding that word to RESERVED_USERNAMES, or the first person to register the
 * handle takes the page down.
 *
 * Inside `(public)` because its layout is a server component and is NOT wrapped
 * in AuthGuard, which would bounce the exact visitor this page exists for
 * straight back to the login screen that is failing them.
 */

import type { Metadata } from "next"

import PublicProblemReportPage from "@/features/support/components/PublicProblemReportPage/PublicProblemReportPage"

export const metadata: Metadata = {
  title: "Report a problem · Goatza",
  description:
    "Tell us about a bug or a screen that won't load — no account needed.",
  // Nothing here is worth ranking for, and an indexed anonymous write form
  // invites exactly the traffic the 3/hour throttle behind it exists to stop.
  robots: { index: false },
}

export default function ReportProblemRoute() {
  return <PublicProblemReportPage />
}
