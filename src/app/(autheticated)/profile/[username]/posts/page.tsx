"use client"
 
import { use, useState } from "react"
import { useAuthStore } from "@/store/auth.store"
import PostsList from "@/features/posts/components/PostsList/PostsList.tsx"
import CreatePostModal from "@/features/posts/components/CreatePostModal/CreatePostModal"
 
export default function UserPostsPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = use(params)
  const me    = useAuthStore((s) => s.user)
  const isOwn = me?.username === username
 
  const [postModalOpen, setPostModalOpen] = useState(false)
 
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "var(--space-4)" }}>
      <PostsList
        username={username}
        isOwn={isOwn}
        onCreatePost={() => setPostModalOpen(true)}
      />
 
      {postModalOpen && me && (
        <CreatePostModal
          username={me.username}
          userAvatarUrl={me.profile_photo}
          userInitials={me.name?.slice(0, 2).toUpperCase()}
          onClose={() => setPostModalOpen(false)}
        />
      )}
    </div>
  )
}
 