import api from "@/core/api/axios"
import type { Recruitment } from "./recruitments.api"

// ── Saved card ────────────────────────────────────────────────

/**
 * A shortlisted recruitment: the ordinary card plus WHEN it was saved.
 *
 * Same flat shape the list endpoints return, on purpose — RecruitmentCard
 * renders a saved row with no branch of its own.
 */
export type SavedRecruitment = Recruitment & {
  /** ISO 8601. Only this list carries it. */
  saved_at: string
}

export type SavedRecruitmentsResponse = {
  count: number
  limit: number
  offset: number
  results: SavedRecruitment[]
}

export type FetchSavedRecruitmentsParams = {
  limit?: number
  offset?: number
}

/**
 * The ACTIVE ACTOR's shortlist. Scoping happens entirely through the
 * X-Actor-* headers the axios client already attaches — an org-admin shell
 * gets the org's saves from this exact call, with no extra param.
 */
export const fetchSavedRecruitmentsApi = async (
  params: FetchSavedRecruitmentsParams
): Promise<SavedRecruitmentsResponse> => {
  const res = await api.get("/recruitments/saved/list", { params })
  return res.data.data
}

// ── Toggle ────────────────────────────────────────────────────

export type ToggleSaveRecruitmentResponse = {
  recruitment_id: string
  /** The state AFTER the toggle — the server's answer, not a guess. */
  is_saved: boolean
}

export const toggleSaveRecruitmentApi = async (
  recruitmentId: string
): Promise<ToggleSaveRecruitmentResponse> => {
  const res = await api.post(`/recruitments/${recruitmentId}/save`)
  return res.data.data
}
