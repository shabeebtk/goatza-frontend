"use client"

import { use } from "react"
import RecruitmentsList from "@/features/recruitments/components/RecruitmentsList/RecruitmentsList"

export default function UserPostsPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = use(params)

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "var(--space-4)" }}>
      <RecruitmentsList
        username={username}
        showOrg={true}
      />
    </div>
  )
}
