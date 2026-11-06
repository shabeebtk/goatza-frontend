import { isAxiosError } from "axios"

import { getApiErrorMessage } from "@/core/api/getApiErrorMessage"

/** The refusal's stable code (apps/organization/views/organization_member_views.py). */
export function orgMemberErrorCode(err: unknown): string | undefined {
  if (!isAxiosError(err)) return undefined
  return (err.response?.data as { data?: { code?: string } } | undefined)?.data?.code
}

/**
 * A server refusal, in a sentence for this screen. Anything without an entry here
 * falls back to the server's own message, which is always written for people.
 */
export function orgMemberErrorSentence(err: unknown, orgName: string): string {
  switch (orgMemberErrorCode(err)) {
    case "last_owner":
      return `${orgName} needs at least one owner.`
    case "already_member":
      return "This person is already a member."
    case "already_invited":
      return "This person already has a pending invite."
    case "member_limit":
      return `${orgName} has reached its limit of 50 members.`
    case "invite_limit":
      return "You can have up to 20 pending invites. Cancel one to send another."
    case "invite_not_pending":
      return "This invite is no longer available."
    case "cannot_remove_self":
      return "You can't remove yourself. Leave the organization instead."
    default:
      return getApiErrorMessage(err)
  }
}
