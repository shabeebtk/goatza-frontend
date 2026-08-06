import type { Metadata } from "next"
import MentionsList from "@/features/posts/components/MentionsList/MentionsList"

export const metadata: Metadata = {
  title: "Mentions · Goatza",
}

// Same list the user settings page renders. Inside the org-admin shell the
// actor headers are already the org, so /posts/mentions/my returns the ORG's
// mentions with no extra wiring.
export default function OrgMentionsPage() {
  return <MentionsList />
}
