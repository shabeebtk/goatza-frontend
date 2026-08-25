import api from "@/core/api/axios"

// ── Types ────────────────────────────────────────────────────

/**
 * The upload types the backend will sign for.
 *
 * Mirrors `MediaUploadType` in `@/shared/services/mediaUpload`, which is what
 * the actual upload plumbing uses — this copy exists so a feature hook can name
 * a type without `shared/` having to import from `features/`.
 *
 * "matches" is the match diary photo — user-only, scoped server-side to
 * users/<id>/matches, exactly like "achievements".
 */
export type UploadType =
  | "profile"
  | "cover"
  | "posts"
  | "organization_logo"
  | "organization_cover"
  | "recruitments"
  | "chat"
  | "achievements"
  | "matches"

export type UpdateMediaPayload = {
  profile_photo?: string
  profile_photo_public_id?: string
  cover_photo?: string
  cover_photo_public_id?: string
}

// ── Attach: save the uploaded URL + key to the profile ────────
//
// The upload itself (presigned config + PUT) lives in
// `@/shared/services/mediaUpload`. This module only records the result.

export const updateMediaApi = async (
  payload: UpdateMediaPayload
): Promise<void> => {
  await api.post("/user/update/profile/cover", payload)
}
