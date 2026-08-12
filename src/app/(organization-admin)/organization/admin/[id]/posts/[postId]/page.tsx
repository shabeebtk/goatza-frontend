"use client"

import { use } from "react"
import { BackHeader } from "@/shared/components/ui"
import PostsList from "@/features/posts/components/PostsList/PostsList.tsx"

/**
 * A single post inside the org-admin space.
 *
 * The personal /posts/[id] page renders the same thing, but landing there as an
 * org admin switches the active actor back to the person (the client reads the
 * URL to decide who you are acting as). This route is what lets a like/comment
 * notification on an org post open without that flip.
 */
export default function OrgPostPage({
  params,
}: {
  params: Promise<{ id: string; postId: string }>
}) {
  const { id, postId } = use(params)

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "var(--space-4)" }}>
      <BackHeader title="Post" fallback={`/organization/admin/${id}/dashboard`} />

      <PostsList postId={postId} />
    </div>
  )
}
