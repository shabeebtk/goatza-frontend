"use client";

/**
 * Auth-guarded shell for organization admin pages.
 * Uses OrgShell which renders OrgNav (org top bar + bottom tab bar).
 *
 * Route: /organization/admin/[id]/...
 */

import AuthGuard from "@/shared/components/auth/AuthGuard";
import ActorRouteSync from "@/shared/components/auth/ActorRouteSync";
import OrgShell from "@/shared/components/layout/OrgShell/OrgShell";

interface OrgAdminLayoutProps {
  children: React.ReactNode;
  params: { id: string };
}

export default function OrgAdminLayout({
  children,
  params,
}: OrgAdminLayoutProps) {
  return (
    <AuthGuard>
      <OrgShell orgId={params.id}>
        <ActorRouteSync />
        {children}
      </OrgShell>
    </AuthGuard>
  );
}