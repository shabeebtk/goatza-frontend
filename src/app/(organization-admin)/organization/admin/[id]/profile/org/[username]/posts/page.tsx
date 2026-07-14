"use client"

import { use } from "react"
import { BackHeader } from "@/shared/components/ui"
import PostsList from "@/features/posts/components/PostsList/PostsList.tsx"
import { useAuthStore } from "@/store/auth.store"

export default function OrgPostsPage({
  params,
}: {
  params: Promise<{ id: string; username: string }>
}) {
  const { id, username } = use(params)
  const currentOrganization = useAuthStore((s) => s.currentOrganization)

  // Own org posts live at /organization/admin/[id]/posts; this route is for
  // viewing another org's posts, but stay correct if it's the active org.
  const isOwn = currentOrganization?.username === username

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "var(--space-4)" }}>
      <BackHeader
        title="Posts"
        fallback={`/organization/admin/${id}/profile/org/${username}`}
      />

      <PostsList
        username={username}
        type="organization"
        isOwn={isOwn}
      />
    </div>
  )
}
