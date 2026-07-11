"use client"

import { use } from "react"
import NetworkPage from "@/features/connections/components/NetworkPage/NetworkPage"

export default function AdminOrgNetworkPage({
  params,
}: {
  params: Promise<{ id: string; username: string }>
}) {
  const { username } = use(params)
  // Organizations have no Connections tab (backend rejects it for orgs).
  return <NetworkPage username={username} profileType="organization" />
}
