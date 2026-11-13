/**
 * The squad invite link's page, read without any session.
 *
 * Plain `fetch`, like publicOrgInvite.api.ts: the shared axios instance attaches
 * a JWT and X-Actor-* headers from the store, and the person opening a link from
 * a WhatsApp group may have neither.
 *
 * THE TOKEN IS THE CREDENTIAL: path-encoded, never logged, never in a query.
 */

import { apiBase } from "@/shared/services/apiBase"

import type { SquadInviteView } from "../types"

/** A read that failed for a reason the page says something about. */
export class SquadInviteReadError extends Error {
  constructor(public readonly code: "throttled" | "unavailable") {
    super(code === "throttled" ? "squad_invite_throttled" : "squad_invite_unavailable")
    this.name = "SquadInviteReadError"
  }
}

/**
 * The invite, or null for a link that does not resolve: the server gives one 404
 * for a bad token, a link turned off, a deleted squad and a block alike, so that
 * is an answer and not an error.
 */
export async function fetchSquadInvite(token: string): Promise<SquadInviteView | null> {
  const res = await fetch(`${apiBase()}/squads/invite/${encodeURIComponent(token)}`, {
    headers: { Accept: "application/json" },
  })

  if (res.status === 404) return null
  if (res.status === 429) throw new SquadInviteReadError("throttled")
  if (!res.ok) throw new SquadInviteReadError("unavailable")

  const body = (await res.json()) as { data?: SquadInviteView }
  return body.data ?? null
}
