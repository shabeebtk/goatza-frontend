"use client"

import { use } from "react"
import { BackHeader } from "@/shared/components/ui"
import PostsList from "@/features/posts/components/PostsList/PostsList.tsx"
import { useAuthStore } from "@/store/auth.store"

export default function UserPostsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const currentOrganization = useAuthStore((s) => s.currentOrganization)
  const organizations = useAuthStore((s) => s.organizations)

  const organization =
    currentOrganization?.id === id
      ? currentOrganization
      : organizations.find((org) => org.id === id)

  if (!organization?.username) return null

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "var(--space-4)" }}>
      <BackHeader title="Posts" fallback={`/organization/admin/${id}/dashboard`} />

      <PostsList
        username={organization.username}
        type="organization"
        isOwn
      />
    </div>
  )
}
