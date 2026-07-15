import RoleGuard from "@/shared/components/auth/RoleGuard"

// Recruitments is enabled for player + org_user only. Coach/scout don't have
// this feature yet and are redirected to /home.
export default function RecruitmentsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <RoleGuard allow={["player", "org_user"]}>{children}</RoleGuard>
}
