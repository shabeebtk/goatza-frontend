"use client";

import { use } from "react";
import AuthGuard from "@/shared/components/auth/AuthGuard";
import ActorRouteSync from "@/shared/components/auth/ActorRouteSync";
import OrgShell from "@/shared/components/layout/OrgShell/OrgShell";
import OrgMemberGuard from "@/shared/components/auth/OrgMemberGuard";

interface OrgAdminLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default function OrgAdminLayout({
  children,
  params,
}: OrgAdminLayoutProps) {
  const { id } = use(params);

  return (
    <AuthGuard>
      <OrgMemberGuard orgId={id}>
        <OrgShell orgId={id}>
          <ActorRouteSync />
          {children}
        </OrgShell>
      </OrgMemberGuard>
    </AuthGuard>
  );
}