"use client"

import { use } from "react"
import NetworkPage from "@/features/connections/components/NetworkPage/NetworkPage"

export default function UserNetworkPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = use(params)
  return <NetworkPage username={username} profileType="user" />
}
