/**
 * The human half of a report.
 *
 * The wire values are the backend's `ReportCategory`; the labels here are the
 * only place a person ever sees them. Two of the ten are worded deliberately:
 *
 *   - `minor_safety` reads "Involves a child's safety", not "Minor safety".
 *     "Minor" is ambiguous in English — it also means "small" — and this is the
 *     one category that must never be misread as "this is a small problem".
 *   - `other` reads "Something else", because a radio list whose last option is
 *     "Other" makes people who don't see their exact case abandon the form.
 *
 * Order matches the sheet: the everyday reasons first, the severe ones last, so
 * the list reads as escalating rather than alphabetical.
 */

import type { ReportCategory, ReportTargetType } from "./services/moderation.api"

export type ReportCategoryOption = {
  value: ReportCategory
  label: string
}

export const REPORT_CATEGORIES: ReportCategoryOption[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate_speech", label: "Hate speech" },
  { value: "nudity_sexual", label: "Nudity or sexual content" },
  { value: "violence", label: "Violence" },
  { value: "scam_fraud", label: "Scam or fraud" },
  { value: "impersonation_fake", label: "Fake profile / impersonation" },
  { value: "minor_safety", label: "Involves a child's safety" },
  { value: "self_harm", label: "Self-harm" },
  { value: "other", label: "Something else" },
]

/** What the sheet calls the thing being reported, in its heading. */
export const REPORT_TARGET_NOUN: Record<ReportTargetType, string> = {
  user: "account",
  organization: "account",
  post: "post",
  comment: "comment",
  message: "message",
  recruitment: "recruitment",
}
