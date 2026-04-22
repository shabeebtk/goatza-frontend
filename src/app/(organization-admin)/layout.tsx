"use client";

import AuthGuard from "@/shared/components/auth/AuthGuard";
import ActorRouteSync from "@/shared/components/auth/ActorRouteSync";
import OrgShell from "@/shared/components/layout/OrgShell/OrgShell";

interface OrgAdminLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function OrgAdminLayout({
  children,
  params,
}: OrgAdminLayoutProps) {
  const { id } = await params;

  return (
    <AuthGuard>
      <OrgShell orgId={id}>
        <ActorRouteSync />
        {children}
      </OrgShell>
    </AuthGuard>
  );
}