"use client"

import AuthGuard from "@/shared/components/auth/AuthGuard"

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthGuard>{children}</AuthGuard>
}