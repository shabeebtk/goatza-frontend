"use client"

import { use, useState } from "react"
import { BackHeader } from "@/shared/components/ui"
import PostsList from "@/features/posts/components/PostsList/PostsList.tsx"
import CreatePostModal from "@/features/posts/components/CreatePostModal/CreatePostModal"
import { useAuthStore } from "@/store/auth.store"

export default function UserPostsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const currentOrganization = useAuthStore((s) => s.currentOrganization)
  const organizations = useAuthStore((s) => s.organizations)

  const [postModalOpen, setPostModalOpen] = useState(false)

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
        onCreatePost={() => setPostModalOpen(true)}
      />

      {postModalOpen && (
        <CreatePostModal
          username={organization.username}
          userAvatarUrl={organization.logo}
          userInitials={organization.name?.slice(0, 2).toUpperCase()}
          displayName={organization.name}
          onClose={() => setPostModalOpen(false)}
        />
      )}
    </div>
  )
}
