"use client";
/**
 * Auth-guarded shell for all post-login pages.
 * AppShell renders AppNav (top bar + bottom tab bar) and offsets content.
 */
import AuthGuard from "@/shared/components/auth/AuthGuard";
import AppShell from "@/shared/components/layout/AppShell/AppShell";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <AppShell>
        {children}
      </AppShell>
    </AuthGuard>
  );
}