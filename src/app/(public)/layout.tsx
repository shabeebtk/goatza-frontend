/**
 * Layout for the routes that open for anyone — profiles, logged in or not.
 *
 * Deliberately NOT a client component and deliberately NOT wrapped in
 * <AuthGuard>. Two reasons, and both are load-bearing:
 *
 *   1. AuthGuard redirects to /auth the moment it sees an unauthenticated
 *      visitor, which is exactly the behaviour a public profile must not have.
 *   2. A `"use client"` layout would stop its children from exporting
 *      `generateMetadata`, and the whole point of moving these routes here is
 *      the Open Graph card that makes a shared link worth opening.
 *
 * Everything that needs browser state lives one level down in <PublicShell>,
 * which picks the authenticated shell or the anonymous one.
 */

import PublicShell from "@/shared/components/layout/PublicShell/PublicShell"

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <PublicShell>{children}</PublicShell>
}
