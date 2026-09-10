/**
 * Every sentence a parent or a child reads during the guardian flow.
 *
 * ONE FILE, because the same three things — what Goatza is, what we hold, and
 * the 18-or-older line — appear on four separate screens: the hand-the-phone
 * step, the waiting screen, the emailed consent page, and the approved state of
 * that page. Four copies would drift, and the sentence a parent agreed to on
 * one screen would stop matching the one shown on another.
 *
 * TWO RULES, both deliberate:
 *
 *   1. NO LEGAL TERMS. Not "data fiduciary", not "verifiable consent", not
 *      "processing" as a noun. A parent reading this on a phone in a car park
 *      has about fifteen seconds, and a child is reading over their shoulder.
 *      The policy pages carry the formal wording; these screens carry the
 *      meaning.
 *   2. "PARENT OR GUARDIAN", always both, always in that order. Not "parent"
 *      alone — plenty of the adults who tap Approve are grandparents, aunts and
 *      legal guardians, and a screen that only names parents reads as one they
 *      are not allowed to use.
 */

/** One line on what this is. Shown to the parent before anything is asked. */
export const WHAT_GOATZA_IS =
  "Goatza is where young athletes build a sports profile and find trials."

/**
 * What we hold about a young player, in the words a parent would use.
 *
 * Grouped rather than exhaustive: the privacy policy's table has sixteen rows,
 * and a sixteen-row list on a phone gets scrolled past rather than read. Each
 * line here covers a real group of that table, and none of it is softened —
 * "messages they send" is the message content, and it says so.
 */
export const GUARDIAN_DATA_LIST = [
  "Their name, date of birth and email",
  "Their sports profile — sport, position, clubs and stats",
  "Photos, videos and posts they share",
  "Messages they send to other people on Goatza",
  "The city they choose to show",
] as const

/**
 * The confirmation. Wording fixed by the task and repeated identically on both
 * screens that ask for it, so the record and the screen always agree.
 */
export const CONFIRM_18_LABEL =
  "I am the parent or guardian and I am 18 or older"

/** Why the optional date of birth is there. Asked for, never required. */
export const PARENT_DOB_HINT = "Optional. It helps us confirm it was you."

/** What Approve actually does, said once, right above the button. */
export const APPROVE_MEANING =
  "Approving lets them use Goatza. You can remove your permission later."

/** The heading on the hand-the-phone step. */
export const HAND_TO_PARENT_HEADING = "Hand the phone to your parent"

/** Shown under that heading, to the child, before they pass the phone over. */
export const HAND_TO_PARENT_SUBHEADING =
  "A parent or guardian needs to say yes before you can start."

/**
 * The relocked account — a parent approved once and then removed it.
 *
 * Kept apart from the first-time wording because the two are not the same
 * message to a fifteen-year-old, and the backend keeps the two statuses apart
 * for exactly this reason (`withdrawn` vs `pending` in
 * accounts.models.User.GuardianConsentStatus). "Ask a parent or guardian" to
 * somebody whose parent has just said no reads as though nothing happened.
 *
 * It does NOT say why. We do not know why, and guessing on a screen the parent
 * may be standing next to is worse than saying nothing.
 */
export const WITHDRAWN_HEADING = "Permission was removed"

export const WITHDRAWN_SUBHEADING =
  "A parent or guardian removed their permission. To use Goatza again, ask them to approve."
