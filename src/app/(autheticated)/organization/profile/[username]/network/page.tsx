"use client"

import { use } from "react"
import NetworkPage from "@/features/connections/components/NetworkPage/NetworkPage"

export default function OrgNetworkPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = use(params)
  // Organizations have no Connections tab (backend rejects it for orgs).
  return <NetworkPage username={username} profileType="organization" />
}
