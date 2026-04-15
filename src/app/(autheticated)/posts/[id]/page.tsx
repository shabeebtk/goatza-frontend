"use client"
 
import { use } from "react"
import PostsList from "@/features/posts/components/PostsList/PostsList.tsx"
import { Icon } from "@iconify/react"
import Link from "next/link"

import { useRouter } from "next/navigation"

export default function SinglePostPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
 
  const handleBack = () => {
    if (window.history.length > 2) {
      router.back()
    } else {
      router.push("/home")
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "var(--space-4)" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: "var(--space-4)" }}>
        <button onClick={handleBack} style={{ cursor: "pointer", border: "none", display: "flex", alignItems: "center", color: "var(--color-text-secondary)", backgroundColor: "var(--color-surface-raised)", borderRadius: "50%", padding: 8, marginRight: 12 }}>
          <Icon icon="mdi:arrow-left" width={24} height={24} />
        </button>
        <h1 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--weight-bold)", color: "var(--color-ink)" }}>Post</h1>
      </div>
      <PostsList postId={id} />
    </div>
  )
}
