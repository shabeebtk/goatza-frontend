import { isAxiosError } from "axios"

import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"

/**
 * A squad refusal: `data.code` is the stable code (apps/squads/errors.py), the
 * message is the server's sentence, and a field error is `data.errors[field]`.
 */
type SquadErrorBody = {
  message?: string
  data?: { code?: string; errors?: Record<string, string> }
}

function body(err: unknown): SquadErrorBody | undefined {
  if (!isAxiosError(err)) return undefined
  return err.response?.data as SquadErrorBody | undefined
}

export function squadErrorCode(err: unknown): string | undefined {
  return body(err)?.data?.code
}

/** The server's message for one field, when it named one. */
export function squadFieldError(err: unknown, field: string): string | undefined {
  const message = body(err)?.data?.errors?.[field]
  return typeof message === "string" && message.trim() ? message : undefined
}

/** Words the sentences can borrow from the screen they are shown on. */
export type SquadErrorContext = {
  /** The squad config's "player" / "players", for a sport that says otherwise. */
  memberNoun?: string
  memberNounPlural?: string
}

/**
 * The sentence for a code, or null to use the server's own message.
 *
 * Left to the server on purpose: not_found, forbidden and not_pending (each
 * means a different thing on different screens, and the server's sentence says
 * which), the three limits (the server's carries the number), and the rare
 * validation codes (invalid_field, invalid_reason, invalid_application).
 */
function sentenceFor(code: string | undefined, ctx: SquadErrorContext): string | null {
  const noun = ctx.memberNoun || "player"
  const nounPlural = ctx.memberNounPlural || "players"

  switch (code) {
    case "switch_to_org":
      return "Switch to your club's account to do that."
    case "switch_to_personal":
      return "Switch to your personal account to do that."
    case "squad_limit":
      return "You can have up to 50 squads."
    case "name_taken":
      return "You already have a squad with this name."
    case "invalid_name":
      return "Give the squad a name of 2 to 80 characters."
    case "invalid_sport":
      return "Choose a sport for this squad."
    case "sport_locked":
      return `The sport can't change once the squad has ${nounPlural}.`
    case "invalid_photo":
      return "This photo couldn't be used. Try another one."
    case "already_staff":
      return "They're already on this squad's staff."
    case "invalid_staff":
      return "Choose an active member of your club."
    case "member_limit":
      return `This squad is full (100 ${nounPlural}).`
    case "already_member":
      return "They're already in this squad."
    case "already_requested":
      return "They've already asked to join this squad."
    case "already_invited":
      return "They already have an invite to this squad."
    case "not_a_player":
      return "Only player accounts can join squads."
    case "cannot_add":
      return `Couldn't add this ${noun}.`
    case "invalid_position":
      return "Choose a position for this squad's sport."
    case "invalid_jersey":
      return "Shirt numbers go from 1 to 99."
    case "jersey_taken":
      return `Another ${noun} in this squad has that number.`
    case "not_active":
      return "They're no longer in this squad."
    case "sport_mismatch":
      return "They can only move to a squad of the same sport."
    case "same_squad":
      return "They're already in that squad."
    case "invite_closed":
      return "This invite isn't available any more."
    case "throttled":
      return "Too many tries. Try again later."
    default:
      return null
  }
}

/**
 * A server refusal, in a sentence. Anything without an entry here falls back to
 * the server's own message, which is always written for people.
 */
export function squadErrorSentence(err: unknown, ctx: SquadErrorContext = {}): string {
  return sentenceFor(squadErrorCode(err), ctx) ?? getApiErrorMessage(err)
}

/** The same, for one player's refusal inside a batch answer (`failed[]`). */
export function squadFailureSentence(
  failure: { code: string; message: string },
  ctx: SquadErrorContext = {}
): string {
  return sentenceFor(failure.code, ctx) ?? failure.message
}
