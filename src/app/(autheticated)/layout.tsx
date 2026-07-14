"use client";
import ActorRouteSync from "@/shared/components/auth/ActorRouteSync";
/**
 * Auth-guarded shell for all post-login pages.
 * AppShell renders AppNav (top bar + bottom tab bar) and offsets content.
 */
import AuthGuard from "@/shared/components/auth/AuthGuard";
import AppShell from "@/shared/components/layout/AppShell/AppShell";
import ThemeColorMeta from "@/shared/components/ThemeColorMeta/ThemeColorMeta";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ThemeColorMeta />
      <AuthGuard>
        <AppShell>
          <ActorRouteSync />
          {children}
        </AppShell>
      </AuthGuard>
    </>
  );
}