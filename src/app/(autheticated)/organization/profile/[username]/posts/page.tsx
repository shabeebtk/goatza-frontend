"use client"

import { use } from "react"
import PostsList from "@/features/posts/components/PostsList/PostsList.tsx"

export default function UserPostsPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = use(params)

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "var(--space-4)" }}>
      <PostsList
        username={username}
      />
    </div>
  )
}
