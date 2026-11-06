import { isTrialOver, type TrialTiming } from "./trialEnded"

export type ShareableRecruitment = TrialTiming & {
  /** The server's answer for this viewer. Missing on payloads cached before it shipped. */
  can_share?: boolean | null
  status?: string
  is_accepting_applications?: boolean
  is_deleted?: boolean
}

/**
 * Whether to offer sharing at all: a recruitment is shared only while it is live.
 * Every share control asks here, so no screen keeps its own rule. The server has
 * the last word (`failed[]` with `not_shareable`), for one that closes between
 * this render and the tap.
 *
 * Without a server answer: active, still taking applications, trial not over.
 */
export function canShareRecruitment(
  recruitment: ShareableRecruitment | null | undefined
): boolean {
  if (!recruitment) return false

  if (typeof recruitment.can_share === "boolean") return recruitment.can_share

  return (
    recruitment.status === "active" &&
    recruitment.is_accepting_applications !== false &&
    !isTrialOver(recruitment) &&
    !recruitment.is_deleted
  )
}
