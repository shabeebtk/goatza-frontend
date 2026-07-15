import ComingSoonHub from "@/shared/components/ComingSoonHub/ComingSoonHub"

export default function ScoutingPage() {
  return (
    <ComingSoonHub
      title="Scouting"
      subtitle="Your scouting workspace — discover, track, and shortlist talent."
      icon="mdi:binoculars"
      description="A dedicated space to find and follow the players that matter to you. We're building the tools to help you discover talent, build watchlists, and share reports."
      features={[
        "Discover players across sports",
        "Build and organize watchlists",
        "Track prospects over time",
        "Share scouting reports",
      ]}
    />
  )
}
