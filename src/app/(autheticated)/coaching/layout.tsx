import RoleGuard from "@/shared/components/auth/RoleGuard"

// Coaching hub is coach-only. Everyone else is redirected to /home.
export default function CoachingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <RoleGuard allow={["coach"]}>{children}</RoleGuard>
}
