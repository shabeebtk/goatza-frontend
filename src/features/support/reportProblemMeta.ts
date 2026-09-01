/**
 * The human half of a problem report.
 *
 * The wire values are the backend's `ProblemCategory`; the labels here are the
 * only thing a person ever reads. They are written as symptoms rather than as
 * causes — "Slow or keeps crashing", not "Performance" — because the person
 * filling this in is describing what happened to them, not classifying a bug.
 *
 * ORDER MATTERS. The concrete breakages come first and "Suggestion or feedback"
 * / "Something else" come last: a list that opens with "Other" teaches people to
 * stop reading it, and every report then arrives with no category worth
 * filtering on.
 */

import type { ProblemCategory } from "./services/support.api"

export type ProblemCategoryOption = {
  value: ProblemCategory
  label: string
}

export const PROBLEM_CATEGORIES: ProblemCategoryOption[] = [
  { value: "not_working", label: "Something isn't working" },
  { value: "display_issue", label: "Looks broken or misplaced" },
  { value: "performance", label: "Slow or keeps crashing" },
  { value: "account_login", label: "Login or account issue" },
  { value: "media_upload", label: "Media won't upload or play" },
  { value: "suggestion", label: "Suggestion or feedback" },
  { value: "other", label: "Something else" },
]
