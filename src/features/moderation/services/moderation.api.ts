import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

/** Kind of identity a block points at — the dual-actor pair, as everywhere. */
export type BlockTargetType = "user" | "organization"

/**
 * The body BOTH verbs take. POST blocks, DELETE unblocks — one resource, one
 * shape, so the client can fire either without first reading current state.
 */
export type BlockPayload = {
  target_type: BlockTargetType
  target_id: string
}

/** The blocked identity, rendered by the shared actor row like anywhere else. */
export type BlockedActor = {
  id: string
  username: string
  name: string
  avatar: string
  type: BlockTargetType
}

/** One row of the blocked list. Only the BLOCKED side is returned — the
 *  blocker is always the caller, so echoing it back would be noise. */
export type BlockedItem = {
  id: string
  created_at: string
  blocked: BlockedActor
}

export type BlockedListResponse = {
  count: number
  limit: number
  offset: number
  has_more: boolean
  results: BlockedItem[]
}

/** Both writes are idempotent server-side, and say which case they hit. */
export type BlockResult = {
  is_blocked: boolean
  already_blocked?: boolean
  was_blocked?: boolean
}

export type FetchBlockedListParams = {
  limit?: number
  offset?: number
}

// ── API ──────────────────────────────────────────────────────

export const blockApi = async (payload: BlockPayload): Promise<BlockResult> => {
  const res = await api.post("/moderation/block", payload)
  return res.data.data
}

/**
 * DELETE with a body — the backend reads the same target_type/target_id pair
 * it does for POST, so axios has to send `data`, not `params`.
 */
export const unblockApi = async (
  payload: BlockPayload
): Promise<BlockResult> => {
  const res = await api.delete("/moderation/block", { data: payload })
  return res.data.data
}

export const fetchBlockedListApi = async (
  params: FetchBlockedListParams = {}
): Promise<BlockedListResponse> => {
  const res = await api.get("/moderation/blocked", { params })
  return res.data.data
}

// ── Report ───────────────────────────────────────────────────

/**
 * What a report can point at. A superset of BlockTargetType: you block an
 * ACCOUNT, but you report the specific thing you saw — which is usually a post
 * or a message, not the person behind it.
 */
export type ReportTargetType =
  | "user"
  | "organization"
  | "post"
  | "comment"
  | "message"
  | "recruitment"

/** The ten categories, exactly as the backend's ReportCategory spells them. */
export type ReportCategory =
  | "spam"
  | "harassment"
  | "hate_speech"
  | "nudity_sexual"
  | "violence"
  | "scam_fraud"
  | "impersonation_fake"
  | "minor_safety"
  | "self_harm"
  | "other"

export type ReportPayload = {
  target_type: ReportTargetType
  target_id: string
  category: ReportCategory
  details?: string
}

/**
 * `already_reported` is a SUCCESS, not an error: filing a second report on
 * something you already reported returns the first one untouched. The sheet
 * shows the same thank-you either way — telling someone their report was a
 * duplicate serves nobody and reads as a rejection.
 */
export type ReportResult = {
  report_id: string
  already_reported: boolean
  status: string
  is_priority: boolean
}

export const reportTargetApi = async (
  payload: ReportPayload
): Promise<ReportResult> => {
  const res = await api.post("/moderation/report", payload)
  return res.data.data
}
