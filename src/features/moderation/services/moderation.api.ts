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
