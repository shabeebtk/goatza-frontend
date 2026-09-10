/**
 * /auth/guardian/waiting — the child waiting on a parent's approval.
 *
 * UNDER `/auth` DELIBERATELY, and not at `/guardian/waiting`. Two reasons:
 *
 *   1. `/guardian/[token]` is the parent's consent page, and hanging a static
 *      sibling off the same segment puts a route the child can reach next to
 *      one addressed by a secret. Keeping them apart means no URL a child sees
 *      ever looks like a consent link.
 *   2. `auth` is already in the RESERVED username list (src/app/[username]),
 *      so a new top-level segment — and the vanity-URL shadowing that comes
 *      with one — is avoided entirely.
 *
 * Outside `(autheticated)` for the same reason it is outside `(public)`: the
 * child HAS a session by now but is not in the app, and the authenticated
 * layout would wrap this in AppShell and raise the onboarding modal over the
 * top of it — asking a gated minor to pick a position while they wait for
 * permission to exist.
 */

import type { Metadata } from "next"

import WaitingForParent from "@/features/guardian/components/WaitingForParent/WaitingForParent"

export const metadata: Metadata = {
  title: "Waiting for approval · Goatza",
  // Nothing here is worth ranking for, and it concerns a specific child's
  // account.
  robots: { index: false },
}

export default function GuardianWaitingRoute() {
  return <WaitingForParent />
}
