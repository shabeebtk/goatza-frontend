/**
 * Every sentence a parent or a child reads during the guardian flow.
 *
 * ONE FILE, because the same three things — what Goatza is, what we hold, and
 * the 18-or-older line — appear on more than one screen: the details step, the
 * waiting screen, the emailed consent page, and the approved state of that
 * page. Separate copies would drift, and the sentence a parent agreed to on
 * one screen would stop matching the one shown on another.
 *
 * TWO RULES, both deliberate:
 *
 *   1. NO LEGAL TERMS. Not "data fiduciary", not "verifiable consent", not
 *      "processing" as a noun. A parent reading this on a phone in a car park
 *      has about fifteen seconds, and a child is reading over their shoulder.
 *      The policy pages carry the formal wording; these screens carry the
 *      meaning. User-facing copy says "permission", never "consent".
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
 * The confirmation. Wording fixed by the task and shown on the one screen that
 * asks for it, so the record and the screen always agree.
 */
export const CONFIRM_18_LABEL =
  "I am the parent or guardian and I am 18 or older"

/** What Approve actually does, said once, right above the button. */
export const APPROVE_MEANING =
  "Approving lets them use Goatza. You can remove your permission later."

/** Why the child is being asked for a parent at all. Under the details heading. */
export const PERMISSION_NEEDED_SUBHEADING =
  "A parent or guardian needs to say yes before you can start."

/**
 * Under the email field on the details step. The address they signed up
 * with is allowed — some families share one — and saying so stops a child
 * inventing a second address to get past the form.
 */
export const PARENT_EMAIL_HINT =
  "Use an email your parent or guardian checks. It can be the one you signed up with."

/**
 * The waiting screen, when the link went to the child's own sign-up address.
 * There is no second inbox to go and check, so the screen must not imply one.
 * The masked address is slotted in by the screen.
 */
export const SAME_EMAIL_WAITING_NOTE =
  "We sent the email to the address you signed up with"

export const SAME_EMAIL_WAITING_ACTION =
  "Ask your parent or guardian to open it and tap Approve."

/** The status check came back and nothing has changed yet. */
export const NOT_APPROVED_YET =
  "Not approved yet — ask them to check their email, including spam."

/**
 * The parent said no. It does NOT say why — we do not know why, and guessing
 * on a screen the parent may be standing next to is worse than saying nothing.
 * The way forward is a new request: the same parent again, or somebody else.
 */
export const DECLINED_HEADING = "Your parent or guardian didn't approve"

export const DECLINED_SUBHEADING =
  "You can ask them again, or ask a different parent or guardian."

/** The link lapsed before anybody opened it. A fresh email is the fix. */
export const EXPIRED_HEADING = "That email has expired"

export const EXPIRED_SUBHEADING =
  "Permission links only work for a few days. Send a new email and ask your parent or guardian to open it soon."

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
