/**
 * The invite link's page, read without any session.
 *
 * Plain `fetch` for the same reason the parent consent page uses it: the shared
 * axios instance attaches a JWT and X-Actor-* headers from the store, and the
 * person opening this link may have neither. Or may have a session acting as a
 * club they have since been removed from, which would answer 403 to a page that
 * needs no identity at all.
 *
 * THE TOKEN IS THE CREDENTIAL: path-encoded, never logged, never in a query.
 */

import { apiBase } from "@/shared/services/apiBase"

import type { OrgMemberRole } from "@/features/organization/types"

export type OrgInviteView = {
  organization: { name: string; username: string; logo: string }
  role: OrgMemberRole
  invited_by_name: string
  email_masked: string
  status: "pending"
}

/**
 * The invite, or null for a link that does not resolve. The server gives one 404
 * for unknown, expired, used and cancelled, so that is the answer and not an
 * error. A thrown error means the request never completed, which a retry can fix.
 */
export async function fetchOrgInvite(token: string): Promise<OrgInviteView | null> {
  const res = await fetch(
    `${apiBase()}/organizations/invites/token/${encodeURIComponent(token)}`,
    { headers: { Accept: "application/json" } }
  )

  if (res.status === 404) return null
  if (!res.ok) throw new Error("org_invite_unavailable")

  const body = (await res.json()) as { data?: OrgInviteView }
  return body.data ?? null
}
