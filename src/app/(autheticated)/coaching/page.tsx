import ComingSoonHub from "@/shared/components/ComingSoonHub/ComingSoonHub"

export default function CoachingPage() {
  return (
    <ComingSoonHub
      title="Coaching"
      subtitle="Your coaching workspace — connect, develop, and grow your squad."
      icon="mdi:whistle-outline"
      description="A dedicated space to manage your coaching journey. We're building the tools to help you track players, plan sessions, and connect with clubs."
      features={[
        "Manage and follow your players",
        "Plan and share training sessions",
        "Connect with clubs and academies",
        "Showcase your coaching profile",
      ]}
    />
  )
}
