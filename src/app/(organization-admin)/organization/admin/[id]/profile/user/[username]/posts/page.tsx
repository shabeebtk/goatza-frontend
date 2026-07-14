"use client"

import { use } from "react"
import { BackHeader } from "@/shared/components/ui"
import PostsList from "@/features/posts/components/PostsList/PostsList.tsx"

export default function UserPostsPage({
  params,
}: {
  params: Promise<{ id: string; username: string }>
}) {
  const { id, username } = use(params)

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "var(--space-4)" }}>
      <BackHeader
        title="Posts"
        fallback={`/organization/admin/${id}/profile/user/${username}`}
      />

      <PostsList
        username={username}
        type="user"
      />
    </div>
  )
}
