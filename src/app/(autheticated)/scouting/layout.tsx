import RoleGuard from "@/shared/components/auth/RoleGuard"

// Scouting hub is scout-only. Everyone else is redirected to /home.
export default function ScoutingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <RoleGuard allow={["scout"]}>{children}</RoleGuard>
}
