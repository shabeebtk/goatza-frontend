import type { CommentActor } from "@/features/posts/services/posts.api"

type AuthorType = "user" | "organization"

/**
 * Resolve whether a comment/reply author is a user or organization.
 * Top-level comments carry an explicit `actor_type`; replies don't, so we fall
 * back to detecting the org-only `type` field on the actor.
 */
export function resolveCommentAuthorType(
  actor: Pick<CommentActor, "type">,
  explicit?: string,
): AuthorType {
  if (explicit === "organization" || explicit === "user") return explicit
  return actor.type ? "organization" : "user"
}

/** Avatar URL for a comment/reply author — `profile_photo` (user) or `logo` (org). */
export function commentActorAvatar(
  actor: Pick<CommentActor, "profile_photo" | "logo">,
): string | undefined {
  return actor.profile_photo || actor.logo || undefined
}
