"use client"

import { use } from "react"
import NetworkPage from "@/features/connections/components/NetworkPage/NetworkPage"

export default function AdminUserNetworkPage({
  params,
}: {
  params: Promise<{ id: string; username: string }>
}) {
  const { username } = use(params)
  return <NetworkPage username={username} profileType="user" />
}
